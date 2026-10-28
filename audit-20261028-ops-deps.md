# OPS, DEPENDENCIES & RELEASE-READINESS AUDIT — School-Achievements

- **Date:** 2026-10-28
- **Note on location:** the requested output path `.zwork/audit-20261028/ops-deps.md` is a runtime-reserved directory that cannot be written; this report is the same deliverable placed at the workspace root. No existing repository file was created or modified.
- **Scope:** vercel.json, firebase.json, next.config.mjs, src/proxy.ts, package.json/lock, patches/, vendor/xlsx-0.20.3.tgz, tsconfig.json, vitest/playwright configs, README.md claims vs code, scripts/backup-database.mjs, backup/cron/logging implementation, env-var contract, CI/commit-hooks hygiene, dependency CVE status (web-verified).
- **Method:** read-only audit. Every claim below is grounded in `file:line` + quoted snippet (first-party code = highest tier) or a fetched URL (web evidence, access date 2026-10-28). Secret **values** were never read or printed; only variable names.

---

## 1. Conclusion summary

The app is deployable today and its core security architecture (CSP with per-request nonce, HSTS, Upstash-backed rate limiting, admin-only API gating, secret-scrubbed backups) is **real and verifiable in code**, not aspirational. However, three **HIGH** release blockers exist in the operations story: (1) the documented environment-variable contract does not match what `firebase-admin.ts` actually reads, so a fresh deployment built from `.env.example`/README silently falls back to Application Default Credentials and loses all Admin-SDK features; (2) automated backups are stored **inside the same Firestore database they back up**, are subject to Firestore's 1 MiB document limit with an unbounded `logs` collection in the export set, and the Vercel cron that triggers them is best-effort with no retry and no alerting; (3) the restore path cannot restore authentication material (hashes are stripped from backups) and re-writes ISO strings over Firestore Timestamp fields, so a true disaster-recovery restore leaves the app partially broken. No known CVEs affect the pinned dependency set except one fresh (24 Oct 2026) nodemailer advisory. Overall verdict: **CONDITIONAL GO** — deploy-safe for the current running instance, not yet "production-grade" for fresh deployment or disaster recovery. (Confidence: HIGH for code findings; MEDIUM for web CVE currency.)

---

## 2. Findings (severity-ordered)

### [HIGH] H1 — Env-var contract drift: code reads only `FIREBASE_SERVICE_ACCOUNT`; docs advertise a different trio
- **Fact:** `src/lib/firebase-admin.ts:10` reads `process.env.FIREBASE_SERVICE_ACCOUNT` (JSON string or base64). It is the **only** credential path; there is no reading of `FIREBASE_SERVICE_ACCOUNT_KEY`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` anywhere in `src/` (repo-wide grep: 0 hits for those names in code). When unset, the module falls back to Application Default Credentials:
  - `src/lib/firebase-admin.ts:29-30`: `console.warn('[Firebase Admin] No FIREBASE_SERVICE_ACCOUNT configured. Using default credentials.'); ... initializeApp();`
  - On Vercel, ADC has no metadata server to bind to, so every Admin-SDK call (achievements admin writes, backups, logs, cleanup) fails at runtime.
- **Contradicting documentation:** `.env.example:46-48` says `# FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'` and `.env.example:50-53` + README env table document `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` as **Required**. None of these names appear in code.
- **What actually works:** `.env.local` (names only, values not inspected) contains `FIREBASE_SERVICE_ACCOUNT` — i.e., the working configuration exists but is **undocumented**, and the documented one is wrong.
- **Impact:** a fresh Vercel deployment following README §Environment Variables is broken-by-default for all privileged features, with only a `console.warn` as the symptom.
- **Evidence tier:** [A] code + [A] .env.example. Confidence: certain (grep-negative for alternative names).

### [HIGH] H2 — Backups live in the same database they protect; 1 MiB Firestore doc limit will silently kill them as data grows
- **Fact:** the weekly cron backup writes the full export of `['achievements','settings','admin','logs']` as a **single Firestore document** in the same project:
  - `src/app/api/cron/weekly-backup/route.ts:11`: `const COLLECTIONS = ['achievements', 'settings', 'admin', 'logs'];`
  - `src/app/api/cron/weekly-backup/route.ts:69`: `await db.collection('backups').add(backupPayload);`
