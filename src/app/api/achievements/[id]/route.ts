import { NextResponse } from 'next/server';
import { logAchievementDeleted, logAchievementStatusChanged, logError } from '../../../../lib/logger';
import { isAdminSession } from '../../../../lib/admin-session';
import { sanitizeAchievementPayload } from '../../../../lib/sanitize';
import { pbkdf2Sync, timingSafeEqual } from 'crypto';
import { collectAttachmentUrls, destroyCloudinaryAsset } from '../../../../lib/cloudinary';
import { validateDepartmentAndTeacher } from '../../../../lib/validate-lists';
import { checkRateLimit, checkLockout, recordFailedAttempt, resetLockout, resetAchievementLockouts, sleep, getClientIp } from '../../../../lib/rate-limit';
import { getAdminDb, deleteDoc, deleteField, doc, getDoc, setDoc, updateDoc } from '../../../../lib/firebase-admin';

function getPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  return pepper;
}

function verifyPinMatch(pin: string, achievementId: string, storedHash: string): boolean {
  if (!pin || !storedHash || typeof pin !== 'string') return false;
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  
  // 600,000 iterations (MUST-05)
  const hash600k = pbkdf2Sync(pin, salt, 600000, 64, 'sha512').toString('hex');
  if (hash600k.length === storedHash.length && timingSafeEqual(Buffer.from(hash600k), Buffer.from(storedHash))) {
    return true;
  }

  // Fallback for legacy 10,000 iterations hashes
  const hash10k = pbkdf2Sync(pin, salt, 10000, 64, 'sha512').toString('hex');
  if (hash10k.length === storedHash.length && timingSafeEqual(Buffer.from(hash10k), Buffer.from(storedHash))) {
    return true;
  }

  return false;
}

