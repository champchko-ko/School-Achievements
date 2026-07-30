// src/app/api/auth/route.ts
import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../lib/rate-limit';
import { pbkdf2Sync } from 'crypto';

const SESSION_COOKIE = 'admin_session';

function hashAdminPin(pin: string): string {
  const pepper = process.env.PIN_PEPPER || 'school-achievements-default-pepper-change-in-production';
  const salt = `admin-pin-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

// GET: Check if admin is authenticated (by cookie)
export async function GET() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const session = cookieStore.get(SESSION_COOKIE)?.value;
  return NextResponse.json({ admin: session === '1' });
}

// POST: Verify PIN via Firestore and set session cookie
export async function POST(request: Request) {
  try {
    // Rate limit: max 10 attempts per minute per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const { allowed, remaining, resetAt } = checkRateLimit(`auth:${ip}`, { maxRequests: 10, windowMs: 60_000 });
    if (!allowed) {
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

    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, getDoc } = await import('firebase/firestore');

    const firebaseConfig = {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    };

    const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    const db = getFirestore(app);

    // First try to read hashed PIN from protected admin/pinConfig doc
    let valid = false;
    const pinConfigRef = doc(db, "admin", "pinConfig");
    const pinConfigSnap = await getDoc(pinConfigRef);

    if (pinConfigSnap.exists() && pinConfigSnap.data().pinHash) {
      // Verify against stored hash
      const storedHash = pinConfigSnap.data().pinHash;
      const inputHash = hashAdminPin(pin);
      valid = inputHash === storedHash;
    } else {
      // Fallback: read plaintext PIN from settings (legacy documents)
      const legacyRef = doc(db, "settings", "global_info");
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const legacyPin = legacySnap.data()?.adminPin;
        if (legacyPin) {
          valid = pin === legacyPin;
          // Migrate: hash the PIN and store in protected doc, then remove from settings
          if (valid) {
            const hash = hashAdminPin(pin);
            const { setDoc, updateDoc } = await import('firebase/firestore');
            await setDoc(pinConfigRef, { pinHash: hash });
            // Remove plaintext PIN from settings doc
            await updateDoc(legacyRef, {
              adminPin: '', // clear the plaintext field
            });
          }
        }
      }
    }

    if (!valid) {
      return NextResponse.json({ error: 'PIN غير صحيح' }, { status: 401 });
    }

    // Set httpOnly session cookie
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
