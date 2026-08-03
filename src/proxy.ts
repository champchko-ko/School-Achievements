import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Maintenance mode gate.
// Enabled by setting the Vercel env var MAINTENANCE_MODE to "true".
// While enabled, every page redirects to /maintenance unless the visitor
// is an admin, holds the bypass cookie, or uses ?bypass=<MAINTENANCE_BYPASS_KEY>.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
const MAINTENANCE_BYPASS_KEY = process.env.MAINTENANCE_BYPASS_KEY || '';

// Mirrors src/lib/admin-session.ts (legacy "1" + base64 timestamp formats).
function isAdminCookie(cookieValue: string | undefined): boolean {
  if (!cookieValue) return false;
  if (cookieValue === '1') return true;
  try {
    const decoded = atob(cookieValue);
    const loginTime = parseInt(decoded, 10);
    if (isNaN(loginTime)) return false;
    return Date.now() - loginTime <= 30 * 60 * 1000; // 30 min idle timeout
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { searchParams } = request.nextUrl;
  const isAdmin = isAdminCookie(request.cookies.get('admin_session')?.value);
  const response = NextResponse.next();

  // Maintenance mode: block public access to all pages
  if (MAINTENANCE_MODE) {
    const bypassCookie = request.cookies.get('maintenance_bypass')?.value === '1';
    const bypassKey = searchParams.get('bypass') || '';
    const safePaths =
      pathname === '/maintenance' ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/fonts/');

    // Correct bypass key → grant a session cookie and let the request through
    if (bypassKey && MAINTENANCE_BYPASS_KEY && bypassKey === MAINTENANCE_BYPASS_KEY) {
      response.cookies.set('maintenance_bypass', '1', {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60, // 8 hours
      });
      return response;
    }

    if (!isAdmin && !bypassCookie && !safePaths) {
      return NextResponse.redirect(new URL('/maintenance', request.url));
    }
  }

  // Admin-only routes - redirect to home if not authenticated
  const adminRoutes = ['/admin', '/settings', '/reports'];
  if (adminRoutes.includes(pathname) && !isAdmin) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Intro page redirect (only for the root path)
  if (pathname === '/') {
    const introSeen = request.cookies.get('introSeen')?.value;
    if (introSeen !== 'true') {
      return NextResponse.redirect(new URL('/intro', request.url));
    }
  }

  return response;
}

export const config = {
  // Run on all app pages; skip static assets, images, fonts and API routes
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|images|fonts|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|pdf|mp4|docx?)$).*)'],
};
