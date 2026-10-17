// src/app/api/achievements/route.ts
// POST: Create a new achievement (no auth needed — teachers add freely)
// Stores achievement data + handles PIN hashing server-side

import { NextResponse } from 'next/server';
import { logAchievementCreated, logCsrfBlock, logError } from '../../../lib/logger';
import { checkRateLimit } from '../../../lib/rate-limit';
import { logRateLimitHit } from '../../../lib/logger';
import { sanitizeAchievementPayload } from '../../../lib/sanitize';
import { validateDepartmentAndTeacher } from '../../../lib/validate-lists';
import { pbkdf2Sync } from 'crypto';
import { getAdminDb, addDoc, collection, doc, serverTimestamp, setDoc } from '../../../lib/firebase-admin';
import { isValidOrigin } from '../../../lib/csrf';
import { isAdminSession } from '../../../lib/admin-session';

function getPepper(): string {
  const pepper = process.env.PIN_PEPPER;
  if (!pepper) throw new Error('PIN_PEPPER env var is not set');
  return pepper;
}

export function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 600000, 64, 'sha512');
  return hash.toString('hex');
}

export async function POST(request: Request) {
  try {
    // CSRF protection (MUST-06)
    if (!isValidOrigin(request)) {
      logCsrfBlock(request);
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Rate limit: 10 achievements per hour per IP (leftmost client IP - MUST-14)
    const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const ip = rawIp.split(',')[0].trim() || 'unknown';
    const { allowed, resetAt } = await checkRateLimit(`ach:${ip}`, { maxRequests: 10, windowMs: 3_600_000 });
    if (!allowed) {
      logRateLimitHit(`ach:${ip}`, request);
      return NextResponse.json({ error: 'تم تجاوز الحد المسموح. الرجاء المحاولة لاحقاً.', resetAt }, { status: 429 });
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
      return NextResponse.json({ error: 'اسم المعلمة، عنوان الإنجاز، ووصف الإنجاز حقول مطلوبة.' }, { status: 400 });
    }

    if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'رمز الحماية المكون من 4 أرقام مطلوب.' }, { status: 400 });
    }

    // Server-side enforcement: department and teacher must be from settings lists
    const listCheck = await validateDepartmentAndTeacher(sDepartment, sTeacherName);
    if (!listCheck.ok) {
      logError('api', 'Create achievement rejected - invalid department/teacher', { error: listCheck.error }, request);
      return NextResponse.json({ error: listCheck.error }, { status: 400 });
    }
    const vTeacherName = listCheck.teacherName;
    const vDepartment = listCheck.department;

    // Trust a well-formed date sent by the client (device-local timezone);
    // otherwise fall back to the server's UTC date.
    const sDate =
      typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date
        : new Date().toISOString().split('T')[0];

    const db = getAdminDb();

    // Create the achievement document without exposing pinHash in public collection (MUST-03)
    const docRef = await addDoc(collection(db, "achievements"), {
      teacherName: vTeacherName,
      department: vDepartment,
      title: sTitle,
      desc: sDesc,
      attachmentUrls: sAttachmentUrls || [],
      score: null,
      status: 'pending',
      date: sDate,
      timestamp: serverTimestamp(),
    });

    // Hash the 4-digit PIN and store in server-only collection admin/achievementSecrets/{id} (MUST-03)
    const hash = hashPin(pin, docRef.id);
    await setDoc(doc(db, 'admin', 'achievementSecrets', docRef.id), { pinHash: hash });


    logAchievementCreated(docRef.id, sTeacherName, request);
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    logError('api', 'Create achievement failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all') === 'true';
    const isAdmin = await isAdminSession();

    const db = getAdminDb();
    const colRef = db.collection('achievements');

    let snap;
    if (all && isAdmin) {
      // Admin dashboard requesting all achievements including pending
      snap = await colRef.orderBy('timestamp', 'desc').get();
    } else {
      // Public view: strictly approved achievements
      snap = await colRef.where('status', '==', 'approved').get();
    }

    const achievements = snap.docs.map((d: any) => {
      const data = d.data();
      delete data.pinHash; // Security guarantee: never return pinHash
      return { id: d.id, ...data };
    });

    return NextResponse.json(achievements);
  } catch (error: any) {
    logError('api', 'Get achievements failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
