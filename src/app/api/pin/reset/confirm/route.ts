import { NextResponse } from 'next/server';
import { createHash, pbkdf2Sync, timingSafeEqual } from 'crypto';
import { logInfo, logError } from '../../../../../lib/logger';
import { getAdminDb, doc, getDoc, setDoc, deleteDoc } from '../../../../../lib/firebase-admin';
import { isValidOrigin } from '../../../../../lib/csrf';
import { resetLockout } from '../../../../../lib/rate-limit';

function hashAdminPin(pin: string): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  const salt = `admin-pin-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 600000, 64, 'sha512');
  return hash.toString('hex');
}

export async function POST(request: Request) {
  try {
    // CSRF protection (MUST-06)
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    const body = await request.json();
    const { token, pin } = body;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'رمز غير صالح' }, { status: 400 });
    }
    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'الرمز يجب أن يكون 4 أرقام' }, { status: 400 });
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');

    const db = getAdminDb();
    // Look up token-keyed document first (MUST-23), fallback to legacy single doc
    let resetRef = doc(db, "admin", "pinResets", tokenHash);
    let resetSnap = await getDoc(resetRef);
    if (!resetSnap.exists()) {
      resetRef = doc(db, "admin", "pinReset");
      resetSnap = await getDoc(resetRef);
    }

    if (!resetSnap.exists()) {
      return NextResponse.json({ error: 'رمز غير صالح أو منتهي الصلاحية' }, { status: 400 });
    }

    const resetData = resetSnap.data();
    // Constant-time compare (MUST-21)
    const storedHash = resetData.tokenHash;
    const valid = typeof storedHash === 'string' &&
                  storedHash.length === tokenHash.length &&
                  timingSafeEqual(Buffer.from(storedHash), Buffer.from(tokenHash));

    if (!valid || resetData.used === true) {
      return NextResponse.json({ error: 'رمز غير صالح أو مستخدم من قبل' }, { status: 400 });
    }

    if (Date.now() > resetData.expiresAt) {
      return NextResponse.json({ error: 'انتهت صلاحية الرابط. يرجى طلب رابط جديد.' }, { status: 400 });
    }

    // Set the new PIN hash (600,000 iterations - MUST-05)
    const newHash = hashAdminPin(pin);
    const pinConfigRef = doc(db, "admin", "pinConfig");
    const existingConfig = await getDoc(pinConfigRef);
    const existingData = existingConfig.exists() ? existingConfig.data() : {};
    await setDoc(pinConfigRef, { ...existingData, pinHash: newHash });

    // Clear any admin login lockout
    await resetLockout('admin:global');

    // Consume the token (single-use) and clean up
    await deleteDoc(resetRef);

    logInfo('auth', 'PIN reset completed', undefined, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('auth', 'PIN reset confirm failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

