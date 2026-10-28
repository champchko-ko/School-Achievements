#!/usr/bin/env node
// scripts/restore-backup.mjs
// Decrypt → verify → validate → (optionally) restore a School-Achievements email backup.
//
// Usage:
//   node scripts/restore-backup.mjs --file <path.enc>
//       Validate only (dry-run): decryption, tamper check, structure, counts, pepper match.
//       Needs only the key — no Firebase credentials.
//
//   node scripts/restore-backup.mjs --file <path.enc> --target emulator --confirm-restore
//       Restore into the local Firestore Emulator.
//       Start it first:  npx firebase emulators:start --only firestore
//       and set:         FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
//       Project id defaults to 'school-achievements-restore' (or pass --project-id).
//
//   node scripts/restore-backup.mjs --file <path.enc> --target firestore --project-id <id> --confirm-restore
//       Restore into a real Firebase project (scratch project for the retirement gate).
//       Requires FIREBASE_SERVICE_ACCOUNT (JSON string or base64) in the environment.
//
//   Key source: --key <64-hex> or BACKUP_ENCRYPTION_KEY env var.
//
// Safety rails:
//   - Nothing is written unless BOTH --target and --confirm-restore are provided.
//   - Production restores are your responsibility: prefer the scratch project.
//   - Pepper check: if the backup's PIN_PEPPER differs from this environment's
//     PIN_PEPPER, restore aborts (all PIN hashes would be invalid) unless --force-pepper.
//   - Restore is a merge upsert (same semantics as /api/backup restore): it adds/overwrites
//     documents from the backup but does not delete documents created after the backup.

import { readFileSync } from 'node:fs';
import { parseAndVerify, validatePayload } from '../src/lib/backup-format.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  args[a.slice(2)] = next && !next.startsWith('--') ? (++i, next) : true;
}

const file = args.file;
if (!file) {
  console.error('Error: --file <path.enc> is required');
  process.exit(2);
}
const key = args.key || process.env.BACKUP_ENCRYPTION_KEY;
if (!key) {
  console.error('Error: no key. Pass --key <64-hex> or set BACKUP_ENCRYPTION_KEY.');
  process.exit(2);
}

// ── 1. Decrypt + authenticate ──
let enc;
try {
  enc = readFileSync(file);
} catch (e) {
  console.error(`Error: cannot read ${file}: ${e.message}`);
  process.exit(1);
}

let payload, keyVersion;
try {
  ({ payload, keyVersion } = parseAndVerify(enc, key));
} catch (e) {
  console.error(`FAILED: ${e.message}`);
  console.error('The file is not a valid backup, was tampered with, or the key is wrong. Nothing was restored.');
  process.exit(1);
}
console.log(`OK: decrypted (keyVersion ${keyVersion}), authentication tag verified — file is intact.`);

// ── 2. Structural validation + counts ──
const v = validatePayload(payload);
if (!v.ok) {
  console.error(`FAILED validation: ${v.errors.join('; ')}`);
  process.exit(1);
}
console.log('OK: structure valid.');
for (const [col, count] of Object.entries(v.counts)) {
  console.log(`     ${col}: ${count} document(s)`);
}
console.log(`     snapshot window: ${payload.startedAt} → ${payload.endedAt}`);
console.log(`     checksum: ${payload.checksum}`);

// ── 3. Pepper compatibility ──
const pepperMatch = payload.pinPepper === process.env.PIN_PEPPER;
if (!pepperMatch) {
  console.warn('WARNING: PIN_PEPPER MISMATCH — the backup was created with a different pepper.');
  console.warn('         Restoring as-is would make every teacher/admin PIN hash invalid.');
  if (!args['force-pepper']) {
    console.error('Aborting. Re-run with --force-pepper only if you understand the consequence.');
    process.exit(1);
  }
  console.warn('Proceeding because --force-pepper was passed.');
} else {
  console.log('OK: PIN_PEPPER matches this environment.');
}

// ── 4. Dry-run stop ──
const target = args.target;
if (!args['confirm-restore'] || !target) {
  console.log('\nDRY RUN — nothing was written.');
  console.log('To restore, re-run with --target emulator|firestore --confirm-restore');
  process.exit(0);
}

if (target !== 'emulator' && target !== 'firestore') {
  console.error('Error: --target must be "emulator" or "firestore".');
  process.exit(2);
}

// ── 5. Connect to the target ──
let db;
try {
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (target === 'emulator') {
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      console.error('Error: FIRESTORE_EMULATOR_HOST is not set.');
      console.error('Start the emulator:  npx firebase emulators:start --only firestore');
      console.error('Then set:            FIRESTORE_EMULATOR_HOST=127.0.0.1:8080');
      process.exit(2);
    }
    const projectId = args['project-id'] || 'school-achievements-restore';
    const app = getApps().length ? getApps()[0] : initializeApp({ projectId });
    db = getFirestore(app);
    console.log(`Target: Firestore Emulator (${process.env.FIRESTORE_EMULATOR_HOST}, project "${projectId}")`);
  } else {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccount) {
      console.error('Error: FIREBASE_SERVICE_ACCOUNT is not set (required for --target firestore).');
      process.exit(2);
    }
    if (!args['project-id']) {
      console.error('Error: --project-id is required when restoring into a real Firebase project.');
      process.exit(2);
    }
    let parsed;
    try {
      parsed = JSON.parse(serviceAccount);
    } catch {
      parsed = JSON.parse(Buffer.from(serviceAccount, 'base64').toString('utf8'));
    }
    if (typeof parsed.private_key === 'string') parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    const { cert } = await import('firebase-admin/app');
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(parsed), projectId: args['project-id'] });
    db = getFirestore(app);
    console.log(`Target: Firebase project "${args['project-id']}" — verify this is NOT production unless you intend it.`);
  }
} catch (e) {
  console.error(`Error initializing Firebase: ${e.message}`);
  process.exit(1);
}

// ── 6. Restore (merge upsert, Timestamp hydration identical to /api/backup) ──
const { Timestamp } = await import('firebase-admin/firestore');
let restored = 0;
const restoredCounts = {};
try {
  for (const [col, docs] of Object.entries(payload.data)) {
    restoredCounts[col] = 0;
    for (const doc of docs) {
      const { id, ...docData } = doc;
      if (!id) continue;
      const hydrated = { ...docData };
      for (const k of Object.keys(hydrated)) {
        const val = hydrated[k];
        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
          hydrated[k] = Timestamp.fromDate(new Date(val));
        }
      }
      await db.collection(col).doc(id).set(hydrated, { merge: true });
      restored++;
      restoredCounts[col]++;
    }
  }
} catch (e) {
  console.error(`FAILED during restore: ${e.message}`);
  console.error('The restore is a merge upsert — already-written documents remain. Fix the issue and re-run.');
  process.exit(1);
}

console.log(`\nDONE: ${restored} document(s) restored (merge upsert):`);
for (const [col, count] of Object.entries(restoredCounts)) {
  console.log(`     ${col}: ${count}`);
}
console.log('Next: verify record counts and spot-check documents in the target project.');
