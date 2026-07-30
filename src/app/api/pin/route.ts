// src/app/api/pin/route.ts
// Server-side PIN hashing with pbkdf2 + secret pepper
// The PIN itself is NEVER stored in Firestore - only a hash

import { NextResponse } from 'next/server';
import { pbkdf2Sync } from 'crypto';

function getPepper(): string {
  return process.env.PIN_PEPPER || 'school-achievements-default-pepper-change-in-production';
}

function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

// POST /api/pin — store a new PIN hash for an achievement
export async function POST(request: Request) {
  try {
    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    const hash = hashPin(pin, achievementId);

    // Use Firebase Web SDK (works in Node.js server runtime)
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
    
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
    
    await updateDoc(doc(db, 'achievements', achievementId), {
      pinHash: hash,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PIN storage error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT /api/pin — verify a PIN against the stored hash
export async function PUT(request: Request) {
  try {
    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }

    // Use Firebase Web SDK
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
    
    const docSnap = await getDoc(doc(db, 'achievements', achievementId));
    
    if (!docSnap.exists()) {
      return NextResponse.json({ valid: false, error: 'Achievement not found' }, { status: 404 });
    }

    const storedHash = docSnap.data()?.pinHash;
    if (!storedHash) {
      return NextResponse.json({ valid: false, error: 'No PIN set for this achievement' });
    }

    const inputHash = hashPin(pin, achievementId);
    const valid = inputHash === storedHash;

    return NextResponse.json({ valid });
  } catch (error: any) {
    console.error('PIN verification error:', error?.message || error);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
