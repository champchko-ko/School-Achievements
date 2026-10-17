import { NextResponse } from 'next/server';
import { checkRateLimit, checkLockout, recordFailedAttempt, resetLockout, resetAchievementLockouts, sleep, getClientIp } from '../../../lib/rate-limit';
import { pbkdf2Sync, timingSafeEqual } from 'crypto';
import { getAdminDb, doc, getDoc, setDoc } from '../../../lib/firebase-admin';
import { isValidOrigin } from '../../../lib/csrf';

function getPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  return pepper;
}

function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 600000, 64, 'sha512');
  return hash.toString('hex');
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

// POST /api/pin — store a new PIN hash for an achievement (admin only)
export async function POST(request: Request) {
  try {
    // CSRF protection (MUST-06)
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Require admin session
    const { isAdminSession } = await import('../../../lib/admin-session');
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء.' }, { status: 401 });
    }

    // Rate limit: max 20 PIN storage requests per minute per IP (leftmost IP)
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`pin-store:${ip}`, { maxRequests: 20, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة جداً. الرجاء الانتظار.' }, { status: 429 });
    }

    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(achievementId)) {
      return NextResponse.json({ error: 'Invalid achievementId' }, { status: 400 });
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    const hash = hashPin(pin, achievementId);

    const db = getAdminDb();
    // Store in server-only collection admin/achievementSecrets/{achievementId} (MUST-03)
    await setDoc(doc(db, 'admin', 'achievementSecrets', achievementId), {
      pinHash: hash,
    });

    // Reset any existing lockouts on this achievement (admin session clears locks - MUST-04)
      await resetAchievementLockouts(achievementId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PIN storage error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT /api/pin — verify a PIN against the stored hash
export async function PUT(request: Request) {
  try {
    // CSRF protection (MUST-06)
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Rate limit: max 30 PIN verification attempts per minute per IP (leftmost IP)
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`pin-verify:${ip}`, { maxRequests: 30, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ valid: false, error: 'محاولات كثيرة جداً. الرجاء الانتظار.' }, { status: 429 });
    }

    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(achievementId)) {
      return NextResponse.json({ error: 'Invalid achievementId' }, { status: 400 });
    }

    const { isAdminSession } = await import('../../../lib/admin-session');
    const isAdmin = await isAdminSession();

    const lockKey = `pin-lockout:${achievementId}:${ip}`;

    // Admin session bypasses and clears lockout; otherwise enforce 5-attempt/15-minute lockout (MUST-04)
    if (isAdmin) {
    await resetAchievementLockouts(achievementId);
    } else {
      const lockoutStatus = await checkLockout(lockKey);
      if (lockoutStatus.locked) {
        const minutesRemaining = Math.max(1, Math.ceil(lockoutStatus.remainingTimeMs / 60_000));
        return NextResponse.json({
          valid: false,
          error: `تم إيقاف المحاولات مؤقتاً لمدة ${minutesRemaining} دقيقة بعد عدة محاولات غير صحيحة.`,
          resetAt: lockoutStatus.resetAt,
        }, { status: 429 });
      }
    }

    const db = getAdminDb();
    const docSnap = await getDoc(doc(db, 'achievements', achievementId));
    
    if (!docSnap.exists()) {
      return NextResponse.json({ valid: false, error: 'Achievement not found' }, { status: 404 });
    }

    // Check server-only achievementSecrets collection first, then fallback to document (MUST-03)
    const secretSnap = await getDoc(doc(db, 'admin', 'achievementSecrets', achievementId));
    const storedHash = secretSnap.exists() ? secretSnap.data()?.pinHash : docSnap.data()?.pinHash;
    if (!storedHash) {
      return NextResponse.json({ valid: false, error: 'No PIN set for this achievement' });
    }

    const valid = verifyPinMatch(pin, achievementId, storedHash);

    if (valid) {
      await resetLockout(lockKey);
      return NextResponse.json({ valid: true });
    }

    // Record failed attempt and enforce exponential backoff (MUST-04 / Finding #6)
    const lockout = await recordFailedAttempt(lockKey, {
      maxAttempts: 5,
      lockoutDurationMs: 15 * 60 * 1000,
    });

    await sleep(lockout.attempts * 250);

    if (lockout.locked) {
      return NextResponse.json({
        valid: false,
        error: 'تم إيقاف المحاولات مؤقتاً لمدة 15 دقيقة بعد 5 محاولات غير صحيحة.',
        resetAt: lockout.resetAt,
      }, { status: 429 });
    }

    return NextResponse.json({
      valid: false,
      error: 'رمز الحماية غير صحيح!',
      remainingAttempts: Math.max(0, 5 - lockout.attempts),
    });
  } catch (error: any) {
    console.error('PIN verification error:', error?.message || error);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}

