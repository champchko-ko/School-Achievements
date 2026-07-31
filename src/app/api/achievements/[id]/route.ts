// src/app/api/achievements/[id]/route.ts
// PUT: Update an achievement (admin session OR correct PIN required)
// DELETE: Delete an achievement (admin session required)

import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../../lib/admin-session';
import { sanitizeAchievementPayload } from '../../../../lib/sanitize';
import { pbkdf2Sync } from 'crypto';

function getPepper(): string {
  return process.env.PIN_PEPPER || 'school-achievements-default-pepper-change-in-production';
}

function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

// --- Cloudinary cleanup helpers ---

// Extracts the public_id and resource type from a Cloudinary URL like
// https://res.cloudinary.com/{cloud}/image/upload/v123/folder/name.jpg
function extractCloudinaryAsset(url: string): { publicId: string; resourceType: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('cloudinary.com')) return null;
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length < 3) return null;
    const resourceType = segments[1];
    if (resourceType !== 'image' && resourceType !== 'video' && resourceType !== 'raw') return null;
    const uploadIdx = segments.indexOf('upload');
    if (uploadIdx === -1) return null;
    const rest = segments.slice(uploadIdx + 1);
    // Skip transformation segments (e.g. fl_attachment, f_auto) until the version segment (v123456)
    let start = 0;
    for (let i = 0; i < rest.length; i++) {
      if (/^v\d+$/.test(rest[i])) {
        start = i + 1;
        break;
      }
    }
    if (start >= rest.length) return null;
    const publicId = rest.slice(start).join('/').replace(/\.[^./]+$/, '');
    if (!publicId) return null;
    return { publicId, resourceType };
  } catch {
    return null;
  }
}

// Deletes a single asset from Cloudinary (best-effort).
async function destroyCloudinaryAsset(url: string): Promise<{ ok: boolean; result?: string }> {
  try {
    const asset = extractCloudinaryAsset(url);
    if (!asset) return { ok: true, result: 'skipped' };
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) return { ok: false, result: 'not-configured' };
    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${asset.resourceType}/destroy`;
    const body = new URLSearchParams({ public_id: asset.publicId });
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    const data = await res.json();
    return { ok: res.ok, result: data?.result || data?.error?.message || 'unknown' };
  } catch (error: any) {
    console.error('Cloudinary destroy error:', error?.message || error);
    return { ok: false, result: 'error' };
  }
}

function collectAttachmentUrls(docData: any): string[] {
  const urls: string[] = [];
  if (Array.isArray(docData?.attachmentUrls)) urls.push(...docData.attachmentUrls);
  if (typeof docData?.fileUrl === 'string') urls.push(docData.fileUrl);
  if (typeof docData?.attachmentUrl === 'string') urls.push(docData.attachmentUrl);
  return Array.from(new Set(urls.filter(Boolean)));
}


export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rawBody = await request.json();
    // Sanitize all user-supplied text fields
    const body = sanitizeAchievementPayload(rawBody);
    const isAdmin = await isAdminSession();

    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, getDoc, updateDoc, deleteField } = await import('firebase/firestore');

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

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

    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, getDoc, deleteDoc } = await import('firebase/firestore');

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

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
