import { NextResponse } from 'next/server';
import { logInfo, logError } from '../../../lib/logger';
import { isAdminSession } from '../../../lib/admin-session';
import { sanitizeSettingsPayload } from '../../../lib/sanitize';
import { getAdminDb, doc, getDoc, setDoc } from '../../../lib/firebase-admin';
import { isValidOrigin } from '../../../lib/csrf';

export async function GET() {
  try {
    const db = getAdminDb();

    const docSnap = await getDoc(doc(db, "settings", "global_info"));
    const data = docSnap.exists() ? docSnap.data() : {};
    const isAdmin = await isAdminSession();

    // Strip sensitive fields (adminPin, adminEmail) for non-admin users (MUST-03)
    if (!isAdmin) {
      const { adminPin, adminEmail, ...safeData } = data;
      return NextResponse.json(safeData);
    }

    // For admin, retrieve adminEmail from protected admin/pinConfig if stored there
    const adminConfigSnap = await getDoc(doc(db, "admin", "pinConfig"));
    const protectedEmail = adminConfigSnap.exists() ? adminConfigSnap.data()?.adminEmail : undefined;
    const finalData = { ...data, adminEmail: protectedEmail || data.adminEmail || '' };

    return NextResponse.json(finalData);
  } catch (error: any) {
    logError('api', 'Settings GET error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    // CSRF protection (MUST-06)
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const rawBody = await request.json();
    // Sanitize all user-supplied text fields
    const body = sanitizeSettingsPayload(rawBody);

    const db = getAdminDb();
    const { pbkdf2Sync } = await import('crypto');

    // Update protected admin config with 600k iterations PIN and adminEmail (MUST-03, MUST-05)
    const adminConfigUpdates: Record<string, any> = {};
    if (body.adminPin) {
      const pepper = process.env.PIN_PEPPER;
      if (!pepper) throw new Error('PIN_PEPPER env var is not set');
      const salt = `admin-pin-${pepper}`;
      const hash = pbkdf2Sync(body.adminPin, salt, 600000, 64, 'sha512').toString('hex');
      adminConfigUpdates.pinHash = hash;
    }
    if (body.adminEmail) {
      adminConfigUpdates.adminEmail = body.adminEmail.trim().toLowerCase();
    }

    if (Object.keys(adminConfigUpdates).length > 0) {
      const pinConfigRef = doc(db, "admin", "pinConfig");
      const currentSnap = await getDoc(pinConfigRef);
      const currentData = currentSnap.exists() ? currentSnap.data() : {};
      await setDoc(pinConfigRef, { ...currentData, ...adminConfigUpdates });
    }

    // Remove sensitive fields (adminPin, adminEmail) before saving to public settings doc
    const { adminPin, adminEmail, ...settingsData } = body;

    // Save settings (public global info)
    await setDoc(doc(db, "settings", "global_info"), settingsData);

    logInfo('data', 'Settings updated', undefined, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('api', 'Settings PUT error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

