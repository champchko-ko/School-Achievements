import { SignJWT, jwtVerify } from 'jose';
import { createHash, createHmac, timingSafeEqual } from 'crypto';

const SESSION_COOKIE = 'admin_session';
const SESSION_MAX_AGE_SECONDS = 30 * 60; // 30 minutes (aligned with JWT expiry)

function getJwtSecret(): Uint8Array {
  const rawSecret = process.env.AUTH_SECRET;
  if (!rawSecret) {
    if (process.env.NODE_ENV === 'test') {
      return createHash('sha256').update('test-auth-secret-for-vitest-suite-32chars!').digest();
    }
    throw new Error('AUTH_SECRET environment variable is required');
  }
  return createHash('sha256').update(rawSecret).digest();
}

/**
 * Verify whether a session token string is a valid, unexpired admin token.
 */
export async function verifyAdminToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

/**
 * Check if the current request has a valid admin session.
 * Verifies the signed JWT cookie and its expiration.
 */
export async function isAdminSession(): Promise<boolean> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE)?.value;
    return await verifyAdminToken(cookie);
  } catch {
    return false;
  }
}

/**
 * Create a cryptographically signed session JWT for admin (30 minutes expiration).
 */
export async function createSessionValue(): Promise<string> {
  const secret = getJwtSecret();
  return await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(secret);
}

/**
 * Get session cookie options.
 */
export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Create an HMAC rollback token for a specific uploaded URL (valid 15 minutes).
 */
export function createRollbackToken(url: string): string {
  const secret = getJwtSecret();
  const exp = Date.now() + 15 * 60 * 1000;
  const data = `${url}|${exp}`;
  const sig = createHmac('sha256', secret).update(data).digest('hex');
  return `${exp}.${sig}`;
}

/**
 * Verify an HMAC rollback token for a specific uploaded URL.
 */
export function verifyRollbackToken(url: string, token: string | undefined): boolean {
  if (!url || !token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0], 10);
  const sig = parts[1];
  if (isNaN(exp) || Date.now() > exp) return false;

  const secret = getJwtSecret();
  const data = `${url}|${exp}`;
  const expectedSig = createHmac('sha256', secret).update(data).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

/**
 * Create a signed maintenance bypass token (valid 8 hours).
 */
export function createMaintenanceBypassToken(): string {
  const secret = getJwtSecret();
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const sig = createHmac('sha256', secret).update(`bypass|${exp}`).digest('hex');
  return `${exp}.${sig}`;
}

/**
 * Verify a signed maintenance bypass token.
 */
export function verifyMaintenanceBypassToken(token: string | undefined): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const exp = parseInt(parts[0], 10);
  const sig = parts[1];
  if (isNaN(exp) || Date.now() > exp) return false;

  const secret = getJwtSecret();
  const expectedSig = createHmac('sha256', secret).update(`bypass|${exp}`).digest('hex');
  if (sig.length !== expectedSig.length) return false;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
}

