// src/app/api/achievements/[id]/route.ts
// PUT: Update an achievement (admin session OR correct PIN required)
// DELETE: Delete an achievement (admin session required)

import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../../lib/admin-session';
import { sanitizeAchievementPayload } from '../../../../lib/sanitize';
import { pbkdf2Sync } from 'crypto';
import { collectAttachmentUrls, destroyCloudinaryAsset } from '../../../../lib/cloudinary';
import { getAdminDb, deleteDoc, deleteField, doc, getDoc, updateDoc } from '../../../../lib/firebase-admin';

function getPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  return pepper;
}

function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}


export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rawBody = await request.json();
    // Sanitize all user-supplied text fields
    const body = sanitizeAchievementPayload(rawBody);
    const isAdmin = await isAdminSession();

    const db = getAdminDb();

    const docSnap = await getDoc(doc(db, 'achievements', id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    // Check authorization: admin session OR correct PIN
    if (!isAdmin) {
      const { pin, ...updateData } = body;
      if (!pin) {
        return NextResponse.json({ error: 'PIN مطلوب لتعديل هذا الإنجاز' }, { status: 401 });
      }
      const storedHash = docSnap.data()?.pinHash;
      if (!storedHash) {
        return NextResponse.json({ error: 'لا يوجد رمز حماية لهذا الإنجاز' }, { status: 401 });
      }
      const inputHash = hashPin(pin, id);
      if (inputHash !== storedHash) {
        return NextResponse.json({ error: 'رمز الحماية غير صحيح!' }, { status: 401 });
      }
    }

    // Build update payload (strip pin from the data)
    const { pin: _, ...updatePayload } = body;

    // Determine which attachments were removed by the user and delete them from Cloudinary
    const existingData = docSnap.data();
    const existingUrls = collectAttachmentUrls(existingData);
    const newUrls = Array.isArray(updatePayload.attachmentUrls)
      ? updatePayload.attachmentUrls
      : existingUrls;
    const removedUrls = existingUrls.filter(u => !newUrls.includes(u));
    if (removedUrls.length > 0) {
      const results = await Promise.allSettled(removedUrls.map(destroyCloudinaryAsset));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`Failed to delete Cloudinary asset ${removedUrls[i]}:`, r.reason);
        }
      });
    }

    // Save the final attachment list and normalize legacy single-file fields
    const firestoreUpdate: any = { ...updatePayload, attachmentUrls: newUrls };
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
  try {
    const { id } = await params;
    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const db = getAdminDb();

    const docSnap = await getDoc(doc(db, 'achievements', id));
    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    // Remove the achievement's files from Cloudinary (best-effort — never blocks the deletion)
    const attachmentUrls = collectAttachmentUrls(docSnap.data());
    if (attachmentUrls.length > 0) {
      const results = await Promise.allSettled(attachmentUrls.map(destroyCloudinaryAsset));
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          console.error(`Failed to delete Cloudinary asset ${attachmentUrls[i]}:`, r.reason);
        }
      });
    }

    await deleteDoc(doc(db, 'achievements', id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete achievement error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
