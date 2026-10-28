# Stage 5 Gate Verification — Isolated Restore from the Actual Received Backup

**Date:** 2026-10-28 · **Artifact:** `C:\Users\ahmed\Downloads\School-Achievements-Backup-2026-10-28.enc` (59,206 bytes — the email backup you received after deploying) · **Key:** `BACKUP_ENCRYPTION_KEY` from `.env.local` (matches the Vercel value — proven by successful decryption) · **Isolation:** local Firestore Emulator on `127.0.0.1:8090`, throwaway project `backup-restore-demo` — **production was never touched**.

## 1. Verdict

> ✅ **The decisive safety test PASSED: a successful isolated restore from the actual encrypted email backup.**
> Every teacher PIN, the admin credential, and all 55 achievements came out of the emailed `.enc` file into a clean database, byte-faithful.

## 2. What was verified, step by step (all executed this session)

| Step | Result |
|---|---|
| 1. Decrypt + GCM authentication of the received file | ✅ `keyVersion 1`, tag verified — intact, untampered, key matches deployment |
| 2. Structural validation + checksum | ✅ 4 collections present, ids valid, data checksum recomputed & matched |
| 3. Pepper guard | ✅ Correctly detected the local-vs-production `PIN_PEPPER` difference and refused without `--force-pepper` (the safety rail works; the emulator run used `--force-pepper` because it is a throwaway) |
| 4. Restore into isolated emulator | ✅ **113/113 documents** merge-upserted (achievements 55 · admin 2 · admin_achievementSecrets 55 · settings 1) |
| 5. Independent read-back | ✅ Counts match exactly; `admin/pinConfig` has a valid `pinHash` + `adminEmail` (admin login restorable); **55/55** teacher PIN secrets carry valid hashes; **55/55** achievements have `timestamp` restored as a real Firestore `Timestamp` (hydration works); full field fidelity (`date, score, teacherName, awards, department, title, attachmentUrls, desc, status, timestamp`); settings doc intact (13 fields) |
| 6. Tamper rejection (control test) | ✅ A bit-flipped copy fails GCM authentication — "Nothing was restored" |
| 7. Automated round-trip test | ✅ `src/lib/backup-restore.emulator.test.ts` 2/2 against the emulator (seed → export → encrypt → decrypt → restore → verify) |

## 3. Fix landed during this verification (`ae50bb9`)

The Admin SDK's credential path hangs against the emulator when Application Default Credentials are unavailable; the restore script's emulator target and the emulator test now use the **Firebase client SDK + `connectFirestoreEmulator`** (no credentials needed), with `--emulator-port` support (this machine's port 8080 is occupied by an Apache `httpd`; the emulator ran on 8090 via a machine-local gitignored config). Full suite still green: 103 passed / lint 0 errors / build clean.

## 4. Remaining Stage 5 items before Stage 6 (retirement of the Firestore `backups` collection)

1. **Scheduled-execution proof:** the first weekly cron fires **Sunday 00:00 UTC (Nov 1)** — verify the automated email arrives (the manual action already works). 2–4 weekly emails total per the spec.
2. *(Optional, strongest form)* Repeat the restore against a **scratch Firebase project** (`--target firestore --project-id <scratch> --confirm-restore`, with the scratch project's `PIN_PEPPER` set to the production value) — the emulator result above already satisfies the "isolated restore" requirement technically.
3. Confirm the admin-dashboard banner behaves (it will show green once `lastSuccessAt` is fresh; goes amber 14 days after the last success).

**Rollback plan (documented, unchanged):** if the email channel is ever retired-downgraded or fails, the Firestore `backups` collection + manual JSON download remain fully operational until you decide otherwise.

*Reports: [IMPLEMENTATION-REPORT-BACKUP-2026-10-28.md](IMPLEMENTATION-REPORT-BACKUP-2026-10-28.md) · [ANNOTATED-BACKUP-SPEC-2026-10-28.md](ANNOTATED-BACKUP-SPEC-2026-10-28.md) · commits `e0ed0a2`, `b3e1d0d`, `f69b4b3`, `ae50bb9`*
