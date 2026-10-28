// src/lib/backup-email.ts
// Shared email-backup pipeline used by the weekly cron (trigger 'cron') and the
// manual admin action (trigger 'manual'). Builds the export, encrypts it with
// AES-256-GCM (BACKUP_ENCRYPTION_KEY), emails it to every address in
// BACKUP_DESTINATION_EMAILS, and maintains the metadata-only status document at
// admin/backupStatus. The actual backup contents never touch the status doc.
//
// Semantics (per the approved specification):
//   - SMTP acceptance (250) is recorded as 'submitted' — NEVER as confirmed delivery.
//   - lastSuccessAt advances only when every destination accepted the message.
//   - PIN_PEPPER travels inside the encrypted payload only (never logged/stored).
//   - Failures fail closed: nothing unencrypted or truncated is ever sent.
import { randomUUID } from 'crypto';
import { doc, getDoc, setDoc } from './firebase-admin';
import { buildPayload, serializePayload, encryptBuffer } from './backup-format.mjs';
import { exportCollectionsForBackup, type BackupExportResult } from './backup-export';
import { sendBackupEmail } from './mailer';
import { logInfo, logError } from './logger';

const DEFAULT_DESTINATIONS = 'bayanschool2026@gmail.com,elnewahy@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IN_PROGRESS_WINDOW_MS = 5 * 60_000;
const DEFAULT_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // Gmail hard limit is 25 MB

export interface EmailBackupOptions {
  trigger?: 'cron' | 'manual';
  /** Pre-exported snapshot (cron reuses the export it already made for Firestore storage). */
  data?: BackupExportResult['data'];
  startedAt?: string;
  endedAt?: string;
}

export interface EmailBackupResult {
  runId: string;
  status: 'submitted' | 'partial' | 'failed';
  accepted: string[];
  rejected: string[];
  sizeBytes: number;
  checksum: string;
  filename: string;
  totalDocuments: number;
}

export function getBackupDestinations(): string[] {
  const raw = process.env.BACKUP_DESTINATION_EMAILS || DEFAULT_DESTINATIONS;
  const list = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL_RE.test(s));
  return Array.from(new Set(list));
}

function sanitizeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\s+/g, ' ').slice(0, 200);
}

async function readStatus(db: any): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db, 'admin', 'backupStatus'));
  return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
}

async function writeStatus(db: any, patch: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db, 'admin', 'backupStatus'), { running: false, ...patch });
}

export async function runEmailBackup(
  db: any,
  options: EmailBackupOptions = {}
): Promise<EmailBackupResult> {
  const runId = randomUUID();
  const trigger = options.trigger || 'manual';
  const now = () => new Date().toISOString();

  // In-flight guard (best effort across serverless instances): a 'running' status
  // newer than 5 minutes blocks re-entry. Status itself is last-write-wins.
  const existing = await readStatus(db);
  if (existing?.running && typeof existing.lastAttemptAt === 'string') {
    const age = Date.now() - Date.parse(existing.lastAttemptAt);
    if (Number.isFinite(age) && age >= 0 && age < IN_PROGRESS_WINDOW_MS) {
      const err = new Error('A backup is already in progress');
      (err as { code?: string }).code = 'IN_PROGRESS';
      throw err;
    }
  }

  const destinations = getBackupDestinations();
  const fail = async (message: string): Promise<never> => {
    await writeStatus(db, {
      runId,
      trigger,
      running: false,
      status: 'failed',
      lastAttemptAt: now(),
      lastErrorAt: now(),
      lastError: sanitizeError(new Error(message)),
      destinations,
      finishedAt: now(),
    });
    const err = new Error(message);
    (err as { code?: string }).code = 'BACKUP_FAILED';
    throw err;
  };

  if (destinations.length === 0) {
    await fail('No valid backup destination email is configured (BACKUP_DESTINATION_EMAILS)');
  }
  const keyHex = process.env.BACKUP_ENCRYPTION_KEY;
  if (!keyHex) {
    await fail('BACKUP_ENCRYPTION_KEY is not configured');
  }

  await writeStatus(db, {
    runId,
    trigger,
    running: true,
    status: 'running',
    lastAttemptAt: now(),
    lastError: null,
    lastErrorAt: null,
    destinations,
  });

  try {
    const exportResult =
      options.data !== undefined
        ? {
            data: options.data,
            startedAt: options.startedAt || now(),
            endedAt: options.endedAt || now(),
            totalDocuments: Object.values(options.data).reduce((sum, docs) => sum + docs.length, 0),
          }
        : await exportCollectionsForBackup(db);
    const { data, startedAt, endedAt, totalDocuments } = exportResult;

    const pepper = process.env.PIN_PEPPER;
    if (!pepper) throw new Error('PIN_PEPPER is not configured');

    const payload = buildPayload({ data, startedAt, endedAt, pinPepper: pepper });
    const plain = serializePayload(payload);
    const enc = encryptBuffer(plain, String(keyHex), 1);

    const maxBytes = Number(process.env.BACKUP_MAX_ATTACHMENT_BYTES) || DEFAULT_MAX_ATTACHMENT_BYTES;
    if (enc.length > maxBytes) {
      throw new Error(`Encrypted backup is ${enc.length} bytes, exceeding the ${maxBytes}-byte attachment limit`);
    }

    const date = new Date().toISOString().slice(0, 10);
    const filename = `School-Achievements-Backup-${date}.enc`;
    const subject = `School-Achievements Backup — ${date} (${trigger})`;
    const { accepted, rejected } = await sendBackupEmail(destinations, subject, filename, enc);

    const allOk = accepted.length === destinations.length && rejected.length === 0;
    const status: EmailBackupResult['status'] = allOk ? 'submitted' : accepted.length > 0 ? 'partial' : 'failed';
    const finishedAt = now();
    const patch: Record<string, unknown> = {
      runId,
      trigger,
      running: false,
      status,
      lastAttemptAt: finishedAt,
      destinations: destinations.map((d) => ({ email: d, ok: accepted.includes(d) })),
      checksum: String((payload as { checksum: unknown }).checksum),
      sizeBytes: enc.length,
      keyVersion: 1,
      finishedAt,
      // 'submitted' = SMTP accepted by every destination; this is NOT confirmed delivery.
      lastSuccessAt: allOk ? finishedAt : (existing?.lastSuccessAt ?? null),
      lastError: allOk ? null : `delivery not confirmed for: ${rejected.join(', ') || 'all destinations'}`,
      lastErrorAt: allOk ? null : finishedAt,
    };
    await writeStatus(db, patch);

    logInfo('system', 'Email backup processed', {
      runId,
      trigger,
      status,
      destinations: `${accepted.length}/${destinations.length}`,
      sizeBytes: enc.length,
      totalDocuments,
    });

    return { runId, status, accepted, rejected, sizeBytes: enc.length, checksum: String((payload as { checksum: unknown }).checksum), filename, totalDocuments };
  } catch (err) {
    await writeStatus(db, {
      runId,
      trigger,
      running: false,
      status: 'failed',
      lastAttemptAt: now(),
      lastErrorAt: now(),
      lastError: sanitizeError(err),
      destinations,
      finishedAt: now(),
    }).catch(() => { /* status write is best-effort on the failure path */ });
    logError('system', 'Email backup failed', { runId, trigger, error: sanitizeError(err) });
    throw err;
  }
}
