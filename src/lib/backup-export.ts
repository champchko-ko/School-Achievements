// src/lib/backup-export.ts
// Firestore-coupled export used by the weekly cron, the manual email backup, and the
// emulator restore test. Produces one consistent snapshot shape for every backup sink.
//
// Restorability rules (verified during the production-readiness audit, finding C-1):
//   - admin_achievementSecrets keeps its pinHash   → restores every teacher PIN
//   - admin/pinConfig keeps pinHash + adminEmail   → restores admin login + reset path
//   - every other document is scrubbed of the four sensitive fields (backup-sanitize)
import { scrubSensitiveFields } from './backup-sanitize';

export const BACKUP_COLLECTIONS = ['achievements', 'settings', 'admin', 'admin_achievementSecrets'] as const;

export type BackupCollection = (typeof BACKUP_COLLECTIONS)[number];

export interface ExportedBackupData {
  [collection: string]: Array<{ id: string; [key: string]: unknown }>;
}

export interface BackupExportResult {
  data: ExportedBackupData;
  startedAt: string;
  endedAt: string;
  totalDocuments: number;
}

/** Export all backup collections. Firestore Timestamps are converted to ISO strings. */
export async function exportCollectionsForBackup(
  db: any,
  startedAt: string = new Date().toISOString()
): Promise<BackupExportResult> {
  const data: ExportedBackupData = {};
  let totalDocuments = 0;

  for (const col of BACKUP_COLLECTIONS) {
    const snap = await db.collection(col).get();
    data[col] = snap.docs.map((d: any) => {
      const plain: Record<string, unknown> = { id: d.id, ...d.data() };
      for (const key of Object.keys(plain)) {
        const val = plain[key];
        if (val && typeof val === 'object' && typeof (val as { toDate?: unknown }).toDate === 'function') {
          plain[key] = (val as { toDate: () => Date }).toDate().toISOString();
        }
      }
      if (col === 'admin_achievementSecrets') return plain;
      if (col === 'admin' && d.id === 'pinConfig') {
        delete plain.tokenHash;
        return plain;
      }
      return scrubSensitiveFields(plain) as Record<string, unknown>;
    });
    totalDocuments += snap.size;
  }

  return { data, startedAt, endedAt: new Date().toISOString(), totalDocuments };
}
