# Re-Audit Verification — School-Achievements (post-fix inspection)

**Date:** 2026-10-28 · **Base:** audited commit `609110a` (HEAD unchanged) · **Fix set:** 17 modified files + `src/app/error.tsx`, `src/app/not-found.tsx` — **all currently uncommitted working-tree changes** (`git status`: 17 × modified, 2 × untracked source files).
**Method:** read every diff against the audit findings, re-verified load-bearing claims file-by-file, and re-ran the full test matrix. No code file was changed by this inspection; no production system was contacted; the e2e suite ran locally with Firebase Admin credentials disabled (as before).

> ## VERDICT: **GO FOR PRODUCTION — CONDITIONAL**
> All 1 Critical and all 7 High findings from the audit are **verified fixed in code and re-tested green**. Two conditions attach to the GO (both one-step, non-code-blocking in nature):
> 1. **Commit and push the fix set.** Every fix currently lives only in the working tree — the Vercel deployment builds from git, so *as of right now, none of these fixes are live in production*. An uncommitted security fix set is itself a deploy-integrity risk.
> 2. **Bump `@grpc/grpc-js` to ≥1.13.6 (e.g. `^1.14.6`).** A new high advisory pair (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4) appeared in `npm audit` between the two audits; it affects the installed ≤1.13.5 copy under the Firebase *client* SDK. The lockfile was **not** the cause (this dep is unchanged in the diff) — the advisory window simply moved. The bump satisfies `@firebase/firestore`'s own `^1.12.6` range, so it is a one-line, non-breaking change. Practical exploitability in this app is low (client-side gRPC to Google endpoints only), which is why this is a condition, not a blocker.

---

## 1. Fix-by-fix verification matrix

| Audit finding | Status | Evidence (verified this session) |
|---|---|---|
| **C-1** Teacher-PIN secrets never backed up; restore locks out admin | **FIXED** | `COLLECTIONS` now `['achievements','settings','admin','admin_achievementSecrets']` in **both** jobs (`api/backup/route.ts:10`, `api/cron/weekly-backup/route.ts:11`). The stored backup keeps `pinHash` for `admin_achievementSecrets` and for `admin/pinConfig` (drops only `tokenHash`, keeps `adminEmail`) → a restore now restores the full auth chain: admin login hash, reset email, and every teacher PIN. Downloadable backups still strip all four secret fields (`backup/route.ts:111-114` unchanged) — coherent split: stored = restorable (Admin-SDK-only access), download = secret-free. Restore hydrates ISO strings back to `Timestamp` (`backup/route.ts:85-92`). |
| **H-1** Backups same-DB / 1 MiB cap / no off-site / silent cron failure | **PARTIALLY FIXED** (downgraded to Medium residual) | `logs` removed from the export set (the unbounded growth driver) ✓; secrets restorable ✓. Residual: still one Firestore document per backup (1 MiB horizon now much further but real), still no off-platform copy (manual CLI only), still no cron-failure alerting. |
| **H-2** Restore button always 400; Timestamp corruption | **FIXED** | UI now sends `{ action:'restore', backupId, confirm: true }` (`admin/page.tsx:329`); API hydration converts ISO datetime strings → `Timestamp.fromDate` on restore (`backup/route.ts:85-92`). Plain `YYYY-MM-DD` date strings are correctly left alone (stored as strings by design). Minor note: the UI one-steps past the dry-run preview the API offers — acceptable, but a preview step would preserve the original MUST-16 two-step intent. |
| **H-3** Env-contract drift breaks fresh deploys | **FIXED** | `.env.example` now documents `FIREBASE_SERVICE_ACCOUNT` (single JSON/base64 string) + all four `SMTP_*` vars; README env table updated identically. `firebase-admin.ts` now **throws in production** when the credential is missing instead of warn+ADC-silent-failure (`firebase-admin.ts:31-33`). |
| **H-4** Admin monthly-awards page can never load | **FIXED** | Query now `query(collection(db,'achievements'), where('status','==','approved'))` with a snapshot error callback that clears the spinner (`admin/monthly-awards/page.tsx:56-61`). Rules-compliant; page loads. |
| **H-5** CSP `frame-src` blocks document previews | **FIXED** | `frame-src … https://docs.google.com` added (`proxy.ts:25`). |
| **H-6** `offline.html` corrupted (shell heredoc after `</html>`) | **FIXED** | File now ends at `</html>` (67 lines removed); Arabic offline page intact. |
| **H-7** No app-level error UX; silent failures as "empty" | **FIXED (mostly)** | New `src/app/error.tsx` (Arabic, retry + home) and `src/app/not-found.tsx` apply app-wide; snapshot **error callbacks added on all five pages** (full-record:90, honor-roll:58, kiosk:93, monthly-awards:67, admin/monthly-awards:60). Residual: the admin dashboard's plain-fetch failure paths still render empty states rather than an error message (unchanged); no `loading.tsx` (minor — pages have in-page spinners). |
| **M-10** Badge thresholds inconsistent | **FIXED** | Home silver threshold 75→80 (`page.tsx:57`); grep confirms **80** now uniform across home, full-record (badge+filter+export), kiosk, achievement detail. |
| **M-11** Honor-roll "this month" is all-time | **FIXED** | Filters to current month (`date.startsWith(YYYY-MM)`) with an explicit all-time fallback when the month is empty (`honor-roll/page.tsx:18-25`) — label is now honest, and a month with no data degrades gracefully instead of showing an empty podium. |
| **§8-7 hygiene:** nodemailer / lint / engines / CI | **PARTIAL** | nodemailer `^10.1.4` → locked 10.2.1 ✓ (all nodemailer advisories cleared); `engines.node >=20.9.0` added ✓; lint error fixed (0 errors, 231 warnings — was 1 error) ✓. **CI pipeline still absent** (no `.github/`) — recommended fast-follow, not a blocker. |