- **Constraints:** Firestore documents are hard-capped at 1 MiB. The export includes the **`logs` collection, which grows monotonically** (logger writes every security/API event there, `src/lib/logger.ts:42`), so the `add()` will eventually exceed 1 MiB and throw — the backup silently stops happening (caught by the generic catch → 500, logged only).
- **Blast radius:** same-database storage means accidental Firestore deletion/project loss also destroys the backups. No off-site (Cloudinary/SMTP/object-storage) copy exists anywhere in the code (grep: no backup-related upload/mail call in the cron route).
- **Retention:** rolling window of 8 backups: `weekly-backup/route.ts:12` `const MAX_BACKUPS = 8;` with prune at lines 72-81.
- **Encryption at rest:** inherited Firestore platform encryption only; nothing in code adds or documents encryption of the backup payload.
- **Evidence tier:** [A] code; 1 MiB limit is a well-known Firestore quota (platform fact). Confidence: certain on code; the failure horizon depends on data volume (inference, flagged).

### [HIGH] H3 — Restore path exists but cannot actually recover: auth hashes stripped, Timestamps degraded to strings
- **Fact:** a restore flow *does* exist (contrary to a naive "no restore path" reading) with dry-run preview and explicit confirm — `src/app/api/backup/route.ts:44` (`action === 'restore' || action === 'preview_restore'`), `:67` dry-run summary, `:72` `if (body.confirm !== true)` gate — and it re-sets documents with `merge: true`.
- **Gap 1 — auth material is not in the backups.** Both backup writers strip `pinHash`, `tokenHash`, `adminPin`, `adminEmail`:
  - `src/lib/backup-sanitize.ts:8-15` (`SENSITIVE_BACKUP_FIELDS = ['pinHash','tokenHash','adminPin','adminEmail']`), used by the cron route; `src/app/api/backup/route.ts:111-114` does the same `delete plain.pinHash; ...` for manual downloads.
  - Consequence: restoring into a **fresh/emptied** database (the actual DR scenario) recreates teacher-PIN and admin documents **without their hashes** → admin cannot log in, teachers cannot manage their achievements. `merge:true` only saves you if the original documents still exist.
- **Gap 2 — type corruption on restore.** Backup export converts Firestore Timestamps to ISO strings (`weekly-backup/route.ts:47-52` and `backup/route.ts:100-104`: `if (val && typeof val === 'object' && typeof val.toDate === 'function') plain[key] = val.toDate().toISOString();`). Restore writes those strings back verbatim (`backup/route.ts:96-100`), so restored date fields become strings, not Timestamps; any code calling `.toDate()` on them breaks.
- **Related manual path:** `scripts/backup-database.mjs` (CLI) authenticates with the admin PIN, POSTs `/api/backup`, and writes JSON to a local `backups/` dir (`scripts/backup-database.mjs:67-76`). It is a one-way export only — no verification, no restore, no retention management. `.gitignore:41-47` correctly ignores `backups/` so local dumps aren't committed (good).
- **Evidence tier:** [A] code. Confidence: certain.

### [MEDIUM] M1 — SMTP environment variables required by the PIN-reset flow are documented nowhere
- **Fact:** `src/lib/mailer.ts:3-9` requires `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` (defaults to `smtp.gmail.com:465` when HOST/PORT unset). Neither `.env.example` nor the README env table lists any SMTP variable. `.env.local` **does** contain all four (names verified).
- **Impact:** on a fresh deployment the PIN-reset email feature fails at `sendMail` with missing credentials — same class of drift as H1, smaller blast radius.
- **Evidence tier:** [A]. Confidence: certain.

### [MEDIUM] M2 — No CI pipeline, no commit hooks, no Node engines pinning
- **Fact:** repository root has **no `.github/`** directory (root listing, 2026-10-28) — no GitHub Actions, so `npm test` (Vitest), `npm run lint`, `tsc --noEmit`, and Playwright E2E never gate a push/deploy. No Husky/lint-staged/commitlint: `package.json` has no `prepare`/`husky`/`lint-staged` keys and no `.husky/` dir. No `engines` field and no `packageManager` in `package.json` (whole file inspected) and no `.nvmrc`/`.node-version` in root, while README.md:175 claims "Node.js: >= 20.9.0" — an unenforced requirement.
- **Impact:** regressions reach production via a plain git push to the Vercel-connected branch; the build machine's Node version is whatever the platform defaults to at deploy time.
- **Evidence tier:** [A]. Confidence: certain.

