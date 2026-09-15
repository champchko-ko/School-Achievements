// src/app/api/achievements/[id]/award/route.ts
// POST: Assign, change, or remove a monthly award for an achievement (admin session required)

import { NextResponse } from 'next/server';
import { logInfo, logError } from '../../../../../lib/logger';
import { isAdminSession } from '../../../../../lib/admin-session';
import { getAdminDb, doc, getDoc, updateDoc } from '../../../../../lib/firebase-admin';

const VALID_LEVELS = ['gold', 'silver', 'bronze'];

function isValidMonthKey(monthKey: string): boolean {
  return /^\d{4}-\d{2}$/.test(monthKey);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const isAdmin = await isAdminSession();

    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const body = await request.json();
    const { monthKey, level } = body;

    if (!isValidMonthKey(monthKey)) {
      return NextResponse.json({ error: 'Invalid monthKey. Must be YYYY-MM.' }, { status: 400 });
    }

    const newLevel = level === null || level === 'none' ? null : level;
    if (newLevel !== null && !VALID_LEVELS.includes(newLevel)) {
      return NextResponse.json({ error: 'Invalid level. Must be gold, silver, or bronze.' }, { status: 400 });
    }

    const db = getAdminDb();
    const docRef = doc(db, 'achievements', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return NextResponse.json({ error: 'Achievement not found' }, { status: 404 });
    }

    const data = docSnap.data();
    const current = data.awards?.[monthKey] ?? null;
    const nextAwards = { ...(data.awards || {}) };

    if (newLevel === null) {
      delete nextAwards[monthKey];
    } else {
      nextAwards[monthKey] = newLevel;
    }

    await updateDoc(docRef, { awards: nextAwards });

    logInfo('data', 'Monthly award set', { achievementId: id, monthKey, previous: current, new: newLevel }, request);
    return NextResponse.json({ success: true, awards: nextAwards });
  } catch (error: any) {
    logError('api', 'Award update failed', { error: error?.message, achievementId: id }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
