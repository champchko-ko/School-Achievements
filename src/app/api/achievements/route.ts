// src/app/api/achievements/route.ts
// POST: Create a new achievement (no auth needed — teachers add freely)
// Stores achievement data + handles PIN hashing server-side

import { NextResponse } from 'next/server';
import { sanitizeAchievementPayload } from '../../../lib/sanitize';
import { pbkdf2Sync } from 'crypto';
import { getAdminDb, addDoc, collection, doc, serverTimestamp, updateDoc } from '../../../lib/firebase-admin';

function getPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  return pepper;
}

function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

export async function POST(request: Request) {
  try {
    // CSRF protection
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    const host = request.headers.get('host');
    if (origin && host && !origin.includes(host)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }
    if (!origin && referer && host && !referer.includes(host)) {
      return NextResponse.json({ error: 'Invalid referer' }, { status: 403 });
    }

    const { isAdminSession } = await import('../../../lib/admin-session');
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء. تسجيل الدخول كمدير مطلوب.' }, { status: 401 });
    }

    const body = await request.json();
    const { teacherName, department, title, desc, attachmentUrls, pin, date } = body;

    // Sanitize all user-supplied text
    const sanitized = sanitizeAchievementPayload({ teacherName, department, title, desc, attachmentUrls });
    const sTeacherName = sanitized.teacherName;
    const sDepartment = sanitized.department;
    const sTitle = sanitized.title;
    const sDesc = sanitized.desc;
    const sAttachmentUrls = sanitized.attachmentUrls;

    if (!sTeacherName || !sTitle || !sDesc) {
      return NextResponse.json({ error: 'teacherName, title, and desc are required' }, { status: 400 });
    }

    // Trust a well-formed date sent by the client (device-local timezone);
    // otherwise fall back to the server's UTC date.
    const sDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toISOString().split('T')[0];

    const db = getAdminDb();

    // Create the achievement document
    const docRef = await addDoc(collection(db, "achievements"), {
      teacherName,
      department: sDepartment || '',
      title,
      desc,
      attachmentUrls: sAttachmentUrls || [],
      score: null,
      date: sDate,
      timestamp: serverTimestamp(),
    });

    // If a PIN was provided, hash it and store in the document
    if (pin && pin.length === 4 && /^\d{4}$/.test(pin)) {
      const hash = hashPin(pin, docRef.id);
      await updateDoc(doc(db, 'achievements', docRef.id), { pinHash: hash });
    }

    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    console.error('Create achievement error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
