import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Maintenance mode gate.
// Enabled by setting the Vercel env var MAINTENANCE_MODE to "true".
// While enabled, EVERYONE is locked out — no exceptions:
//   - all pages redirect to /maintenance (admins included)
//   - all API routes return 503
// Only the maintenance page itself and static assets stay accessible.
// Set MAINTENANCE_MODE to "false" to return to production.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';

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
  const isAdmin = isAdminCookie(request.cookies.get('admin_session')?.value);
  const response = NextResponse.next();

  // Maintenance mode: total lock-down for everyone
  if (MAINTENANCE_MODE) {
    // Block all API routes during maintenance
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'المنصة في صيانة مؤقتة' }, { status: 503 });
    }

    const safePaths =
      pathname === '/maintenance' ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/fonts/');

    if (!safePaths) {
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
  // Run on all app pages AND API routes; skip static assets, images and fonts
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images|fonts|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|pdf|mp4|docx?)$).*)'],
};
