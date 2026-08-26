// src/app/api/achievements/[id]/score/route.ts
// POST: Set score for an achievement (admin session required)

import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../../../lib/admin-session';
import { getAdminDb, doc, updateDoc } from '../../../../../lib/firebase-admin';


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

    const db = getAdminDb();

    await updateDoc(doc(db, 'achievements', id), { score });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Score update error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