### [MEDIUM] M3 — Logging/monitoring: Firestore logs + Vercel console only; no external monitor, crash reporter, or uptime checks
- **Fact:** `src/lib/logger.ts` buffers entries in memory and flushes to the Firestore `logs` collection (`logger.ts:24` `FLUSH_INTERVAL_MS = 5000`; `:42` `collection(db, 'logs')`), with console output for Vercel runtime log capture (`logger.ts:104-110`) and immediate flush for error/security levels. The admin `/api/logs` route reads the last 50 (`src/app/api/logs/route.ts:16`). There is **no** Sentry/OpenTelemetry/Datadog/Logtail dependency or export anywhere in `package.json` or `src/` (grep-negative), no uptime-check integration, and cron failures are only written to logs — nothing pages anyone.
- **Redundancy note (honest limitation):** audit logs being *in the same Firestore* as app data means a database-level incident can take out both the data and its audit trail; console output is the only independent copy, retained per Vercel's log retention.
- **Evidence tier:** [A] code, [I] retention details depend on plan. Confidence: certain on absence; plan-dependent retention unverified.

### [MEDIUM] M4 — Vercel cron: registered correctly, but best-effort delivery, no retry, no `maxDuration` headroom set
- **Fact:** the cron **is** registered — `vercel.json:2-6`: `{"crons":[{"path":"/api/cron/weekly-backup","schedule":"0 0 * * 0"}]}` (Sundays 00:00 UTC). The route expects exactly what Vercel sends: `weekly-backup/route.ts:21-30` compares `Authorization: Bearer $CRON_SECRET` with `timingSafeEqual` (constant-time, `:26`) — matches Vercel's documented behavior ("The value of the variable will be automatically sent as an `Authorization` header… with the `Bearer` prefix", vercel.com/docs/cron-jobs/manage-cron-jobs, fetched 2026-10-28).
- **Risk 1 — silent misses:** official docs (same page): "Vercel will not retry an invocation if a cron job fails"; "Cron job delivery is best effort. Most invocations run as scheduled, but occasional transient network errors can prevent a request from reaching your function." → a missed or failed weekly backup produces no alert (ties into H2/M3).
- **Risk 2 — duration:** no `export const maxDuration` exists in any API route (grep-negative across `src/`), so the export runs on the platform default **300 s** (Vercel docs "Configuring Maximum Duration", fetched 2026-10-28: Default 300 s / max 300 s Hobby with Fluid compute). Serial full-collection reads (`weekly-backup/route.ts:36-62`) fit in 300 s for a small school dataset, but the margin shrinks as `logs` grows (same driver as H2).
- **Rollback footnote from docs:** "If you Instant Rollback to a previous deployment, active cron jobs will not be updated."
- **Evidence tier:** [A] code + [B] fetched official docs. Confidence: high.

### [MEDIUM] M5 — nodemailer 10.0.10 sits in a fresh vulnerable range (address-parser interpretation conflict; no CVE id yet)
- **Fact:** Snyk SNYK-JS-NODEMAILER-21663373 (published 2026-10-24, fetched 2026-10-28): "Affecting nodemailer package, versions **>=3.0.0 <10.1.4** … vulnerable to Interpretation Conflict via the address parser … a `;` inside a quoted display name or a comment prematurely closes a group, causing **additional recipients to be injected into the envelope**." Fix: upgrade to 10.1.4+. Locked version is 10.0.10 (`package-lock.json:8828-8831`).
- **Exploitability here (inference, labeled):** `mailer.ts` only ever sends to the stored admin email (`sendPinResetEmail(to, …)`; `to` originates from the admin record, not directly from attacker input), so practical risk in this app is low — but the pinned version fails dependency scanning and the parser flaw is triggered by address *content*.
- **Also checked:** CVE-2025-14874 / GHSA-rcmh-qjqh-p98v (DoS via infinite recursion in addressparser, disclosed 2025-11-27, github.com advisory fetched 2026-10-28). The advisory page did not render a "patched versions" field in the fetched text; 10.0.10 postdates both the disclosure and the 10.0.5 fix level required by the later CVE-2026-90776 (Tenable, 2026-09-30), so it is **presumed covered — exact fixed-version not pinned** (unverified detail, see §5).
- **Evidence tier:** [C→B] Snyk + GitHub advisory pages fetched. Confidence: high on the range; medium on CVE-2025-14874 coverage.

