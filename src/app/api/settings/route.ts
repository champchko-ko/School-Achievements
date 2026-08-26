// src/app/api/settings/route.ts
// GET: Read settings (adminPin is stripped for non-admin requests)
// PUT: Update settings (admin session required)

import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../lib/admin-session';
import { sanitizeSettingsPayload } from '../../../lib/sanitize';
import { getAdminDb, doc, getDoc, setDoc } from '../../../lib/firebase-admin';


export async function GET() {
  try {
    const db = getAdminDb();

    const docSnap = await getDoc(doc(db, "settings", "global_info"));
    
    if (!docSnap.exists()) {
      return NextResponse.json({});
    }

    const data = docSnap.data();
    const isAdmin = await isAdminSession();

    // Strip adminPin for non-admin users
    if (!isAdmin && data.adminPin) {
      const { adminPin, ...safeData } = data;
      return NextResponse.json(safeData);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Settings GET error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const rawBody = await request.json();
    // Sanitize all user-supplied text fields
    const body = sanitizeSettingsPayload(rawBody);

    const db = getAdminDb();
    const { pbkdf2Sync } = await import('crypto');

    // If admin PIN is provided, hash it and store in protected admin/pinConfig doc
    if (body.adminPin) {
      const pepper = process.env.PIN_PEPPER || 'school-achievements-default-pepper-change-in-production';
      const salt = `admin-pin-${pepper}`;
      const hash = pbkdf2Sync(body.adminPin, salt, 10000, 64, 'sha512').toString('hex');
      await setDoc(doc(db, "admin", "pinConfig"), { pinHash: hash });
    }

    // Remove adminPin from settings data before saving to the public doc
    const { adminPin, ...settingsData } = body;

    // Save settings (merge to preserve fields)
    await setDoc(doc(db, "settings", "global_info"), settingsData);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Settings PUT error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
