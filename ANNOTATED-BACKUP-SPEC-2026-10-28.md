# Annotated Specification — Email Backup & Recovery System (READY FOR IMPLEMENTATION)

**Status:** Approved 2026-10-28 (all three decisions confirmed; two security refinements incorporated). Base commit: `256861d` (remediation commit — verified: 25 files, finding-by-finding message, secret-scan clean). Implement **on top of this commit**, one stage per commit, nothing removed until the Stage 5 retirement gate passes.

**Two standing rules from the repo:** (1) `AGENTS.md` warns this is Next.js 16 with breaking API changes — consult `node_modules/next/dist/docs/` before writing route/page code. (2) Never commit secrets, `.env*`, keys, or backup files (`.gitignore` already enforces most of this).

---

## 0. Decisions (approved — do not re-litigate)

| # | Decision | Resolution |
|---|---|---|
| 1 | **Key custody** | Random 32-byte `BACKUP_ENCRYPTION_KEY` (hex) in **Vercel env vars only** + one offline recovery copy in the admin's password manager. Never with the backup, never in Git, never in the mailbox. Key rotation: re-encrypt nothing; new key applies to future backups — document that old emails need the old key (Gmail thread keeps which key era produced it via `keyVersion` field below). Losing both copies = backups unrecoverable; this is documented, accepted physics. |
| 2 | **Restore testing** | **Both:** Firestore Emulator for repeatable automated restore tests; one real restore into a **scratch Firebase project** (no production data, isolated credentials, clearly named `school-achievements-restore-scratch`) as the retirement gate. |
| 3 | **Retention** | Keep all backup emails in Gmail (primary off-site archive). With caveat: monitor mailbox capacity (Gmail 15 GB free tier; at ~1 MB/week this is years, but document a yearly check), never assume provider-side permanent retention. |
| R1 | **PIN_PEPPER** | Restore **does** require it (all PIN hashes are pepper-derived — restoring under a different pepper silently invalidates every PIN). Therefore: include `PIN_PEPPER` **inside the encrypted payload only** (never in plaintext metadata, filenames, subject lines, logs, or status fields), and document that restore validates it matches the target environment, refusing a mismatch unless explicitly overridden. |
| R2 | **Consistency** | Sequential export with `startedAt`/`endedAt` recorded; explicitly documented as **not transactionally consistent** across collections. Schedule remains Sunday `00:00 UTC` = 03:00 (UTC+3) Sunday local — start of the school week's quietest hours; **operator to confirm this suits actual school activity** before Stage 4 sign-off. |

---

## 1. Architecture (grounded in the current codebase — verified locations)

```
┌─ Stage 2: src/lib/backup-format.mjs  (plain ESM — importable by BOTH Next server code and node scripts)
│    exportCollectionData()  → reuse COLLECTIONS = ['achievements','settings','admin','admin_achievementSecrets']
│    buildPayload()          → { format:'school-achievements-backup', schemaVersion:1, keyVersion:1,
│                                startedAt, endedAt, counts, data:{col:[{id,...doc}]}, pinPepper }
│    canonicalize → SHA-256 checksum (hex, over canonical JSON)
│    encrypt(payloadBuffer)  → AES-256-GCM, random 12-byte IV, output = magic 'SABK1' + keyVersion(u8) + iv(12) + authTag(16) + ciphertext
│    decrypt+verify(fileBuffer, key) → throws on tag mismatch (tamper detection), returns {payload, checksumOk}
│    validatePayload(payload) → schema/version/shape/counts/required-collections checks
│
├─ Stage 3: src/lib/mailer.ts        → add sendBackupEmail(to, filename, buffer) (existing SMTP transport; attachment ≤ 20 MB guard)
│            src/app/api/cron/weekly-backup/route.ts → rewrite body: auth unchanged (CRON_SECRET constant-time + admin session)
│                build → encrypt → email elnewahy@gmail.com (env BACKUP_DESTINATION_EMAIL, default elnewahy@gmail.com)
│                → write status doc; on any failure write sanitized lastError (see §3). NEVER delete/modify `backups` collection here yet.
│            src/app/api/backup/route.ts → new POST action 'email' (admin session + isValidOrigin + reuse checkRateLimit + same pipeline);
│                GET extended to return the status doc (admin-session gated as today).
│            src/app/admin/page.tsx → banner + "إرسال نسخة احتياطية إلى البريد" button in the existing backup panel (settings backup section stays intact).
│
├─ Stage 4: scripts/restore-backup.mjs → decrypt → checksum → validate → (optionally restore into target)
│            --file <path.enc> [--key <hex>|BACKUP_ENCRYPTION_KEY] --target emulator|scratch|production --dry-run
│            Restore logic mirrors api/backup restore: Timestamp.fromDate hydration, merge:true, pepper-mismatch refusal.
│            Tests: vitest unit (format/crypto/validate/tamper/wrong-key) + vitest emulator test file that SKIPS unless FIRESTORE_EMULATOR_HOST is set.
│
└─ Stage 6 (gated): retirement of the Firestore `backups` mechanism.
```

