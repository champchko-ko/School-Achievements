// src/app/api/auth/route.ts
import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'admin_session';

// GET: Check if admin is authenticated (by cookie)
export async function GET() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  return NextResponse.json({ admin: session === '1' });
}

// POST: Verify PIN via Firestore REST API and set session cookie
export async function POST(request: Request) {
  try {
    const { pin } = await request.json();
    if (!pin) {
      return NextResponse.json({ error: 'PIN مطلوب' }, { status: 400 });
    }

    // Fetch the admin PIN from Firestore using the REST API (no SDK needed)
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    
    if (!projectId || !apiKey) {
      return NextResponse.json({ error: 'Firebase not configured' }, { status: 500 });
    }

    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/settings/global_info?key=${apiKey}`;
    const res = await fetch(url);
    
    let adminPin = '9999';
    if (res.ok) {
      const data = await res.json();
      // Firestore REST API returns fields in a specific format
      const fields = data.fields || {};
      if (fields.adminPin && fields.adminPin.stringValue) {
        adminPin = fields.adminPin.stringValue;
      }
    }

    if (pin !== adminPin) {
      return NextResponse.json({ error: 'PIN غير صحيح' }, { status: 401 });
    }

    // Set httpOnly session cookie via response headers
    const response = NextResponse.json({ admin: true });
    response.cookies.set(SESSION_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// DELETE: Logout (clear session cookie)
export async function DELETE() {
  const response = NextResponse.json({ admin: false });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
