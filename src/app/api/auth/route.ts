// src/app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { logAuthSuccess, logAuthFailure, logError } from '../../../lib/logger';
import { checkRateLimit } from '../../../lib/rate-limit';
import { isAdminSession, createSessionValue, getSessionCookieOptions } from '../../../lib/admin-session';
import { pbkdf2Sync } from 'crypto';
import { getAdminDb, doc, getDoc, setDoc, updateDoc } from '../../../lib/firebase-admin';

function hashAdminPin(pin: string): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  const salt = `admin-pin-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

// GET: Check if admin is authenticated (by cookie with idle timeout)
export async function GET(request: Request) {
  const admin = await isAdminSession();
  if (admin) logAuthSuccess(true, request);
  return NextResponse.json({ admin });
}

// POST: Verify PIN via Firestore and set session cookie
export async function POST(request: Request) {
  try {
    // Rate limit: max 10 attempts per minute per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const { allowed, remaining, resetAt } = checkRateLimit(`auth:${ip}`, { maxRequests: 10, windowMs: 60_000 });
    if (!allowed) {
      const { logRateLimitHit } = await import('../../../lib/logger');
      logRateLimitHit(`auth:${ip}`, request);
      return NextResponse.json({ 
        error: 'محاولات كثيرة جداً. الرجاء الانتظار قبل المحاولة مرة أخرى.',
        remaining,
        resetAt 
      }, { status: 429 });
    }

    const { pin } = await request.json();
    if (!pin) {
      return NextResponse.json({ error: 'PIN مطلوب' }, { status: 400 });
    }

    const db = getAdminDb();

    // First try to read hashed PIN from protected admin/pinConfig doc
    let valid = false;
    const pinConfigRef = doc(db, "admin", "pinConfig");
    const pinConfigSnap = await getDoc(pinConfigRef);

    if (pinConfigSnap.exists() && pinConfigSnap.data().pinHash) {
      // Verify against stored hash
      const storedHash = pinConfigSnap.data().pinHash;
      const inputHash = hashAdminPin(pin);
      valid = inputHash === storedHash;
    } else {
      // Fallback: read plaintext PIN from settings (legacy documents)
      const legacyRef = doc(db, "settings", "global_info");
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const legacyPin = legacySnap.data()?.adminPin;
        if (legacyPin) {
          valid = pin === legacyPin;
          // Migrate: hash the PIN and store in protected doc, then remove from settings
          if (valid) {
            const hash = hashAdminPin(pin);
            await setDoc(pinConfigRef, { pinHash: hash });
            // Remove plaintext PIN from settings doc
            await updateDoc(legacyRef, {
              adminPin: '', // clear the plaintext field
            });
          }
        }
      }
    }

    if (!valid) {
      logAuthFailure('incorrect_pin', request, { ip });
      return NextResponse.json({ error: 'PIN غير صحيح' }, { status: 401 });
    }

    // Set httpOnly session cookie
    logAuthSuccess(true, request);
    const response = NextResponse.json({ admin: true });
    const sessionValue = createSessionValue();
    const cookieOptions = getSessionCookieOptions();
    response.cookies.set('admin_session', sessionValue, cookieOptions);

    return response;
  } catch (error: any) {
    logError('auth', 'Auth endpoint error', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: Logout (clear session cookie)
export async function DELETE() {
  const response = NextResponse.json({ admin: false });
  response.cookies.delete('admin_session');
  return response;
}
