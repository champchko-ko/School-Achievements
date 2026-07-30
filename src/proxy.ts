import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdmin = request.cookies.get('admin_session')?.value === '1';

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

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin', '/settings', '/reports'],
};
