# Implementation Report — Email Backup & Recovery System

**Date:** 2026-10-28 · **Base:** `256861d` (remediation) · **Commits:** `e0ed0a2` (Stage 2) → `b3e1d0d` (Stage 3) → `f69b4b3` (Stage 4) — one stage per commit as approved. Spec: [ANNOTATED-BACKUP-SPEC-2026-10-28.md](ANNOTATED-BACKUP-SPEC-2026-10-28.md).

## 1. Files created or modified

| Stage | File | Change |
|---|---|---|
| 2 | `src/lib/backup-format.mjs` (+`.d.mts`) | **New** — canonical JSON, SHA-256 checksum, AES-256-GCM encrypt/decrypt (`SABK1` header + keyVersion + IV + authTag), structural validation, `parseAndVerify`. Dependency-free (node:crypto). |
| 2 | `src/lib/backup-format.test.ts` | **New** — 17 unit tests (round-trip, unique IVs, tamper, wrong key, malformed key, checksum, schema, counts, no-id docs). |
| 3 | `src/lib/backup-export.ts` | **New** — shared Firestore export (Timestamp→ISO; secrets collection keeps `pinHash`; `admin/pinConfig` keeps `pinHash`+`adminEmail`, drops `tokenHash`; everything else scrubbed) — byte-equivalent to the previous cron logic, now single-sourced. |
| 3 | `src/lib/backup-email.ts` | **New** — pipeline: in-flight guard (5-min status lock) → export → build → encrypt → size guard (fail-closed) → email per destination → status doc. Destinations default `bayanschool2026@gmail.com,elnewahy@gmail.com` (env `BACKUP_DESTINATION_EMAILS`, comma list, each sent independently). |
| 3 | `src/lib/mailer.ts` | **Extended** — `sendBackupEmail()` (attachment; returns SMTP `accepted`/`rejected` per recipient). PIN-reset flow untouched. |
| 3 | `src/app/api/cron/weekly-backup/route.ts` | **Extended** — same snapshot now feeds both sinks: legacy Firestore `backups` write+prune (untouched, parallel run) **and** encrypted email. Response reports email status; email failure never corrupts the legacy sink. |
| 3 | `src/app/api/backup/route.ts` | **Extended** — `POST {action:'email'}` (admin session + origin check + 5/hour/IP rate limit + 409 on concurrent run) and `GET` now returns the status doc. |
| 3 | `src/app/admin/page.tsx` | **Extended** — Arabic stale/failed banner (14-day threshold), status line (last success / state / sanitized last error), «إرسال نسخة احتياطية إلى البريد» button with per-outcome Arabic feedback. |
| 4 | `scripts/restore-backup.mjs` | **New** — decrypt → auth-tag verify → checksum → structure → pepper check → optional restore (emulator/scratch/production) with `--confirm-restore` safety rail, dry-run by default, Timestamp hydration identical to `/api/backup`. |
| 4 | `src/lib/backup-restore.emulator.test.ts` | **New** — full seed→export→encrypt→decrypt→restore→verify round-trip against the Firestore Emulator; **skips** unless `FIRESTORE_EMULATOR_HOST` is set. |
| 4 | `README.md` | **Extended** — setup table, status semantics ("submitted ≠ delivery"), restore commands, retention & retirement, key-loss warning. |
| 4 | `.env.example` | **Extended** — `BACKUP_ENCRYPTION_KEY`, `BACKUP_DESTINATION_EMAILS`, `BACKUP_MAX_ATTACHMENT_BYTES` (placeholders only). |

## 2. Tests executed (real results)

- `npx tsc --noEmit` → **0 errors** · `npm run lint` → **0 errors** (244 warnings, pre-existing class) · `npm run build` → **PASS** · Playwright e2e → **6/6**.
- Vitest → **103 passed, 2 skipped** (emulator-gated) — includes 17 new format tests + full regression.
- Restore script validated live: a real encrypted file decrypted → checksum verified → counts printed → **pepper-mismatch abort** (correct) ; a bit-flipped copy → **GCM auth failure, exit 1, "Nothing was restored"** (correct).

## 3. Security controls implemented

Server-side admin authz on the manual action; CSRF origin check; rate limit 5/h/IP; no secrets in logs/status/filenames (pepper lives only inside the encrypted payload; status doc is metadata-only); fail-closed on missing key, oversize payload, SMTP failure; constant-time CRON_SECRET unchanged; in-flight guard against overlapping runs; restore refuses production without explicit flags and refuses pepper mismatch without `--force-pepper`; no legacy mechanism removed.

## 4. Honest DoD status (per spec §11)

| Item | Status |
|---|---|
| Implementation + tests pass, no legacy removal | ✅ Done |
| Restore tooling + emulator round-trip test | ✅ Written; **emulator test executed only in skip mode locally** — run it with `npx firebase emulators:start --only firestore` + `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run src/lib/backup-restore.emulator.test.ts` |
| **Actual backup received in the mailbox** | ❌ **Not yet possible from this machine** — requires the two env vars in Vercel + deploy + first send |
| **Isolated restore from an actual emailed backup** | ❌ **Pending — this is the Stage 5 gate**; the local script round-trip above is not a substitute for it |

## 5. Your next actions (Stage 5)

1. `git push` (3 commits).
2. Vercel env: set `BACKUP_ENCRYPTION_KEY` (use the value generated in your local `.env.local`, or generate a new one and update `.env.local` to match) — keep the offline copy in your password manager. `BACKUP_DESTINATION_EMAILS` is optional (defaults to both addresses).
3. Deploy → Admin dashboard → «إرسال نسخة احتياطية إلى البريد» → verify the `.enc` arrives at **both** addresses → validate: `node scripts/restore-backup.mjs --file <downloaded.enc> --key <key>`.
4. Let 2–4 weekly cron runs pass, then run the isolated restore into the scratch Firebase project. **Only after that gate: Stage 6 retirement** of the Firestore `backups` collection (inventory already documented in the spec).
