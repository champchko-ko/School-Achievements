// Weekly automated backup - triggered by Vercel cron (vercel.json)
// Exports all Firestore collections and stores them in the backups collection
// with a rolling window of 8 weeks. Protected by CRON_SECRET + admin session.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdminDb } from '../../../../lib/firebase-admin';
import { isAdminSession } from '../../../../lib/admin-session';
import { logInfo, logError } from '../../../../lib/logger';
import { scrubSensitiveFields } from '../../../../lib/backup-sanitize';

const COLLECTIONS = ['achievements', 'settings', 'admin', 'logs'];
const MAX_BACKUPS = 8;

export async function GET(request: Request) {
  try {
    // Verify cron secret (set in Vercel env vars) OR admin session (Finding #13).
    // Constant-time comparison prevents timing side-channels; an empty/missing
    // secret can never authorize (no bypass).
    const authHeader = request.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET;
    let isCronAuthorized = false;
    if (cronSecret && authHeader) {
      const expected = Buffer.from(`Bearer ${cronSecret}`);
      const actual = Buffer.from(authHeader);
      isCronAuthorized =
        expected.length === actual.length && timingSafeEqual(expected, actual);
    }

    const isAdmin = await isAdminSession();

    if (!isCronAuthorized && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminDb();

    // Export all collections
    const backup: Record<string, any[]> = {};
    let totalDocs = 0;

    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).get();
      backup[col] = snap.docs.map((d: any) => {
        const data = d.data();
        const plain: Record<string, any> = { id: d.id, ...data };
        // Convert Firestore timestamps to ISO strings for portability
        for (const key of Object.keys(plain)) {
          const val = plain[key];
          if (val && typeof val === 'object' && typeof val.toDate === 'function') {
            plain[key] = val.toDate().toISOString();
          }
        }
        // Strip sensitive auth fields/PII before persisting the backup (Finding #17)
        return scrubSensitiveFields(plain);
      });
      totalDocs += snap.size;
    }

    const createdAt = new Date().toISOString();
    const backupPayload = {
      createdAt,
      source: 'cron',
      collections: COLLECTIONS,
      totalDocuments: totalDocs,
      data: backup,
    };

    // Store the backup in the backups collection
    await db.collection('backups').add(backupPayload);

    // Prune old backups (keep the most recent MAX_BACKUPS)
    const backupSnap = await db.collection('backups').orderBy('createdAt', 'desc').get();
    if (backupSnap.size > MAX_BACKUPS) {
      const toDelete = backupSnap.docs.slice(MAX_BACKUPS);
      for (const docSnap of toDelete) {
        await docSnap.ref.delete();
      }
    }

    logInfo('system', 'Weekly backup completed', { totalDocs, stored: true }, request);
    return NextResponse.json({ success: true, createdAt, totalDocuments: totalDocs });
  } catch (error: any) {
    logError('system', 'Weekly backup failed', error?.message || error, request);
    return NextResponse.json({ error: 'Weekly backup failed' }, { status: 500 });
  }
}
