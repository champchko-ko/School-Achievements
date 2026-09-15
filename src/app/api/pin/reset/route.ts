// src/app/api/pin/reset/route.ts
// POST: Request a password reset (sends email with time-limited token)

import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { logInfo, logError, logRateLimitHit } from '../../../../lib/logger';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getAdminDb, doc, getDoc, setDoc } from '../../../../lib/firebase-admin';
import { sendPinResetEmail } from '../../../../lib/mailer';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  try {
    // Rate limit: max 3 requests per hour per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const { allowed } = checkRateLimit(`pin-reset:${ip}`, { maxRequests: 3, windowMs: 60 * 60 * 1000 });
    if (!allowed) {
      logRateLimitHit(`pin-reset:${ip}`, request);
      return NextResponse.json({ error: 'محاولات كثيرة جداً. الرجاء الانتظار ساعة قبل المحاولة مرة أخرى.' }, { status: 429 });
    }

    const body = await request.json();
    const { email } = body;
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'بريد إلكتروني غير صالح' }, { status: 400 });
    }

    const db = getAdminDb();
    const settingsRef = doc(db, "settings", "global_info");
    const settingsSnap = await getDoc(settingsRef);
    const adminEmail = settingsSnap.exists() ? (settingsSnap.data()?.adminEmail || '').trim().toLowerCase() : '';

    // Security: always return the same message whether or not the email matches
    // (prevents email enumeration). Do not leak whether the email exists.
    if (!adminEmail || adminEmail !== email.trim().toLowerCase()) {
      return NextResponse.json({ success: true });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logError('auth', 'SMTP not configured for pin reset', undefined, request);
      return NextResponse.json({ error: 'خدمة البريد غير مهيأة بعد.' }, { status: 500 });
    }

    // Generate a secure token and store ONLY its hash
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    await setDoc(doc(db, "admin", "pinReset"), {
      tokenHash,
      email: adminEmail,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    // Build the reset URL (absolute, with origin)
    const origin = request.headers.get('origin') || request.headers.get('x-forwarded-host') || 'http://localhost:3000';
    const resetUrl = `${origin}/reset-pin?token=${token}`;

    await sendPinResetEmail(adminEmail, resetUrl);

    logInfo('auth', 'PIN reset email sent', { email: adminEmail }, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('auth', 'PIN reset request failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
