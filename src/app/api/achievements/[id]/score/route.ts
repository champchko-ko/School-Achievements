// src/app/api/achievements/[id]/score/route.ts
// POST: Set score for an achievement (admin session required)

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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const body = await request.json();
    const { score } = body;

    if (score === undefined || score === null || ![75, 85, 95].includes(score)) {
      return NextResponse.json({ error: 'Invalid score value. Must be 75, 85, or 95.' }, { status: 400 });
    }

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

    await updateDoc(doc(db, 'achievements', id), { score });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Score update error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
