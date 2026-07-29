import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Only check the root path (home page)
  if (pathname === '/') {
    const introSeen = request.cookies.get('introSeen')?.value;
    if (introSeen !== 'true') {
      return NextResponse.redirect(new URL('/intro', request.url));
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/'],
};
