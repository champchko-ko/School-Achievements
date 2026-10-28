// POST: Export all Firestore collections as downloadable JSON (admin required)
// POST { action: "list" } : List stored backups from backups collection
// POST { action: "restore", backupId: "..." } : Restore from a stored backup
// POST { action: "email" } : Encrypt + email a backup to the configured destinations (manual admin action)
// GET: Check backup status / collection counts / email-backup status
import { NextResponse } from 'next/server';
import { isAdminSession } from '../../../lib/admin-session';
import { getAdminDb, doc, getDoc, Timestamp } from '../../../lib/firebase-admin';
import { logInfo, logError } from '../../../lib/logger';
import { isValidOrigin } from '../../../lib/csrf';
import { checkRateLimit, getClientIp } from '../../../lib/rate-limit';
import { runEmailBackup } from '../../../lib/backup-email';

const COLLECTIONS = ['achievements', 'settings', 'admin', 'admin_achievementSecrets'];

// POST: Export backup, list backups, or restore from backup
export async function POST(request: Request) {
  try {
    const isAdmin = await isAdminSession();
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin required' }, { status: 401 });
    }

    const db = getAdminDb();
    let body: any;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const action = body.action || 'download';

    // ── Email an encrypted backup to the configured destinations (manual admin action) ──
    if (action === 'email') {
      // CSRF: this action exports and transmits data, so it requires a trusted origin.
      if (!isValidOrigin(request)) {
        return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
      }
      const ip = getClientIp(request);
      const { allowed } = await checkRateLimit(`backup-email:${ip}`, { maxRequests: 5, windowMs: 3_600_000 });
      if (!allowed) {
        return NextResponse.json({ error: 'محاولات كثيرة جداً. الرجاء المحاولة لاحقاً.' }, { status: 429 });
      }
      try {
        const result = await runEmailBackup(db, { trigger: 'manual' });
        return NextResponse.json({
          success: true,
          runId: result.runId,
          status: result.status,
          accepted: result.accepted,
          rejected: result.rejected,
          sizeBytes: result.sizeBytes,
          filename: result.filename,
          totalDocuments: result.totalDocuments,
        });
      } catch (err: any) {
        if (err?.code === 'IN_PROGRESS') {
          return NextResponse.json({ error: 'جارية عملية نسخ احتياطي أخرى. حاول بعد بضع دقائق.' }, { status: 409 });
        }
        return NextResponse.json({ error: String(err?.message || 'فشل إرسال النسخة الاحتياطية').slice(0, 200) }, { status: 500 });
      }
    }

    // ── List stored backups ──
    if (action === 'list') {
      const snap = await db.collection('backups').orderBy('createdAt', 'desc').get();
      const backups = snap.docs.map((d: any) => ({
        id: d.id,
        createdAt: d.data().createdAt || '',
        source: d.data().source || 'manual',
        totalDocuments: d.data().totalDocuments || 0,
        collections: d.data().collections || [],
      }));
      return NextResponse.json({ backups });
    }

    // ── Restore from a stored backup (with dry-run preview & confirm - MUST-16) ──
    if (action === 'restore' || action === 'preview_restore') {
      const backupId = body.backupId;
      if (!backupId) {
        return NextResponse.json({ error: 'backupId is required' }, { status: 400 });
      }

      const backupSnap = await db.collection('backups').doc(backupId).get();
      if (!backupSnap.exists) {
        return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
      }

      const backupData = backupSnap.data()!;
      const data = backupData.data || {};

      const summary: Record<string, number> = {};
      let totalCount = 0;
      for (const col of COLLECTIONS) {
        const count = Array.isArray(data[col]) ? data[col].length : 0;
        summary[col] = count;
        totalCount += count;
      }

      // Dry-run preview
      if (action === 'preview_restore' || body.dryRun === true) {
        return NextResponse.json({ preview: true, backupId, summary, totalDocuments: totalCount });
      }

      // Require explicit admin confirmation
      if (body.confirm !== true) {
        return NextResponse.json({
          error: 'تأكيد الاستعادة مطلوب (يرجى إرسال confirm: true بعد معاينة البيانات).',
          preview: { backupId, summary, totalDocuments: totalCount }
        }, { status: 400 });
      }

      let restored = 0;
      for (const col of COLLECTIONS) {
        const docs = data[col] || [];
        for (const doc of docs) {
          const { id, ...docData } = doc;
          if (id) {
            // Restore Firestore Timestamp instances so downstream code (like .toDate() / .seconds) works
            const hydratedData: Record<string, any> = { ...docData };
            for (const key of Object.keys(hydratedData)) {
              const val = hydratedData[key];
              if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
                hydratedData[key] = Timestamp.fromDate(new Date(val));
              }
            }
            await db.collection(col).doc(id).set(hydratedData, { merge: true });
            restored++;
          }
        }
      }

      logInfo('system', 'Backup restored', { backupId, restoredDocs: restored }, request);
      return NextResponse.json({ success: true, restored, summary });
    }

    // ── Default: Download backup as JSON (existing behavior) ──
    const backup: Record<string, any[]> = {};
    let totalDocs = 0;

    for (const col of COLLECTIONS) {
      const snap = await db.collection(col).get();
      backup[col] = snap.docs.map((d: any) => {
        const data = d.data();
        const plain: Record<string, any> = { id: d.id, ...data };
        for (const key of Object.keys(plain)) {
          const val = plain[key];
          if (val && typeof val === 'object' && typeof val.toDate === 'function') {
            plain[key] = val.toDate().toISOString();
          }
        }
        // Strip secrets from downloadable backup payload (MUST-22)
        delete plain.pinHash;
        delete plain.tokenHash;
        delete plain.adminPin;
        delete plain.adminEmail;
        return plain;
      });
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
    logError('system', 'Backup operation failed', { error: error?.message }, request);
    return NextResponse.json({ error: 'Backup operation failed' }, { status: 500 });
  }
}

// GET: Check backup status / collection counts
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

    // Metadata-only status of the email-backup pipeline (admin/backupStatus).
    const statusSnap = await getDoc(doc(db, 'admin', 'backupStatus'));
    const status = statusSnap.exists() ? statusSnap.data() : null;

    return NextResponse.json({ collections: COLLECTIONS, counts, status });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
