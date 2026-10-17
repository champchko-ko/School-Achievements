// src/app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { logAuthSuccess, logAuthFailure, logError } from '../../../lib/logger';
import { checkRateLimit, checkLockout, recordFailedAttempt, resetLockout, sleep, getClientIp } from '../../../lib/rate-limit';
import { isAdminSession, createSessionValue, getSessionCookieOptions } from '../../../lib/admin-session';
import { pbkdf2Sync, timingSafeEqual } from 'crypto';
import { getAdminDb, doc, getDoc, updateDoc } from '../../../lib/firebase-admin';

function getPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  return pepper;
}

function hashAdminPin600k(pin: string): string {
  const pepper = getPepper();
  const salt = `admin-pin-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 600000, 64, 'sha512');
  return hash.toString('hex');
}

function hashAdminPin10k(pin: string): string {
  const pepper = getPepper();
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
    const ip = getClientIp(request);

    // 1. Account lockout: 5 consecutive failed attempts lock admin login globally for 15 minutes (MUST-04 / Finding #6)
    const globalLock = await checkLockout('admin:global');
    if (globalLock.locked) {
      const { logRateLimitHit } = await import('../../../lib/logger');
      logRateLimitHit('admin:global', request);
      const minutesRemaining = Math.max(1, Math.ceil(globalLock.remainingTimeMs / 60_000));
      return NextResponse.json({ 
        error: `تم قفل تسجيل الدخول مؤقتاً بسبب محاولات خاطئة متكررة. الرجاء الانتظار ${minutesRemaining} دقيقة.`,
        resetAt: globalLock.resetAt 
      }, { status: 429 });
    }

    // 2. IP rate limit: max 10 attempts per minute per IP (leftmost IP)
    const { allowed, remaining, resetAt } = await checkRateLimit(`auth:${ip}`, { maxRequests: 10, windowMs: 60_000 });
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

    // Read hashed PIN from protected admin/pinConfig doc
    let valid = false;
    const pinConfigRef = doc(db, "admin", "pinConfig");
    const pinConfigSnap = await getDoc(pinConfigRef);

    if (pinConfigSnap.exists() && pinConfigSnap.data().pinHash) {
      const storedHash = pinConfigSnap.data().pinHash;
      // Test 600k iterations (MUST-05) with timingSafeEqual (MUST-21)
      const inputHash600k = hashAdminPin600k(pin);
      if (inputHash600k.length === storedHash.length && timingSafeEqual(Buffer.from(inputHash600k), Buffer.from(storedHash))) {
        valid = true;
      } else {
        // Fallback for legacy 10k iterations
        const inputHash10k = hashAdminPin10k(pin);
        if (inputHash10k.length === storedHash.length && timingSafeEqual(Buffer.from(inputHash10k), Buffer.from(storedHash))) {
          valid = true;
          // Auto-upgrade stored hash to 600,000 iterations
          await updateDoc(pinConfigRef, { pinHash: inputHash600k });
        }
      }
    }

    if (!valid) {
      logAuthFailure('incorrect_pin', request, { ip });
      const lockout = await recordFailedAttempt('admin:global', {
        maxAttempts: 5,
        lockoutDurationMs: 15 * 60 * 1000,
      });

      // Exponential backoff delay on failed attempts (MUST-04 / Finding #6)
      await sleep(lockout.attempts * 250);

      if (lockout.locked) {
        return NextResponse.json({ 
          error: 'تم قفل تسجيل الدخول مؤقتاً لمدة 15 دقيقة بعد 5 محاولات خاطئة متتالية.',
          resetAt: lockout.resetAt 
        }, { status: 429 });
      }

      return NextResponse.json({ 
        error: 'PIN غير صحيح',
        remainingAttempts: Math.max(0, 5 - lockout.attempts)
      }, { status: 401 });
    }

    // Reset consecutive failed attempts counter on successful login
    await resetLockout('admin:global');

    // Set httpOnly session cookie
    logAuthSuccess(true, request);
    const response = NextResponse.json({ admin: true });
    const sessionValue = await createSessionValue();
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
