// src/app/api/pin/reset/route.ts
// POST: Request a password reset (sends email with time-limited token)

import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { logInfo, logError, logRateLimitHit } from '../../../../lib/logger';
import { checkRateLimit } from '../../../../lib/rate-limit';
import { getAdminDb, doc, getDoc, setDoc } from '../../../../lib/firebase-admin';
import { sendPinResetEmail } from '../../../../lib/mailer';
import { isValidOrigin } from '../../../../lib/csrf';

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(request: Request) {
  try {
    // CSRF protection (MUST-06)
    if (!isValidOrigin(request)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Rate limit: max 3 requests per hour per IP (leftmost IP - MUST-14)
    const rawIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const ip = rawIp.split(',')[0].trim() || 'unknown';
    const { allowed } = await checkRateLimit(`pin-reset:${ip}`, { maxRequests: 3, windowMs: 60 * 60 * 1000 });
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
    // Retrieve admin email from protected admin/pinConfig first, with fallback to settings/global_info (MUST-03)
    const pinConfigSnap = await getDoc(doc(db, "admin", "pinConfig"));
    const protectedEmail = pinConfigSnap.exists() ? pinConfigSnap.data()?.adminEmail : '';
    
    let adminEmail = (protectedEmail || '').trim().toLowerCase();
    if (!adminEmail) {
      const settingsSnap = await getDoc(doc(db, "settings", "global_info"));
      adminEmail = settingsSnap.exists() ? (settingsSnap.data()?.adminEmail || '').trim().toLowerCase() : '';
    }

    // Security: always return the same message whether or not the email matches (prevents enumeration)
    if (!adminEmail || adminEmail !== email.trim().toLowerCase()) {
      return NextResponse.json({ success: true });
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      logError('auth', 'SMTP not configured for pin reset', undefined, request);
      return NextResponse.json({ error: 'خدمة البريد غير مهيأة بعد.' }, { status: 500 });
    }

    // Strictly enforce NEXT_PUBLIC_APP_URL without trusting request headers (MUST-07)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) {
      logError('auth', 'NEXT_PUBLIC_APP_URL is not set', undefined, request);
      return NextResponse.json({ error: 'إعدادات عنوان الموقع غير مكتملة.' }, { status: 500 });
    }

    // Generate a secure token and store ONLY its hash, keyed by tokenHash for concurrency (MUST-23)
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + TOKEN_TTL_MS;

    await setDoc(doc(db, "admin", "pinResets", tokenHash), {
      tokenHash,
      email: adminEmail,
      expiresAt,
      used: false,
      createdAt: Date.now(),
    });

    const cleanAppUrl = appUrl.replace(/\/+$/, '');
    const resetUrl = `${cleanAppUrl}/reset-pin?token=${token}`;

    await sendPinResetEmail(adminEmail, resetUrl);

    logInfo('auth', 'PIN reset email sent', { email: adminEmail }, request);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    logError('auth', 'PIN reset request failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