**Status doc:** real 2-segment path `admin/backupStatus` (no shim involvement; `admin` collection is already inside the export set — the ~1 KB status doc rides along harmlessly). Fields: `lastAttemptAt, lastSuccessAt, lastErrorAt, lastError (sanitized, ≤200 chars), runId (uuid), status: 'submitted'|'failed', checksum (sha256 hex), sizeBytes, keyVersion, destination (email address)`. `lastSuccessAt` advances **only** on SMTP acceptance (`250`), and the UI wording must say "تم الإرسال" — never "تم التسليم/الوصول" (submission ≠ delivery; detection of non-delivery is the 14-day banner + the operator's monthly 10-second mailbox check, documented).

**Banner (Arabic, admin dashboard):** shown when `lastSuccessAt` older than 14 days or `status==='failed'`:
«تحذير: لم يتم التحقق من نجاح النسخ الاحتياطي الآلي خلال المدة المحددة. يرجى إرسال نسخة احتياطية جديدة والتحقق من وصولها.» — linking directly to the manual `action:'email'` button. Show `lastSuccessAt` + sanitized `lastError`. **Independent-alert limitation (honest):** this stack has no outbound channel besides email itself; if SMTP dies, only the banner reveals it. Documented operational fallback: monthly human check that the newest backup email exists in the mailbox.

**Env vars added:** `BACKUP_ENCRYPTION_KEY` (32-byte hex — generate: `openssl rand -hex 32`; **fail fast in production** like `firebase-admin.ts:31-33` does), `BACKUP_DESTINATION_EMAIL` (optional override of elnewahy@gmail.com), optional `BACKUP_MAX_ATTACHMENT_BYTES` (default 20 MB, Gmail limit 25 MB). Add all three to `.env.example` (names + placeholder values only). Timezone for filenames/subjects: UTC, documented.

**Subject/filename:** `School-Achievements Backup — YYYY-MM-DD (auto)` / `School-Achievements-Backup-YYYY-MM-DD.enc`; manual sends use `(manual)` in the subject. Idempotency: each run is a fresh independent email (Gmail dedupes nothing, which is correct — each is a distinct snapshot); `runId` in the status doc disambiguates overlapping runs; concurrent manual+scheduled runs are allowed (independent artifacts, last-write-wins on status).

## 2. Stage plan (one commit per stage; never mix stages)

- **Stage 2 commit:** `feat(backup): payload format, AES-256-GCM encryption, checksum, validation + unit tests` — lib + vitest only, no route changes.
- **Stage 3 commit:** `feat(backup): weekly email cron, manual admin send, status doc, stale-backup banner` — keep the existing Firestore `backups` writer **untouched and running in parallel**.
- **Stage 4 commit:** `feat(backup): restore-backup script + emulator restore test + docs` — includes README section (architecture, schedule/timezone, env vars, key generation/rotation/recovery, how to verify a received attachment, step-by-step emulator + scratch-project + production recovery, limitations).
- **Stage 5 gate (no code):** ≥2–4 successful weekly emails received → decrypt + restore into scratch project with record-count/relationship validation → emulator test green → then and only then Stage 6.
- **Stage 6 commit:** `refactor(backup): retire Firestore backup storage` — remove cron's Firestore write+prune path and the admin UI's stored-backup list/restore section; **keep** `POST /api/backup` default download action and the manual email action; delete the `backups` collection in the Firebase console (operator action, documented); update tests/docs. No security-rule changes needed (default-deny covers `backups`; verify no rule references it).
- **Stage 7 commit:** docs finalization + deployment checklist (set the 3 env vars in Vercel, confirm first automated email, first manual email, banner negative-test by temporarily lowering the threshold).

## 3. `backups` collection dependency inventory (for Stage 6 — verified during the audit)

Writers: `api/cron/weekly-backup` (add + prune). Readers: `api/backup` actions `list`/`restore`/`preview_restore` + admin dashboard backup panel UI. Rules: **none** (default-deny covers it). Tests: none currently. Docs: README backup section. Nothing else references it (grep-verify again at Stage 6 before removing).

## 4. Security invariants (from the approved spec, unchanged)

Authorization server-side on every new path; CSRF origin checks on manual send; rate limit reused; audit logging via existing `logger.ts` without payload contents, keys, or full recipient lists; no plaintext PINs/passwords ever (only PBKDF2 hashes, and only inside the encrypted blob); PIN-reset flow untouched; scheduled endpoint keeps constant-time `CRON_SECRET` check; encryption failures/size violations fail **closed** with status update — never send an unencrypted or truncated backup; tests never use real student/teacher data.

## 5. Definition of Done (acceptance)

1. Weekly cron emails an encrypted `.enc` backup; manual button produces the same pipeline with `(manual)` subject. 2. `npm audit --omit=dev` stays at 0; lint 0 errors; tsc clean; Vitest green (existing 86 + new format/crypto/validate/tamper/wrong-key/status tests + emulator-gated restore test). 3. `scripts/restore-backup.mjs` round-trips a real generated backup against the emulator (counts + spot-check records + pepper check). 4. Banner logic unit-tested (14-day threshold, failure display). 5. `backups` collection untouched until Stage 5 gate passes, removed only in Stage 6. 6. README/env.example updated; no secrets committed.

*Source brief: user-approved task spec (2026-10-28) + audit trail: [PRODUCTION-READINESS-AUDIT-2026-10-28.md](PRODUCTION-READINESS-AUDIT-2026-10-28.md) · [RE-AUDIT-VERIFICATION-2026-10-28.md](RE-AUDIT-VERIFICATION-2026-10-28.md) · [SECOND-RE-AUDIT-2026-10-28.md](SECOND-RE-AUDIT-2026-10-28.md)*