**Confirmed unchanged (intentionally out of the fix set — remain as documented Medium/Low residuals, none GO-blocking):**
M-1 unauthenticated upload-sign endpoint; M-2 leftmost-XFF IP trust; M-3 awards read-modify-write race; M-4 Cloudinary destroy-before-commit + dead-letter `admin_pendingDeletions`; M-5 cleanup orphan-deletion race; M-6 non-atomic achievement create; M-7 unbounded queries + 20s admin refetch; M-8 logs PII/no retention + "Admin login successful" log per 2-min session check; M-12 reports PDF export includes pending/rejected + `date.localeCompare` crash risk on legacy docs; M-13 settings PUT replace-not-merge; M-16 no monitoring/health endpoint; Lows: dead PDF deps (`@react-pdf/renderer`, `html2canvas`, `html2pdf.js`, `jspdf`, `framer-motion`), CSRF origin gaps on `/api/auth` POST + `/api/cleanup`, no-op `pinHash` deletes, README test-count drift, storage.rules dead rule, accessibility/i18n items.

**New finding introduced since the first audit:**
- **[HIGH, dep] `@grpc/grpc-js` ≤1.13.5** — GHSA-m9gg-hp2v-232j (unauthorized certificates via `getAuthContext`) + GHSA-f596-whhp-79r4 (server status-message leak), reached via `firebase` → `@firebase/firestore` (client SDK). Not caused by the fix set (dep unchanged in lockfile; advisory data refreshed between runs). `npm audit fix --force` would wrongly downgrade firebase to 9.x — **do not**; bump the dep directly (`npm install @grpc/grpc-js@^1.14.6` or an `overrides` entry). Client-only usage to Google endpoints ⇒ low practical exploitability here.

---

## 2. Re-run test matrix (all executed this session)

| Check | Result | Delta vs first audit |
|---|---|---|
| `npm run lint` | **PASS — 0 errors, 231 warnings** | was FAIL (1 error); settings TDZ pattern removed cleanly (`prevTeachersList` deleted, null-guard rewrite) |
| `npx tsc --noEmit` | **PASS** (0 errors) | unchanged |
| `npm test` (Vitest) | **PASS — 86/86** (9 files) | unchanged (no test changes) |
| `npm run build` | **PASS** — production build, all 29 routes | unchanged; new production fail-fast does not affect build (`.env.local` supplies the credential) |
| `npm audit --omit=dev` | **4 high** — all the new `@grpc/grpc-js` chain; **nodemailer clear** | nodemailer 5 vulns resolved by the 10.2.1 bump; one new high pair appeared (see §1) |
| `npx playwright test` | **PASS — 6/6** (4.0s) against the rebuilt production server at localhost (Firebase Admin creds disabled — the wrong-PIN test now fails fast in 12 ms via the new guard, writing nothing anywhere) | same coverage as before |

E2E safety note (unchanged policy): the suite was run with `FIREBASE_SERVICE_ACCOUNT` overridden to empty in the serving process, so no test could read or write the real database; real-login/lockout and Cloudinary/cron paths remain covered by code review + unit tests only.

---

## 3. Residual risk register (post-fix, ordered)

1. **Uncommitted fix set** — deploy-from-git means production still runs the pre-fix code until this working tree is committed and pushed. *Action: commit + deploy; verify the Vercel env vars include `FIREBASE_SERVICE_ACCOUNT` (the new fail-fast will make any missing credential loud instead of silent).*
2. **`@grpc/grpc-js` high advisory** — one-line bump (GO condition #2).
3. **Backup resilience (was H-1):** single-doc backups (1 MiB horizon), no off-platform copy, no cron-failure alerting. Secrets now restorable, `logs` excluded; risk substantially reduced. Fast-follow: chunked exports, off-site copy (the CLI script is the pattern), alert on cron failure, and surface "last successful backup" in the admin panel.
4. **Upload/abuse surface (M-1/M-2):** unauthenticated sign endpoint + leftmost-XFF trust — cost-abuse and rate-limit-bypass potential on platforms that append XFF; consider requiring an origin-bound session/PIN before `sign`, and prefer platform-managed IP headers.
5. **Consistency races (M-3..M-6):** award-map transaction, commit-Firestore-then-destroy ordering, orphan-deletion grace window, atomic create — each is a small, isolated change; currently low-probability but real.
6. **Scale path (M-7):** pagination + retention before the dataset grows; the 20 s full refetch will not age well.
7. **CI gate (M-15):** a GitHub Actions run of `npm ci && lint && tsc && vitest && build` would have caught the lint error mechanically; also proves the `patch-package` step on every install.

---

## 4. Compliance notes

- Inspection was read-only with respect to code: no repo file was created, modified, or reverted; no commit/checkout/reset was performed.
- No secret values were read or printed; only variable names.
- No production contact: no deploy, no external service calls; e2e ran locally with admin credentials disabled by environment override.
- All results above are real command executions from this session, including the new `@grpc/grpc-js` advisory (reported, not hidden) and the deliberately-unrun paths.

*First audit (record): [PRODUCTION-READINESS-AUDIT-2026-10-28.md](PRODUCTION-READINESS-AUDIT-2026-10-28.md) · supporting: [frontend-ux-audit-2026-10-28.md](frontend-ux-audit-2026-10-28.md) · [backend-data.md](.zwork/audit-20261028/backend-data.md) · [ops & dependencies](audit-20261028-ops-deps.md)*
