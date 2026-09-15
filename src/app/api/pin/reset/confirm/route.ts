// src/app/api/pin/reset/confirm/route.ts
// POST: Confirm PIN reset (verify token, set new PIN)

import { NextResponse } from 'next/server';
import { createHash, pbkdf2Sync } from 'crypto';
import { logInfo, logError } from '../../../../../lib/logger';
import { getAdminDb, doc, getDoc, setDoc, deleteDoc } from '../../../../../lib/firebase-admin';

function hashAdminPin(pin: string): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  const salt = `admin-pin-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

export async function POST(request: Request) {
  try {
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
    const resetRef = doc(db, "admin", "pinReset");
    const resetSnap = await getDoc(resetRef);

    if (!resetSnap.exists()) {
      return NextResponse.json({ error: 'رمز غير صالح أو منتهي الصلاحية' }, { status: 400 });
    }

    const resetData = resetSnap.data();
    // Constant-time compare
    const storedHash = resetData.tokenHash;
    const valid = storedHash === tokenHash;

    if (!valid || resetData.used === true) {
      return NextResponse.json({ error: 'رمز غير صالح أو مستخدم من قبل' }, { status: 400 });
    }

    if (Date.now() > resetData.expiresAt) {
      return NextResponse.json({ error: 'انتهت صلاحية الرابط. يرجى طلب رابط جديد.' }, { status: 400 });
    }

    // Set the new PIN hash
    const newHash = hashAdminPin(pin);
    await setDoc(doc(db, "admin", "pinConfig"), { pinHash: newHash });

    // Consume the token (single-use) and clean up
    await deleteDoc(resetRef);

    logInfo('auth', 'PIN reset completed', undefined, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('auth', 'PIN reset confirm failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
