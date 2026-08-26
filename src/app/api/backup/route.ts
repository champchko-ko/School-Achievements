// POST: Export all Firestore collections as downloadable JSON (admin required)
// GET: Check backup status / collection counts
import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../lib/admin-session';
import { getAdminDb } from '../../../lib/firebase-admin';
import { logInfo, logError } from '../../../lib/logger';

const COLLECTIONS = ['achievements', 'settings', 'admin', 'logs'];

export async function POST(request: Request) {
  try {
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 401 });
    }

    const db = getAdminDb();
    const backup: Record<string, any[]> = {};
    let totalDocs = 0;

    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).get();
      backup[col] = snap.docs.map((d: any) => ({
        id: d.id,
        ...d.data(),
        // Convert Firestore timestamps to ISO strings for portability
        ...(d.data().timestamp?.toDate ? { timestamp: d.data().timestamp.toDate().toISOString() } : {}),
      }));
      totalDocs += snap.size;
    }

    logInfo('system', 'Database backup created', { totalDocs, collections: COLLECTIONS.length }, request);

    const backupPayload = {
      createdAt: new Date().toISOString(),
      collections: COLLECTIONS,
      totalDocuments: totalDocs,
      data: backup,
    };

    return NextResponse.json(backupPayload);
  } catch (error: any) {
    logError('system', 'Backup failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 401 });
    }

    const db = getAdminDb();
    const counts: Record<string, number> = {};
    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).count().get();
      counts[col] = snap.data().count;
    }

    return NextResponse.json({ collections: COLLECTIONS, counts });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
