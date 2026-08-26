// POST: Approve or reject an achievement (admin session required)
// Sets status to "approved" or "rejected"

import { NextResponse } from 'next/server';
import { logAchievementStatusChanged, logError } from '../../../../../lib/logger';
import { isAdminSession } from '../../../../../lib/admin-session';
import { getAdminDb, doc, getDoc, updateDoc } from '../../../../../lib/firebase-admin';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const body = await request.json();
    const { status } = body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Status must be "approved" or "rejected"' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = doc(db, 'achievements', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    await updateDoc(docRef, { status });

    logAchievementStatusChanged(id, status, request);
    return NextResponse.json({ success: true, status });
  } catch (error: any) {
    logError('api', 'Status update failed', { error: error?.message, achievementId: id }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
