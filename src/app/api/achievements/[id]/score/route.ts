// src/app/api/achievements/[id]/score/route.ts
// POST: Set score for an achievement (admin session required)

import { NextResponse } from 'next/server';
import { logInfo, logError } from '../../../../../lib/logger';
import { isAdminSession } from '../../../../../lib/admin-session';
import { getAdminDb, doc, updateDoc } from '../../../../../lib/firebase-admin';


export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
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

    logInfo('data', 'Achievement scored', { achievementId: id, score }, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('api', 'Score update failed', { error: error?.message, achievementId: id }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