async function queuePendingDeletions(urls: string[]) {
  if (!urls || urls.length === 0) return;
  try {
    const db = getAdminDb();
    await setDoc(doc(db, 'admin', 'pendingDeletions', `pending_${Date.now()}`), {
      urls,
      createdAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to queue pending deletions:', err);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Validate ID format (MUST-13)
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    return NextResponse.json({ error: 'معرّف الإنجاز غير صالح' }, { status: 400 });
  }

  try {
    const ip = getClientIp(request);
    const isAdmin = await isAdminSession();
    const lockKey = `pin-lockout:${id}:${ip}`;

    // Admin session clears lockout; otherwise enforce 5-attempt/15-minute lockout (MUST-04 / Finding #6)
    if (isAdmin) {
      await resetAchievementLockouts(id);
    } else {
      const lockoutStatus = await checkLockout(lockKey);
      if (lockoutStatus.locked) {
        const minutesRemaining = Math.max(1, Math.ceil(lockoutStatus.remainingTimeMs / 60_000));
        return NextResponse.json({ 
          error: `تم إيقاف المحاولات مؤقتاً لمدة ${minutesRemaining} دقيقة بعد عدة محاولات غير صحيحة.`,
          resetAt: lockoutStatus.resetAt 
        }, { status: 429 });
      }
    }

    const rawBody = await request.json();
    // Sanitize all user-supplied text fields
    const body = sanitizeAchievementPayload(rawBody);

    const db = getAdminDb();

    const docSnap = await getDoc(doc(db, 'achievements', id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    // Check authorization: admin session OR correct PIN
    if (!isAdmin) {
      const { pin } = body;
      if (!pin) {
        return NextResponse.json({ error: 'PIN مطلوب لتعديل هذا الإنجاز' }, { status: 401 });
      }
      // Check server-only achievementSecrets collection first, then fallback to document (MUST-03)
      const secretSnap = await getDoc(doc(db, 'admin', 'achievementSecrets', id));
      const storedHash = secretSnap.exists() ? secretSnap.data()?.pinHash : docSnap.data()?.pinHash;
      if (!storedHash) {
        return NextResponse.json({ error: 'لا يوجد رمز حماية لهذا الإنجاز' }, { status: 401 });
      }
      if (!verifyPinMatch(pin, id, storedHash)) {
        const lockout = await recordFailedAttempt(lockKey, {
          maxAttempts: 5,
          lockoutDurationMs: 15 * 60 * 1000,
        });

        await sleep(lockout.attempts * 250);

        if (lockout.locked) {
          return NextResponse.json({ 
            error: 'تم إيقاف المحاولات مؤقتاً لمدة 15 دقيقة بعد 5 محاولات غير صحيحة.',
            resetAt: lockout.resetAt 
          }, { status: 429 });
        }

        return NextResponse.json({ 
          error: 'رمز الحماية غير صحيح!',
          remainingAttempts: Math.max(0, 5 - lockout.attempts)
        }, { status: 401 });
      }

      // Valid PIN verified: reset lockout counter
      await resetLockout(lockKey);
    }

    // Server-side enforcement: department and teacher must be from settings lists
    if ('department' in body || 'teacherName' in body) {
      const listCheck = await validateDepartmentAndTeacher(
        body.department || docSnap.data()?.department || '',
        body.teacherName || docSnap.data()?.teacherName || ''
      );
      if (!listCheck.ok) {
        return NextResponse.json({ error: listCheck.error }, { status: 400 });
      }
      if ('department' in body) body.department = listCheck.department;
      if ('teacherName' in body) body.teacherName = listCheck.teacherName;
    }

    // Build update payload (strip pin from the data)
    const { pin: _, ...updatePayload } = body;

    // Mass assignment prevention: enforce strict whitelist for non-admin updates
    let safeUpdate: Record<string, any> = {};
    if (!isAdmin) {
      const allowedFields = ['title', 'desc', 'department', 'teacherName', 'attachmentUrls', 'date'];
      for (const field of allowedFields) {
        if (field in updatePayload) {
          safeUpdate[field] = updatePayload[field];
        }
      }
    } else {
      const { pinHash: _ignored, ...adminAllowed } = updatePayload;
      safeUpdate = adminAllowed;
    }

    // Determine which attachments were removed by the user and delete them from Cloudinary
    const existingData = docSnap.data();
    const existingUrls = collectAttachmentUrls(existingData);
    const newUrls = Array.isArray(safeUpdate.attachmentUrls)
      ? safeUpdate.attachmentUrls
      : existingUrls;
    const removedUrls = existingUrls.filter(u => !newUrls.includes(u));
    if (removedUrls.length > 0) {
      const results = await Promise.allSettled(removedUrls.map(destroyCloudinaryAsset));
      const failedDeletions: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected' || !(r.value as any)?.ok) {
          failedDeletions.push(removedUrls[i]);
          console.error(`Failed to delete Cloudinary asset ${removedUrls[i]}`);
        }
      });
      if (failedDeletions.length > 0) {
        await queuePendingDeletions(failedDeletions);
      }
    }

    // Save the final attachment list and normalize legacy single-file fields
    const firestoreUpdate: any = { ...safeUpdate, attachmentUrls: newUrls };
    if (existingData?.fileUrl) firestoreUpdate.fileUrl = deleteField();
    if (existingData?.attachmentUrl) firestoreUpdate.attachmentUrl = deleteField();

    await updateDoc(doc(db, 'achievements', id), firestoreUpdate);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Update achievement error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Validate ID format (MUST-13)
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    return NextResponse.json({ error: 'معرّف الإنجاز غير صالح' }, { status: 400 });
  }

  try {
    const ip = getClientIp(request);
    const isAdmin = await isAdminSession();
    const db = getAdminDb();
    const lockKey = `pin-lockout:${id}:${ip}`;

    // Admin session clears lockout; otherwise enforce 5-attempt/15-minute lockout (MUST-04 / Finding #6)
    if (isAdmin) {
      await resetAchievementLockouts(id);
    } else {
      const lockoutStatus = await checkLockout(lockKey);
      if (lockoutStatus.locked) {
        const minutesRemaining = Math.max(1, Math.ceil(lockoutStatus.remainingTimeMs / 60_000));
        return NextResponse.json({ 
          error: `تم إيقاف المحاولات مؤقتاً لمدة ${minutesRemaining} دقيقة بعد عدة محاولات غير صحيحة.`,
          resetAt: lockoutStatus.resetAt 
        }, { status: 429 });
      }
    }

    const docSnap = await getDoc(doc(db, 'achievements', id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    // Authorization: admin session OR correct PIN
    if (!isAdmin) {
      const body = await request.json().catch(() => ({}));
      const { pin } = body;
      if (!pin) {
        return NextResponse.json({ error: 'PIN مطلوب لحذف هذا الإنجاز' }, { status: 401 });
      }
      // Check server-only achievementSecrets collection first, then fallback to document (MUST-03)
      const secretSnap = await getDoc(doc(db, 'admin', 'achievementSecrets', id));
      const storedHash = secretSnap.exists() ? secretSnap.data()?.pinHash : docSnap.data()?.pinHash;
      if (!storedHash) {
        return NextResponse.json({ error: 'لا يوجد رمز حماية لهذا الإنجاز' }, { status: 401 });
      }
      if (!verifyPinMatch(pin, id, storedHash)) {
        const lockout = await recordFailedAttempt(lockKey, {
          maxAttempts: 5,
          lockoutDurationMs: 15 * 60 * 1000,
        });

        await sleep(lockout.attempts * 250);

        if (lockout.locked) {
          return NextResponse.json({ 
            error: 'تم إيقاف المحاولات مؤقتاً لمدة 15 دقيقة بعد 5 محاولات غير صحيحة.',
            resetAt: lockout.resetAt 
          }, { status: 429 });
        }

        return NextResponse.json({ 
          error: 'رمز الحماية غير صحيح!',
          remainingAttempts: Math.max(0, 5 - lockout.attempts)
        }, { status: 401 });
      }

      // Valid PIN verified: reset lockout counter
      await resetLockout(lockKey);
    }

    // Remove the achievement's files from Cloudinary
    const attachmentUrls = collectAttachmentUrls(docSnap.data());
    if (attachmentUrls.length > 0) {
      const results = await Promise.allSettled(attachmentUrls.map(destroyCloudinaryAsset));
      const failedDeletions: string[] = [];
      results.forEach((r, i) => {
        if (r.status === 'rejected' || !(r.value as any)?.ok) {
          failedDeletions.push(attachmentUrls[i]);
          console.error(`Failed to delete Cloudinary asset ${attachmentUrls[i]}`);
        }
      });
      if (failedDeletions.length > 0) {
        await queuePendingDeletions(failedDeletions);
      }
    }

    await deleteDoc(doc(db, 'achievements', id));
    // Also delete secret document if it exists (MUST-03)
    await deleteDoc(doc(db, 'admin', 'achievementSecrets', id)).catch(() => {});
    // Clear any lockout state for this achievement
    await resetAchievementLockouts(id);

    logAchievementDeleted(id, isAdmin, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('api', 'Delete achievement failed', { error: error?.message, achievementId: id }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

