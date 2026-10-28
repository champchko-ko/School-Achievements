// Weekly automated backup - triggered by Vercel cron (vercel.json)
// Two sinks, one snapshot:
//   1. Firestore `backups` collection (legacy channel — remains in place until the
//      email pipeline passes its retirement gate; see ANNOTATED-BACKUP-SPEC-2026-10-28.md).
//   2. Encrypted email to BACKUP_DESTINATION_EMAILS (new primary off-site channel).
// Protected by CRON_SECRET (constant-time) + admin session.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getAdminDb } from '../../../../lib/firebase-admin';
import { isAdminSession } from '../../../../lib/admin-session';
import { logInfo, logError } from '../../../../lib/logger';
import { exportCollectionsForBackup, BACKUP_COLLECTIONS } from '../../../../lib/backup-export';
import { runEmailBackup } from '../../../../lib/backup-email';

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

    // Export all collections once; the same snapshot feeds both backup sinks.
    const { data, startedAt, endedAt, totalDocuments } = await exportCollectionsForBackup(db);

    const backupPayload = {
      createdAt: new Date().toISOString(),
      source: 'cron',
      collections: [...BACKUP_COLLECTIONS],
      totalDocuments,
      data,
    };

    // Store the backup in the backups collection (legacy sink — removed in Stage 6)
    await db.collection('backups').add(backupPayload);

    // Prune old backups (keep the most recent MAX_BACKUPS)
    const backupSnap = await db.collection('backups').orderBy('createdAt', 'desc').get();
    if (backupSnap.size > MAX_BACKUPS) {
      const toDelete = backupSnap.docs.slice(MAX_BACKUPS);
      for (const docSnap of toDelete) {
        await docSnap.ref.delete();
      }
    }

    logInfo('system', 'Weekly backup completed', { totalDocuments, stored: true }, request);

    // New: email the same snapshot, encrypted. Failure here must not lose the
    // Firestore sink result; the status doc + admin banner surface the failure.
    let email: Record<string, unknown>;
    try {
      const result = await runEmailBackup(db, { data, startedAt, endedAt, trigger: 'cron' });
      email = { status: result.status, accepted: result.accepted.length, rejected: result.rejected, runId: result.runId };
    } catch (err: any) {
      email = {
        status: 'failed',
        error: err?.code === 'IN_PROGRESS'
          ? 'another backup is in progress'
          : String(err?.message || 'email backup failed').slice(0, 200),
      };
    }

    return NextResponse.json({
      success: true,
      createdAt: backupPayload.createdAt,
      totalDocuments,
      stored: true,
      email,
    });
  } catch (error: any) {
    logError('system', 'Weekly backup failed', error?.message || error, request);
    return NextResponse.json({ error: 'Weekly backup failed' }, { status: 500 });
  }
}
