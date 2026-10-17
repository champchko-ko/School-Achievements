// src/lib/backup-sanitize.ts
// Removes sensitive authentication fields from documents before they are
// persisted into automated weekly backups (Finding #17). Backups are stored in
// Firestore and may be exported/shared, so secrets and PII must not be copied.

export const SENSITIVE_BACKUP_FIELDS = [
  'pinHash',
  'tokenHash',
  'adminPin',
  'adminEmail',
] as const;

export type SensitiveBackupField = (typeof SENSITIVE_BACKUP_FIELDS)[number];

/**
 * Return a shallow copy of `docData` with all sensitive fields removed.
 * The input object is never mutated.
 */
export function scrubSensitiveFields<T extends Record<string, unknown>>(
  docData: T
): Record<string, unknown> {
  const plain: Record<string, unknown> = { ...docData };
  for (const field of SENSITIVE_BACKUP_FIELDS) {
    if (field in plain) {
      delete plain[field];
    }
  }
  return plain;
}