### [MEDIUM] M6 — `patch-package` patch is version-fragile against a floating transitive dependency
- **Fact:** `patches/@react-pdf+textkit+6.3.0.patch` neuters `bidiReordering()` and `mirrorString()` in `@react-pdf/textkit` 6.3.0 (the patch header documents why: react-pdf's bidi pass breaks Arabic export; the app pre-shapes text in `src/lib/pdf.ts`). Installed tree matches (`node_modules/@react-pdf/textkit` = 6.3.0; `@react-pdf/renderer` = 4.5.1). But `package.json:20` declares `"@react-pdf/renderer": "^4.5.1"` (caret float), and `postinstall: patch-package` (`package.json:8`) **fails hard** when the target version no longer matches patch context — any future renderer/textkit minor bump breaks `npm install`/CI-less deploys at postinstall time.
- **Mitigation present:** fail-closed (you cannot silently deploy unpatched). Also note: with `--omit=dev` installs the patch would not apply at all (patch-package is a devDependency); Vercel's build installs devDependencies, so the platform path is safe.
- **Evidence tier:** [A]. Confidence: certain on mechanism; trigger depends on future releases (inference).

### [LOW] L1 — No health-check endpoint
- All 15 API routes enumerated (`src/app/api/**/route.ts`): achievements(+id/award/score/status), auth, backup, cleanup, cron/weekly-backup, logs, pin(+reset/confirm), settings, upload. No `/api/health` (or any unauthenticated liveness probe). The proxy matcher also excludes `/api` from CSP/page logic (`src/proxy.ts:113-120`). Impact: external uptime monitors have no cheap dedicated probe (they must hit a real page).
- **Evidence tier:** [A]. Confidence: certain.

### [LOW] L2 — Playwright config is minimal: no `webServer`, so E2E requires a manually started server
- `playwright.config.mjs:1-9` sets only `testDir`, `timeout`, `baseURL: 'http://localhost:3000'`, `headless` — no `webServer` (auto-start), no browser `projects`, no retries/trace. README's `npx playwright test` (README:213-214) fails unless `npm run dev` is already running. Six E2E `test(` cases verified in `e2e/` (count = 6, matching the "6/6" badge).
- **Evidence tier:** [A]. Confidence: certain.

### [LOW] L3 — README drift and cosmetics
- README:9/:72/:217 claim "83 tests"; actual `it(`/`test(` case count across `src/lib/*.test.ts` + `src/proxy.test.ts` is **86** (badge stale).
- README:82/:84 say `public/manifest.json`; the real file is `public/manifest.webmanifest` (PWA itself is real: `public/sw.js` precaches `/offline.html` + icons with a versioned cache and offline navigation fallback — `public/sw.js:1-15,36-44`).
- README:243 (Backup & DR) contains visibly corrupted markdown: "`Authorization=[redacted] All sensitive hashes are automatically redacted…`" — a sentence fragment where the Authorization-header description was garbled.
- README:55 (App Check) is **accurate but narrower than it reads**: client init in `src/lib/firebase.ts:53-55` and server verification **only on `/api/upload`, production-only, only when `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is provisioned** (`src/app/api/upload/route.ts:100-114`: `isAppCheckConfigured` check then `verifyAppCheckToken`; enforcement returns 401 on failure at `:108-114`). Other API routes (auth, pin, achievements) accept no App Check token — "protecting backend assets" overstates scope.
- README:49 (CSP via `src/proxy.ts`) is **TRUE** and verified: per-request nonce + `'strict-dynamic'`, no `'unsafe-eval'` outside dev (`src/proxy.ts:15-33`), request+response header propagation (`:35-52`), API/static assets excluded from the matcher (`:113-120`).
- README:56 (rate limiting) is **TRUE**: Upstash primary + in-memory fallback + one-time production alert (`src/lib/rate-limit.ts:31-37, 63-70`), applied at auth (`auth/route.ts:54`), pin store/verify (`pin/route.ts:57,102`), pin-reset (`pin/reset/route.ts:24`), upload (`upload/route.ts:117`), achievements POST (`achievements/route.ts:40`).
- README:243 "pre-storage sanitization" is **TRUE** (see H3 Gap 1) — and is also what breaks DR (H3).
- **Evidence tier:** [A]. Confidence: certain.

### [LOW] L4 — Security-header nits
- Present and good: HSTS 2-year + `includeSubDomains; preload` (`next.config.mjs:7`), `X-Content-Type-Options: nosniff` (:8), `X-Frame-Options: DENY` (:9), `Referrer-Policy: same-origin` (:10), `Permissions-Policy` camera/mic/geo off (:11), plus full CSP in proxy (frame-ancestors 'none', object-src 'none', upgrade-insecure-requests — `src/proxy.ts:20-33`). HTTPS is enforced-by-platform on Vercel and HSTS preloads it.
- Nits: `style-src 'unsafe-inline'` (Tailwind/HMR tradeoff — standard, but weakens CSP against style-injection exfil); `static.cloudflareinsights.com` allowlisted in `script-src`/`connect-src` although the stack is Vercel-hosted (stale allowlist, harmless); no COOP/COEP headers (not required for this app's feature set). `src/proxy.ts:19`.
- **Evidence tier:** [A]. Confidence: certain.

### [LOW] L5 — Client-IP extraction trusts the leftmost `X-Forwarded-For` hop
- `src/lib/rate-limit.ts:114-122` (`getClientIp`) and `src/lib/logger.ts:73-77` take `x-forwarded-for.split(',')[0]`. If the platform did not sanitize inbound XFF, callers could rotate the header to bypass per-IP limits and pollute lockout keys. On Vercel the header is platform-managed (inbound values replaced), so this is a portability/defense-in-depth note, not an exploitable hole here. **Unverified against platform behavior in this environment.**
- **Evidence tier:** [A] code + [I] platform behavior. Confidence: low-medium.

---

## 3. Dependency CVE verification (web-checked 2026-10-28)

| Dependency | Locked version (package-lock.json) | Status vs known advisories | Sources |
|---|---|---|---|
| next | **16.4.2** (`package-lock.json:8680-8683`) | ✅ Covered. Oct 14 2026 out-of-band security release (RCE in Cache Components `use cache` typed arrays GHSA-673q-mjm6-r5xr; RCE in image-optimization SVG path CVE-2026-96889 via sharp; Server-Actions DoS) — patched in **16.4.1+**. Sep 22 2026 `next/og` RCE affected 16.2.0–16.3.5. May 2026 batch (CVE-2026-44578/44580) fixed in 16.2.5. Aug 26 2026 critical fixed in the 16.3/16.4 line. | develop-better-solutions.com/alerts/nextjs-critical-rce-fixes-august-to-october-2026 (fetched); NVD search results; socket.dev (2026-07-16) |
| sharp (dev, image optimizer) | **0.35.5** (`node_modules/sharp` lock entry) | ✅ Matches the advisory's fixed version ("Next.js gives sharp 0.35.5 or later as the workaround for the SVG flaw") | same Oct 2026 alert |
| react / react-dom | **19.2.4** (`:9488-9491`) | ✅ Covered for React2Shell RSC RCE (CVE-2025-55182) — fixed in 19.0.2/19.1.3/**19.2.2**. CVE-2026-23870 (RSC DoS, CVSS 7.5) surfaced in 2026 reporting; exact fixed version not pinned to a URL (see §5), but 19.2.4 is a later 19.2.x security release described as addressing RSC issues. | community.vercel.com RSC security update (2025-12-12); NVD; optibot.re CVE roundup (2026-05-14) |
| firebase (JS SDK) | **12.19.0** (`:6233-6236`) | ✅ No published security advisories found for 12.x in searched databases. Absence of evidence, not proof. | GitHub security pages; web searches |
| firebase-admin | **14.5.0** (`:6269-6272`) | ✅ No published advisories found for 14.x. | same |
| nodemailer | **10.0.10** (`:8828-8831`) | ⚠️ **Inside vulnerable range** of SNYK-JS-NODEMAILER-21663373 (`>=3.0.0 <10.1.4`, published 2026-10-24): address-parser interpretation conflict → recipient injection into envelope. Upgrade to ≥10.1.4. CVE-2025-14874 (DoS) presumed fixed in this line (see M5). | security.snyk.io/vuln/SNYK-JS-NODEMAILER-21663373; github.com/nodemailer advisory GHSA-rcmh-qjqh-p98v |
| jspdf | **4.2.1** (`:7938-7941`) | ✅ Covered: "Prior to 4.2.0, user control of the argument of the `addJS` method allows…" (PDF object injection) — fixed in 4.2.0. | bugzilla.redhat.com/show_bug.cgi?id=2440993 (2026-02-19) |
| html2canvas | **1.4.1** (`:7050-7053`) | ✅ Snyk package page for 1.4.1: "No direct vulnerabilities have been found." CVE-2022-25965 (onclone XSS) was fixed exactly in 1.4.1. | security.snyk.io/package/npm/html2canvas/1.4.1 |
| pdfmake | **0.3.11** (`:9250-9253`) | ✅ No advisories found in searched databases. | web searches |
| xlsx (vendored) | **0.20.3** (`:11669-11672`, `resolved: file:vendor/xlsx-0.20.3.tgz`, integrity recorded) | ✅ Covers both historic CVEs: CVE-2023-30533 (prototype pollution) fixed in 0.19.3; CVE-2024-22363 (ReDoS) fixed in 0.20.2. 0.20.3 ≥ both. | sara-open.sirp.io CVE entry; security.snyk.io xlsx pages ("fixed in version 0.20.2… distributed only via the authoritative source") |

**xlsx vendoring — why, and is it the official artifact? (brief's direct question)**
- **Why vendored:** SheetJS ≥0.19.3 is **not on npm at all** — the npm registry's `xlsx` latest is **0.18.5** (fetched `https://registry.npmjs.org/xlsx/latest` on 2026-10-28: `"version":"0.18.5"`), which still contains **both** CVEs. SheetJS's own CDN page (cdn.sheetjs.com, fetched 2026-10-28) explicitly endorses this: "Vendoring scripts and modules reduces the software supply chain attack surface." Vendoring `file:./vendor/xlsx-0.20.3.tgz` is therefore the **only** way to consume 0.20.3+.
- **Authenticity — verified bit-for-bit:** SHA-256 of `vendor/xlsx-0.20.3.tgz` = `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`, **identical** to `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` downloaded and hashed the same way (2026-10-28). Tarball structure matches the official build (package/package.json `version: 0.20.3`, Apache-2.0, `repository: https://git.sheetjs.com/SheetJS/sheetjs`, zero runtime deps). Lockfile additionally pins an integrity hash (`package-lock.json:11672`), so tampering with the tarball trips `npm ci`.
- **Real attack surface:** the only usage is a client-side, dynamic import that **writes** app data to xlsx (`src/app/full-record/page.tsx:237-268`: `const XLSX = await import('xlsx'); ... json_to_sheet ... XLSX.write(...)`). It never parses untrusted files, so even the historic CVE classes were largely inapplicable.
- **Could not verify:** whether any SheetJS CE release >0.20.3 exists (cdn.sheetjs.com's release table is JS-rendered and did not render in the fetch; docs.sheetjs.com CHANGELOG fetch failed). No advisory affecting ≥0.20.3 surfaced in any search. Marked as unverified-current, low risk.

**Other config files**
- `firebase.json:1-8`: only rules mappings (firestore.rules, storage.rules) — appropriate for a Vercel-hosted app; no emulators config (cosmetic).
- `tsconfig.json`: `strict: true`, bundler resolution — sound. Note `paths: {"@/*": ["./*"]}` maps to repo root while source code uses deep **relative** imports (`'../../../../lib/…'`, e.g. `weekly-backup/route.ts:6-9`); the alias is effectively vestigial and inconsistent with the `src/` layout (cosmetic).
- `vitest.config.ts:5-15`: node environment, includes `src/**/*.test.ts`, coverage limited to `src/lib/**` (so `src/proxy.test.ts` runs but isn't counted in coverage — cosmetic). 9 test files exist.
- `vercel.json`: **only** the cron block — no `functions`/`regions`/`headers`/`framework` overrides (see M4).

**Environment-variable drift matrix** (names only; no values inspected)

| Variable | In .env.example | In .env.local (names) | Read by code |
|---|---|---|---|
| AUTH_SECRET, PIN_PEPPER, CRON_SECRET, CLOUDINARY_* (5), NEXT_PUBLIC_FIREBASE_* (6), NEXT_PUBLIC_APP_URL | ✔ | ✔ | ✔ |
| FIREBASE_SERVICE_ACCOUNT | ✖ (only a commented `FIREBASE_SERVICE_ACCOUNT_KEY` example) | **✔** | **✔ (only this name — firebase-admin.ts:10)** |
| FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY | ✔ (marked Required) | ✖ | ✖ **never read** |
| SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS | ✖ | ✔ | ✔ (mailer.ts:3-9) |
| UPSTASH_REDIS_REST_URL / TOKEN | ✔ | ✖ locally (fallback OK in dev) | ✔ (rate-limit.ts:31-34) |
| NEXT_PUBLIC_RECAPTCHA_SITE_KEY / APPCHECK_PROVIDER | ✔ | ✖ (App Check disabled/optional) | ✔ (firebase.ts, upload/route.ts:101) |

---

## 4. What could not be verified (honest gaps)

1. **Vercel project settings** — actual production env vars, plan tier (Hobby vs Pro), Fluid/`maxDuration` overrides, and log retention live in the Vercel dashboard; `.vercel/` contains only `repo.json`/`README.txt`. The production site itself was not contacted (per hard rules).
2. **Whether any SheetJS CE release >0.20.3 exists** (JS-rendered release table; changelog fetch failed). No advisory against 0.20.3 found.
3. **Exact patched version for CVE-2025-14874** (GHSA page text didn't include the patched-versions field) — coverage presumed from release chronology, not pinned.
4. **Exact fixed version for CVE-2026-23870** (RSC DoS) — secondary source only; react 19.2.4 is a later security-focused 19.2.x release.
5. **Whether the running production deployment** has Upstash/reCAPTCHA configured (`.env.local` lacks them, but Vercel env may differ) — relevant to rate-limit distribution and App Check enforcement in prod.
6. **Test pass status** — badges claim 83/83 + 6/6; counts match (~86 unit cases, 6 e2e) but tests were not executed (read-only audit; not needed for the ops question).

## 5. Recommended next steps (highest value first)

1. **Fix the env contract (H1/M1):** add `FIREBASE_SERVICE_ACCOUNT` (+ SMTP_*) to `.env.example`/README, or better: make `firebase-admin.ts:10-30` read the documented trio/`FIREBASE_SERVICE_ACCOUNT_KEY` too, and **fail fast at boot** in production instead of `console.warn` + ADC fallback.
2. **Move backups off the primary datastore (H2):** write cron backups to external object storage (or at minimum email/Cloudinary), drop `logs` from the export set (or shard per-collection docs to respect 1 MiB), add cron-failure alerting (Vercel cron logs → external monitor), and document RPO = 7 days.
3. **Make restore actually restorable (H3):** store auth-hash docs in a separate (optionally encrypted) backup payload or document the manual re-provision procedure; convert ISO strings back to `Timestamp` on restore (`Timestamp.fromDate`); add a restore integration test.
4. **Add CI (M2):** GitHub Actions running `npm ci` (proves the patch applies), `tsc --noEmit`, `eslint`, `vitest run`, Playwright with `webServer` config; pin `engines.node` ≥20.9 (README's claim) and consider `packageManager`.
5. **Bump nodemailer to ≥10.1.4 (M5)** in the next dependency pass.
6. **Add `/api/health` (L1)** for uptime monitors, and wire a crash/uptime monitor (Better Stack/Sentry) to Vercel logs (M3).

---

*Audit performed read-only; no repository file was modified. No emails sent, no Cloudinary calls, no production endpoints contacted. External downloads: registry.npmjs.org metadata, cdn.sheetjs.com tarball (integrity comparison only), advisory/doc pages (all fetched 2026-10-28).*
