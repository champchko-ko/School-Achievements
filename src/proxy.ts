import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAdminToken, createMaintenanceBypassToken, verifyMaintenanceBypassToken } from './lib/admin-session';

// Maintenance mode gate.
// Enabled by setting the Vercel env var MAINTENANCE_MODE to "true".
// While enabled, every page redirects to /maintenance unless the visitor
// is an admin, holds the bypass cookie, or uses ?bypass=<MAINTENANCE_BYPASS_KEY>.
const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
const MAINTENANCE_BYPASS_KEY = process.env.MAINTENANCE_BYPASS_KEY || '';

// Build a nonce-based Content-Security-Policy (Finding #7).
// `'strict-dynamic'` + nonce removes the need for `'unsafe-inline'` on scripts.
// `'unsafe-eval'` is only added in development (React uses eval for dev tooling).
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''} https://apis.google.com https://static.cloudflareinsights.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com;
    media-src 'self' blob: https://res.cloudinary.com;
    font-src 'self' https://fonts.gstatic.com data:;
    connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://api.cloudinary.com https://res.cloudinary.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://static.cloudflareinsights.com https://www.google.com https://recaptcha.google.com;
    frame-src 'self' https://www.google.com https://recaptcha.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `;
  return cspHeader.replace(/\s{2,}/g, ' ').trim();
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const cspHeaderValue = buildCsp(nonce);

  const { pathname } = request.nextUrl;
  const { searchParams } = request.nextUrl;
  const isAdmin = await verifyAdminToken(request.cookies.get('admin_session')?.value);

  // Propagate the nonce + CSP on the REQUEST headers so Next.js applies the nonce
  // to its injected scripts/styles during server-side rendering (hydration-safe).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeaderValue);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set('Content-Security-Policy', cspHeaderValue);

  // Helper to attach the CSP header to redirect responses too.
  const redirect = (target: string) => {
    const res = NextResponse.redirect(new URL(target, request.url));
    res.headers.set('Content-Security-Policy', cspHeaderValue);
    return res;
  };

  // Maintenance mode: block public access to all pages
  if (MAINTENANCE_MODE) {
    const bypassCookie = verifyMaintenanceBypassToken(request.cookies.get('maintenance_bypass')?.value);
    const bypassKey = searchParams.get('bypass') || '';
    const safePaths =
      pathname === '/maintenance' ||
      pathname.startsWith('/_next/') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/api/') ||
      pathname.startsWith('/images/') ||
      pathname.startsWith('/fonts/');

    // Correct bypass key → grant a signed session cookie and let the request through (MUST-18)
    if (bypassKey && MAINTENANCE_BYPASS_KEY && bypassKey === MAINTENANCE_BYPASS_KEY) {
      const signedBypassToken = createMaintenanceBypassToken();
      response.cookies.set('maintenance_bypass', signedBypassToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 60 * 60, // 8 hours
      });
      return response;
    }

    if (!isAdmin && !bypassCookie && !safePaths) {
      return redirect('/maintenance');
    }
  }

  // Admin-only routes - redirect to home if not authenticated (MUST-19)
  const adminRoutes = ['/admin', '/settings', '/reports', '/admin/monthly-awards'];
  const isAdminRoute = adminRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));
  if (isAdminRoute && !isAdmin) {
    return redirect('/');
  }

  // Intro page redirect (only for the root path)
  if (pathname === '/') {
    const introSeen = request.cookies.get('introSeen')?.value;
    if (introSeen !== 'true') {
      return redirect('/intro');
    }
  }

  return response;
}

export const config = {
  // Run on all app pages; skip static assets, images, fonts and API routes.
  // Ignore link prefetches so they don't generate unnecessary nonces (see CSP guide).
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|images|fonts|.*\\.(?:png|jpg|jpeg|svg|webp|gif|ico|pdf|mp4|docx?)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
