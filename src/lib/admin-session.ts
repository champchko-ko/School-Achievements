// src/lib/admin-session.ts
// Shared admin session verification with idle timeout

const SESSION_COOKIE = 'admin_session';
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours absolute max

/**
 * Check if the current request has a valid admin session.
 * Verifies both the cookie existence and idle timeout.
 */
export async function isAdminSession(): Promise<boolean> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const cookie = cookieStore.get(SESSION_COOKIE)?.value;
    
    if (!cookie) return false;

    // Parse the stored timestamp (base64 encoded)
    let loginTime: number;
    try {
      const decoded = atob(cookie);
      loginTime = parseInt(decoded, 10);
    } catch {
      return false; // Invalid cookie value
    }

    if (isNaN(loginTime)) return false;

    const elapsed = Date.now() - loginTime;

    // Check idle timeout (30 minutes)
    if (elapsed > IDLE_TIMEOUT_MS) {
      return false; // Session expired due to inactivity
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Create the session cookie value (base64-encoded timestamp).
 */
export function createSessionValue(): string {
  return btoa(Date.now().toString());
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
    maxAge: SESSION_MAX_AGE_SECONDS, // 8 hours absolute
  };
}
