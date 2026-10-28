// src/lib/backup-format.mjs
// Backup payload format shared by the email-backup pipeline (cron + manual) and
// scripts/restore-backup.mjs. Plain ESM on purpose: importable from Next.js
// server code, Node scripts, and vitest alike. Dependency-free (node:crypto only).
//
// Envelope (JSON, canonicalized before hashing):
// {
//   format: 'school-achievements-backup',
//   schemaVersion: 1,
//   keyVersion: 1,
//   startedAt: ISO, endedAt: ISO,
//   counts: { [collection]: number },
//   checksum: sha256hex(canonicalize(data)),
//   pinPepper: string,          // SECRET — restore requires it; never logged or stored elsewhere
//   data: { [collection]: [{ id, ...doc }] }
// }
//
// Encrypted file layout: 'SABK1' (5B ASCII) + keyVersion (1B) + iv (12B) + authTag (16B) + ciphertext
// AES-256-GCM → the auth tag makes any tampering (including bit-flips) fail decryption.

import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const FORMAT_NAME = 'school-achievements-backup';
export const CURRENT_SCHEMA_VERSION = 1;
export const MAGIC = Buffer.from('SABK1', 'ascii');

const REQUIRED_COLLECTIONS = ['achievements', 'settings', 'admin', 'admin_achievementSecrets'];

/**
 * Deterministic JSON serialization: object keys sorted recursively, arrays keep order.
 * Same logical object always produces the same string → stable checksums.
 */
export function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Build the backup envelope. `data` maps collection name → array of docs (each with `id`).
 * `pinPepper` is stored INSIDE the payload so a restore can verify environment compatibility;
 * it is never written to status docs, logs, filenames, or email subjects.
 */
export function buildPayload({ data, startedAt, endedAt, pinPepper, keyVersion = 1 }) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('backup payload: data must be an object of collections');
  }
  for (const col of REQUIRED_COLLECTIONS) {
    if (!Array.isArray(data[col])) throw new Error(`backup payload: missing collection "${col}"`);
  }
  if (!pinPepper || typeof pinPepper !== 'string') {
    throw new Error('backup payload: pinPepper is required');
  }
  const counts = {};
  for (const [col, docs] of Object.entries(data)) {
    if (!Array.isArray(docs)) throw new Error(`backup payload: collection "${col}" must be an array`);
    counts[col] = docs.length;
  }
  return {
    format: FORMAT_NAME,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    keyVersion,
    startedAt,
    endedAt,
    counts,
    checksum: sha256Hex(canonicalize(data)),
    pinPepper,
    data,
  };
}

export function serializePayload(payload) {
  return Buffer.from(canonicalize(payload), 'utf8');
}

function toKeyBuffer(keyHex) {
  if (typeof keyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new Error('BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(keyHex, 'hex');
}

/** Encrypt → SABK1 header + keyVersion + iv + authTag + ciphertext */
export function encryptBuffer(plain, keyHex, keyVersion = 1) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', toKeyBuffer(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, Buffer.from([keyVersion & 0xff]), iv, tag, ciphertext]);
}

/** Decrypt + authenticate. Throws on wrong key or any tampering (GCM tag mismatch). */
export function decryptBuffer(enc, keyHex) {
  if (!Buffer.isBuffer(enc)) throw new Error('backup file must be a Buffer');
  if (enc.length < MAGIC.length + 1 + 12 + 16 || !enc.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('not a School-Achievements backup file (bad header)');
  }
  const keyVersion = enc[MAGIC.length];
  const iv = enc.subarray(MAGIC.length + 1, MAGIC.length + 13);
  const tag = enc.subarray(MAGIC.length + 13, MAGIC.length + 29);
  const ciphertext = enc.subarray(MAGIC.length + 29);
  const decipher = createDecipheriv('aes-256-gcm', toKeyBuffer(keyHex), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return { keyVersion, plain };
}

/**
 * Structural + integrity validation. Returns { ok, errors, counts }.
 * Recomputes the data checksum independently of the encryption layer.
 */
export function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['payload is not an object'], counts: {} };
  }
  if (payload.format !== FORMAT_NAME) errors.push(`format mismatch: ${String(payload.format)}`);
  if (typeof payload.schemaVersion !== 'number') errors.push('schemaVersion missing');
  else if (payload.schemaVersion > CURRENT_SCHEMA_VERSION) {
    errors.push(`schemaVersion ${payload.schemaVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}`);
  }
  if (typeof payload.checksum !== 'string' || payload.checksum.length !== 64) {
    errors.push('checksum missing or malformed');
  }
  if (!payload.pinPepper || typeof payload.pinPepper !== 'string') {
    errors.push('pinPepper missing (backup cannot restore PIN verification)');
  }
  if (!payload.startedAt || !payload.endedAt || typeof payload.startedAt !== 'string' || typeof payload.endedAt !== 'string') {
    errors.push('startedAt/endedAt missing');
  }
  const counts = {};
  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    errors.push('data missing or malformed');
  } else {
    for (const col of REQUIRED_COLLECTIONS) {
      if (!Array.isArray(payload.data[col])) {
        errors.push(`missing collection "${col}"`);
        continue;
      }
      counts[col] = payload.data[col].length;
      for (const doc of payload.data[col]) {
        if (!doc || typeof doc !== 'object' || typeof doc.id !== 'string' || doc.id.length === 0) {
          errors.push(`collection "${col}" contains a doc without a string id`);
          break;
        }
      }
    }
    if (payload.counts && typeof payload.counts === 'object') {
      for (const col of Object.keys(counts)) {
        if (Number(payload.counts[col]) !== counts[col]) {
          errors.push(`counts.${col} (${payload.counts[col]}) does not match actual (${counts[col]})`);
        }
      }
    }
    if (errors.length === 0 && payload.checksum) {
      const recomputed = sha256Hex(canonicalize(payload.data));
      if (recomputed !== payload.checksum) errors.push('checksum mismatch — payload data was corrupted or altered');
    }
  }
  return { ok: errors.length === 0, errors, counts };
}

/** One-call decrypt + parse + validate. Returns { payload, keyVersion }. Throws on any failure. */
export function parseAndVerify(enc, keyHex) {
  const { keyVersion, plain } = decryptBuffer(enc, keyHex);
  let payload;
  try {
    payload = JSON.parse(plain.toString('utf8'));
  } catch {
    throw new Error('decrypted payload is not valid JSON');
  }
  const result = validatePayload(payload);
  if (!result.ok) {
    const err = new Error(`backup validation failed: ${result.errors.join('; ')}`);
    err.validationErrors = result.errors;
    throw err;
  }
  return { payload, keyVersion };
}
