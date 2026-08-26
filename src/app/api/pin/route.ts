// src/app/api/pin/route.ts
// Server-side PIN hashing with pbkdf2 + secret pepper
// The PIN itself is NEVER stored in Firestore - only a hash

import { NextResponse } from 'next/server';
import { checkRateLimit } from '../../../lib/rate-limit';
import { pbkdf2Sync } from 'crypto';
import { getAdminDb, doc, getDoc, updateDoc } from '../../../lib/firebase-admin';

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

// POST /api/pin — store a new PIN hash for an achievement (admin only)
// Note: The client now uses POST /api/achievements which handles PIN storage internally.
// This endpoint is kept for admin use only.
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

    // Require admin session
    const { isAdminSession } = await import('../../../lib/admin-session');
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء.' }, { status: 401 });
    }

    // Rate limit: max 20 PIN storage requests per minute per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const { allowed } = checkRateLimit(`pin-store:${ip}`, { maxRequests: 20, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ error: 'محاولات كثيرة جداً. الرجاء الانتظار.' }, { status: 429 });
    }

    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    const hash = hashPin(pin, achievementId);

    const db = getAdminDb();
    await updateDoc(doc(db, 'achievements', achievementId), {
      pinHash: hash,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PIN storage error:', error?.message || error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT /api/pin — verify a PIN against the stored hash
export async function PUT(request: Request) {
  try {
    // Rate limit: max 30 PIN verification attempts per minute per IP
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const { allowed } = checkRateLimit(`pin-verify:${ip}`, { maxRequests: 30, windowMs: 60_000 });
    if (!allowed) {
      return NextResponse.json({ valid: false, error: 'محاولات كثيرة جداً. الرجاء الانتظار.' }, { status: 429 });
    }

    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }

    const db = getAdminDb();
    const docSnap = await getDoc(doc(db, 'achievements', achievementId));
    
    if (!docSnap.exists()) {
      return NextResponse.json({ valid: false, error: 'Achievement not found' }, { status: 404 });
    }

    const storedHash = docSnap.data()?.pinHash;
    if (!storedHash) {
      return NextResponse.json({ valid: false, error: 'No PIN set for this achievement' });
    }

    const inputHash = hashPin(pin, achievementId);
    const valid = inputHash === storedHash;

    return NextResponse.json({ valid });
  } catch (error: any) {
    console.error('PIN verification error:', error?.message || error);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
