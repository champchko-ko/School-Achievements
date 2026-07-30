// src/app/api/settings/route.ts
// GET: Read settings (adminPin is stripped for non-admin requests)
// PUT: Update settings (admin session required)

import { NextResponse } from 'next/server';

async function isAdminSession(): Promise<boolean> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    return cookieStore.get('admin_session')?.value === '1';
  } catch {
    return false;
  }
}

export async function GET() {
  try {
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

    const docSnap = await getDoc(doc(db, "settings", "global_info"));
    
    if (!docSnap.exists()) {
      return NextResponse.json({});
    }

    const data = docSnap.data();
    const isAdmin = await isAdminSession();

    // Strip adminPin for non-admin users
    if (!isAdmin && data.adminPin) {
      const { adminPin, ...safeData } = data;
      return NextResponse.json(safeData);
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Settings GET error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const body = await request.json();

    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, doc, setDoc } = await import('firebase/firestore');

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

    // Save settings (merge to preserve fields)
    await setDoc(doc(db, "settings", "global_info"), body, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Settings PUT error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
