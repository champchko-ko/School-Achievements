// src/app/api/pin/route.ts
// Server-side PIN hashing with pbkdf2 + secret pepper
// The PIN itself is NEVER stored in Firestore - only a hash

import { NextResponse } from 'next/server';
import { pbkdf2Sync, randomBytes } from 'crypto';

function getPepper(): string {
  return process.env.PIN_PEPPER || 'school-achievements-default-pepper-change-in-production';
}

function hashPin(pin: string, achievementId: string): string {
  const pepper = getPepper();
  // Salt = achievementId + pepper (the pepper is server-only)
  const salt = `${achievementId}-${pepper}`;
  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
  return hash.toString('hex');
}

// POST /api/pin — store a new PIN hash for an achievement
export async function POST(request: Request) {
  try {
    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ error: 'PIN must be exactly 4 digits' }, { status: 400 });
    }

    // Write the hash to Firestore via REST API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/achievements/${achievementId}?key=${apiKey}`;

    const hash = hashPin(pin, achievementId);

    const body = {
      fields: {
        pinHash: { stringValue: hash },
      },
    };

    // Use PATCH to merge the pinHash field into the existing document
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Firestore write error:', errText);
      return NextResponse.json({ error: 'Failed to store PIN hash' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PIN storage error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// PUT /api/pin — verify a PIN against the stored hash
export async function PUT(request: Request) {
  try {
    const { achievementId, pin } = await request.json();

    if (!achievementId || !pin) {
      return NextResponse.json({ error: 'achievementId and pin required' }, { status: 400 });
    }

    // Read the hash from Firestore via REST API
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/achievements/${achievementId}?key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ valid: false, error: 'Achievement not found' }, { status: 404 });
    }

    const data = await res.json();
    const fields = data.fields || {};
    const storedHash = fields.pinHash?.stringValue;

    if (!storedHash) {
      return NextResponse.json({ valid: false, error: 'No PIN set for this achievement' });
    }

    // Hash the input and compare
    const inputHash = hashPin(pin, achievementId);
    const valid = inputHash === storedHash;

    return NextResponse.json({ valid });
  } catch (error) {
    console.error('PIN verification error:', error);
    return NextResponse.json({ valid: false, error: 'Internal error' }, { status: 500 });
  }
}
