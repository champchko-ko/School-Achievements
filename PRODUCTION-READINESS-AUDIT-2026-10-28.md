# Production-Readiness & Security Audit — School-Achievements

**Date:** 2026-10-28 · **Repo:** `master` @ `609110a` (working tree clean) · **Stack:** Next.js 16.4.2 (App Router, Turbopack) · React 19.2.4 · Firebase (Firestore + Admin SDK 14.5.0) · Cloudinary · Upstash · Nodemailer · Vercel · PWA
**Method:** Read-only audit — **no code file was changed, no secret value was read or printed, no production system was contacted, no destructive operation was performed.** All tests ran locally; the e2e suite ran against a local production build with Firebase Admin credentials deliberately disabled so no test could write to the real database.
**Evidence standard:** every finding cites `file:line`. Load-bearing claims (backup gap, dead admin page, restore mismatch, corrupted offline.html, env drift, lint error) were independently re-verified in this session, not just reported.

> ## VERDICT: **NO-GO FOR PRODUCTION** (conditional)
> The application's security architecture is genuinely strong and no exploitable Critical vulnerability was found. The NO-GO is driven by the **disaster-recovery/data-loss cluster (C-1, H-1, H-2)**, a **deployment-blocking environment-contract defect for any fresh deploy (H-3)**, and **two dead admin features (H-4)** — which fails the audit's own criterion: *"Do not declare GO while any unresolved critical security, data-loss, or deployment-blocking issue remains."*
> **The distance to GO is small and precisely known — see §8 (7 fixes).** For the *currently running* instance with existing Vercel env vars, the app is stable and safe to operate; the gap is resilience and fresh-deploy reproducibility, not runtime security.

---

## 1. Executive summary

**What is verified good (and is often missing in apps like this):**
- Real security architecture, not aspirational: HS256 session JWT (30 min) in an `HttpOnly`/`Secure`/`SameSite=Strict` cookie (`src/lib/admin-session.ts`); PBKDF2-SHA512 **600k iterations + pepper + `timingSafeEqual`** on every PIN path (admin login, teacher PIN store/verify, reset); 5-attempt/15-min lockouts (global for admin, per-achievement-per-IP for teacher PINs) with exponential backoff; hashed single-use reset tokens (32-byte, SHA-256 stored) with enumeration-safe responses (`src/app/api/pin/reset/route.ts`).
- Origin/Referer allow-list CSRF validation (`src/lib/csrf.ts`) enforced on all state-changing routes **except** `/api/auth` POST and `/api/cleanup` (Low-1).
- Nonce-based CSP with `'strict-dynamic'` in `src/proxy.ts`, plus HSTS(2y, preload), `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` (`next.config.mjs`).
- Secrets hygiene: `.env*` is git-ignored (`!.env.example`), `git ls-files` shows no secret files tracked; no hardcoded credentials found in `src/`; Cloudinary API secret never reaches the client (signed upload uses timestamp+preset signature only); achievement PIN hashes live in a server-only collection and are stripped from all API responses.
- Server-side enforcement of teacher/department lists on create and edit (`src/lib/validate-lists.ts`), strict Cloudinary-only attachment-URL allow-list (`src/lib/sanitize.ts:52-56`), mass-assignment whitelist for non-admin edits (`achievements/[id]/route.ts`), magic-byte validation on the proxied upload path, per-type size limits, per-IP rate limits on all primary mutations, App Check enforced on uploads in production when configured.
- Firestore rules are default-deny with Admin-SDK-only writes; all client reads comply **except** H-4.
- Clean build: `tsc --noEmit` 0 errors, production build succeeds, 86/86 unit tests pass, 6/6 e2e pass.

**Why it is still NO-GO:** the system *protects* data well but cannot *recover* it. Teacher PIN hashes are never backed up, backups live inside the same Firestore they protect and will silently exceed Firestore's 1 MiB document cap as logs grow, the admin "restore" button always fails with a 400, and a fresh deployment built from the documented env vars loses every Admin-SDK feature silently. Two admin features are dead in production (monthly-awards page, document previews). All are precisely located and cheap to fix.

---

## 2. Test & verification results (actually executed)

| Check | Command | Result | Notes |
|---|---|---|---|
| Lint | `npm run lint` | **FAIL (1 error, 232 warnings)** | Error: `src/app/settings/page.tsx:146` — `prevTeachersList` accessed before its declaration (`:164`). Not a runtime crash today (the effect callback runs after the component body finishes), but it is a latent TDZ trap and a dead abstraction (the getter parameter is ignored). 232 `no-explicit-any` warnings. |
| Typecheck | `npx tsc --noEmit` | **PASS** | 0 errors. |
| Unit tests | `npm test` (Vitest 4.1.11) | **PASS 86/86** (9 files, ~0.5s) | Covers `sanitize`, `csrf`, `rate-limit`, `admin-session`, `logger`, `backup-sanitize`, `cloudinary`, `validate-lists`, `proxy`. Assertions are meaningful (e.g., CSRF fails-closed cases, lockout math, JWT expiry). **Zero coverage of API-route request handlers and zero page-level tests.** |
| Production build | `npm run build` | **PASS** | Next 16.4.2 Turbopack, compile 2.2s, 13/13 static pages, 29 routes emitted, Proxy (middleware) compiled. |
| Dependency audit | `npm audit --omit=dev` | **5 vulns (4 high, 1 moderate)** | All Nodemailer address-parser issues (recipient-injection interpretation conflicts + pre-auth regex DoS), fixed in ≥10.1.4; `npm audit fix` applies cleanly. Full audit incl. dev: 10 (6 high) — `vite`, `zod`, `launch-editor` (dev-only, not shipped). |
| E2E | `npx playwright test` | **PASS 6/6** (9.5s) | Run against `npm run start` of the production build at `localhost:3000` **with `FIREBASE_SERVICE_ACCOUNT` overridden to empty** — so the wrong-PIN test fails at the 500 path instead of writing auth-failure logs to the real Firestore. Covers intro/redirect/auth-guard only. |
| Web CVE verification | web (2026-10-28) | **next 16.4.2 ✅, react 19.2.4 ✅, firebase 12.19.0 ✅, firebase-admin 14.5.0 ✅, jspdf 4.2.1 ✅, html2canvas 1.4.1 ✅, nodemailer 10.0.10 ⚠️** | Vendored `xlsx-0.20.3.tgz` was **verified bit-for-bit** against the official SheetJS CDN artifact (SHA-256 match) — vendoring is the *only* way to consume ≥0.19.3 (npm's latest `xlsx` is 0.18.5 with both known CVEs), and the app never parses untrusted xlsx. |

**Not testable / deliberately not run (environmental limits, stated honestly):**
- Real admin-PIN login and lockout flow against the live Firestore (would write logs and consume real lockout attempts — prohibited).
- Cloudinary direct-upload handshake end-to-end and cron invocation in Vercel (no staging account; no deploy permitted).
- Backup/restore against real data (destructive), App Check behavior in production, actual deployed Firestore rules vs. repo rules, Vercel env parity (dashboard not accessible).
- Load/performance testing (no staging environment; unbounded queries make realistic load testing mandatory before scale — see M-7).

---

## 3. Critical

### C-1 — Teacher-PIN secrets are never backed up; a restore locks out the admin and every teacher
- **Evidence:** `src/lib/firebase-admin.ts:52-57` — the `doc()` compatibility shim rewrites 3-segment paths: `doc(db,'admin','achievementSecrets',id)` → **top-level collection `admin_achievementSecrets/{id}`** (same for `admin_pendingDeletions`, `admin_pinResets`). Both backup jobs export only `['achievements','settings','admin','logs']` (`src/app/api/backup/route.ts:10`, `src/app/api/cron/weekly-backup/route.ts:11`) and restore iterates exactly that list (`backup/route.ts:80`). The teacher-PIN hash is written *only* to the flattened collection (`api/achievements/route.ts:98`, `api/pin/route.ts:44-49`).
- **Impact (data loss):** after any incident requiring restore onto a fresh database, every achievement is unmanageable (`PUT`/`DELETE`/PIN-verify return 401 "لا يوجد رمز حماية" — `[id]/route.ts:79-82,218-221`) and must be re-provisioned manually one by one. Worse: backups scrub `pinHash`/`adminPin`/`adminEmail` (`src/lib/backup-sanitize.ts:8-15`, `backup/route.ts:111-114`), so a restored `admin/pinConfig` has no hash and no email → **admin cannot log in and cannot request a reset email** (`pin/reset/route.ts:46-49` returns "لم يتم تعيين بريد إلكتروني"). Full, unrecoverable lockout.
- **Fix direction:** include `admin_achievementSecrets` (and decide on `admin_pendingDeletions`/`admin_pinResets`) in `COLLECTIONS`; keep secrets scrubbed from *downloadable* copies but store them (encrypted) in the restore-able payload, or document the exact re-provision procedure. **This is the one finding that satisfies the audit's "data-loss blocker" criterion.**

---

## 4. High

### H-1 — Automated backups are stored inside the database they protect and will silently stop
- **Evidence:** weekly cron writes the entire export as **one Firestore document** (`cron/weekly-backup/route.ts:69`) — Firestore's hard cap is 1,048,576 bytes; the export includes `logs`, which grows unboundedly (no retention/rotation anywhere — logger writes every event, `src/lib/logger.ts:42`; only `/api/logs` reads last 50). Rolling retention of 8 (`:12`). No off-site copy exists in code (the manual CLI `scripts/backup-database.mjs` is the only external path and must be run by a human). Vercel cron is best-effort with **no retry and no alerting** (vercel.json registers it; failure only produces a log line — `:87-89`).
- **Impact:** the automated backup silently starts failing as data grows, and a database-level incident destroys both the data and its backups. Silent data-loss amplifier combined with C-1.
- **Fix direction:** chunked exports (per-collection / paginated documents), drop `logs` from the export set (or add a TTL policy), push completed backups to external storage, alert on cron failure.

### H-2 — The admin "استعادة" (restore) button can never succeed; restore corrupts Timestamps
- **Evidence:** UI posts `{ action:'restore', backupId }` with no `confirm` (`src/app/admin/page.tsx:329`); the API requires `body.confirm === true` and returns 400 otherwise (`src/app/api/backup/route.ts:71-78`). Additionally, backups convert Timestamps → ISO strings on export (`backup/route.ts:100-104`) and restore writes them back as strings (`:96-100`) — any code calling `.toDate()` breaks on restored docs (client pages read `timestamp.seconds`, e.g. `kiosk/page.tsx` sorting).
- **Impact:** the DR path exists in the API but is dead from the UI, and even a correct API call would partially corrupt the data model.
- **Fix direction:** two-step restore in the UI (`preview_restore` → confirm dialog → `confirm:true`); convert ISO strings back to `Timestamp.fromDate` on restore; add one integration test.

### H-3 — Documented env contract does not match the code → fresh deployments are broken by default
- **Evidence:** `src/lib/firebase-admin.ts:10` reads **only** `FIREBASE_SERVICE_ACCOUNT`; on absence it falls back to Application Default Credentials with just a `console.warn` (`:29-30`) — which cannot work on Vercel. Meanwhile `.env.example:46-57` and README document `FIREBASE_SERVICE_ACCOUNT_KEY` + `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`, **none of which appear anywhere in code**. `SMTP_HOST/PORT/USER/PASS` (required by `src/lib/mailer.ts:3-9`) are documented nowhere. `.env.local` (the working config) contains the correct names — the working setup exists but is undocumented.
- **Impact:** any fresh deploy following the docs silently loses every Admin-SDK feature (submissions, admin ops, backups, logs). Classic deployment blocker.
- **Fix direction:** fix `.env.example`/README (add `FIREBASE_SERVICE_ACCOUNT`, `SMTP_*`); **fail fast at boot** in production when the credential is missing instead of warn+fallback.

### H-4 — Admin monthly-awards page can never load its data
- **Evidence:** client query `query(collection(db,'achievements'))` with no `where('status','==','approved')` (`src/app/admin/monthly-awards/page.tsx:56`) cannot satisfy `allow read: if resource.data.status == 'approved'` (`firestore.rules:5-8`) → `permission-denied` whenever a pending item exists; the `onSnapshot` has **no error callback**, so the page spins forever.
- **Impact:** the awarding UI is dead even though the API (`/api/achievements/[id]/award`) works.
- **Fix direction:** filter the query (or read through `/api/achievements?all=true` like `admin/page.tsx`) and add snapshot error callbacks (see M-9).

### H-5 — CSP `frame-src` blocks the document-preview iframe in production
- **Evidence:** `src/proxy.ts:24` allow-lists only `'self' https://www.google.com https://recaptcha.google.com`, but the detail page embeds `https://docs.google.com/gview?...` for document previews (`src/app/achievement/[id]/page.tsx:432-439`).
- **Impact:** every attached document (PDF/Word) renders an empty 60vh box in production; the preview feature is broken for all users.
- **Fix direction:** add `https://docs.google.com` to `frame-src` (or preview via Cloudinary transformations / force download).

### H-6 — `offline.html` is corrupted (PWA offline fallback renders raw shell script)
- **Evidence:** `public/offline.html:39-81` — after `</html>` a literal shell heredoc (`cat > public/sw.js <<'JS' … JS`) including the entire service-worker source was accidentally appended. Re-verified in this session.
- **Impact:** the offline fallback page shows ~40 lines of raw script text below the Arabic message — broken offline experience on kiosk tablets (the app's PWA promise), and an unprofessional artifact.
- **Fix direction:** delete everything after `</html>` (the real `public/sw.js` file is intact and separately tracked).

### H-7 — No application-level error/loading UX; silent failures render as "empty"
- **Evidence:** no `error.tsx` / `global-error.tsx` / `not-found.tsx` / `loading.tsx` exists anywhere; `ErrorBoundary` wraps only the home page (`src/app/page.tsx:321`). 5 pages subscribe with `onSnapshot` without an error callback → permanent spinner on failure (`full-record:78, honor-roll:16, kiosk:81, monthly-awards:64, admin/monthly-awards:57`). Silent fetch failures render empty states — admin dashboard shows "عمل رائع! لا توجد إنجازات…" on fetch error (`admin/page.tsx:65-74`), security logs show "لا توجد أحداث" on error (`:296-304`).
- **Impact:** any rules/permission/network failure looks like "no data" to admins — dangerous for an approval workflow, and render errors on 13 of 14 pages show the default **English** Next.js error screen in an Arabic app.
- **Fix direction:** add root `error.tsx`/`not-found.tsx`, pass error callbacks to all snapshots, distinguish "empty" from "failed".

---

## 5. Medium

| ID | Finding | Evidence |
|---|---|---|
| M-1 | **`/api/upload` sign action is unauthenticated** and validates only the client-*declared* MIME/size; the direct-to-Cloudinary path never passes bytes through the server, so magic-byte checks (`upload/route.ts:44-119`) apply only to the proxy fallback (`:227-233`). Anyone with the site URL can mint signed-upload tokens (10/10min/IP, bypassable per M-2) and fill the school's Cloudinary account (cost/storage abuse) with arbitrary content the preset permits. | `upload/route.ts:135-186` |
| M-2 | **Client-IP extraction trusts the leftmost `x-forwarded-for` hop** (`rate-limit.ts:114-122`, same in `logger.ts:73-77`). On any platform that *appends* client-supplied XFF, per-IP limits become bypassable by header rotation. Vercel manages this header, so this is a portability/defense-in-depth defect — but the code comments ("trusted leftmost") assert more than is true. | `rate-limit.ts:114-122` |
| M-3 | **Lost-update race on the awards map** — `award/route.ts:42-57` is read-modify-write without a transaction; two concurrent award edits on one achievement silently drop one month's award. | `award/route.ts:42-57` |
| M-4 | **Cloudinary assets are destroyed before the Firestore write commits** in PUT/DELETE (`[id]/route.ts:160-180,260-278`); if the DB write then fails, the doc references deleted files. The `admin_pendingDeletions` queue is a **dead-letter queue with no consumer** (written at `[id]/route.ts:34`, never read anywhere). | `[id]/route.ts:31-40` |
| M-5 | **Cleanup `clean` can destroy in-flight uploads** — an asset uploaded but not yet attached to an achievement (the normal upload→save window) matches the "orphan" predicate and is deleted; the teacher's submission then succeeds without its attachment (`cleanup/route.ts:113-151` vs `AddAchievementModal.tsx:262-436`). | `cleanup/route.ts:113-151` |
| M-6 | **Non-atomic achievement create** — `addDoc` then `setDoc(secret)`; failure of the second leaves a PIN-less achievement no teacher can ever edit/delete, with no cleanup job. | `achievements/route.ts:84-99` |
| M-7 | **Unbounded data plane** — every `api/achievements` GET branch, backup/cron exports, cleanup scan, and six client `onSnapshot` streams read entire collections with no `limit()`/pagination; the admin dashboard refetches the full set every 20 s regardless of tab visibility (`admin/page.tsx:96-104`). Cost and latency grow linearly with history; also blocks realistic load testing. | `achievements/route.ts:121,124` et al. |
| M-8 | **Logs carry PII (IP, user-agent, full URL), have no retention, and amplify writes** — including an "Admin login successful" info log written on *every* 2-minute session check per open admin tab (`auth/route.ts:32` + `useAdmin.ts:25-31` ≈ 30 writes/hour/tab), and per-entry sequential `addDoc` flushes instead of `writeBatch` (`logger.ts:41-56`). Logs are also included in every backup (compounding H-1). | `logger.ts:113-119` |
| M-9 | **`onSnapshot` without error callbacks on 5 pages** → permanent spinners on any rules/permission failure (overlaps H-7; listed separately because it is a one-line-each mechanical fix). | `honor-roll:16, kiosk:81, monthly-awards:64, admin/monthly-awards:57, full-record:78` |
| M-10 | **Badge thresholds disagree between pages** — silver ≥75 on home (`page.tsx:55-60`) vs ≥80 on detail/full-record/kiosk; a 75-score achievement renders silver in one place and bronze in another; admin award defaults (`admin/page.tsx:731`) render inconsistently too. | `page.tsx:55-60` vs `full-record:13-17` |
| M-11 | **Honor-roll is labeled "هذا الشهر" (this month) but computes all-time** (`honor-roll/page.tsx:19-51,65`), and the reports page ranks "honor" by count while honor-roll ranks by points — two different leaderboards under near-identical wording. | `honor-roll:19-51` |
| M-12 | **Reports PDF export diverges from screen** — individual-teacher export includes pending/rejected items (screen shows approved only, `reports/page.tsx:152` vs `:383-387`), and `b.date.localeCompare` crashes on any legacy doc lacking `date` (`:153`). | `reports:152-153` |
| M-13 | **`/api/settings` PUT replaces the settings document without merging** (`settings/route.ts:78`) — safe only because today's form round-trips every field; any future server-side field is wiped by an older client's save. Related: achievement detail page cannot preview pending items even for admins (client `getDoc` is rules-blocked — `achievement/[id]/page.tsx:163-186`). | `settings/route.ts:78` |
| M-14 | **Nodemailer 10.0.10 is inside the vulnerable range** (≥3.0.0 <10.1.4 — address-parser interpretation conflict, recipient injection; SNYK-JS-NODEMAILER-21663373, published 2026-10-24). Exploitability here is low (recipient is the stored admin email) but it fails dependency scanning; `npm audit fix` resolves it. | `package-lock.json:8828-8831` |
| M-15 | **No CI pipeline, no Node engines pinning, fragile patch** — no `.github/`, no husky/lint-staged, no `engines` despite README claiming "Node.js >= 20.9.0"; `postinstall: patch-package` fails hard if the floating `^4.5.1` renderer bumps past the `@react-pdf+textkit+6.3.0.patch` context (fail-closed, but breaks installs). Nothing gates a push to production. | `package.json` |
| M-16 | **No external monitoring, crash reporting, or health endpoint** — logs go to Firestore + Vercel console only; cron failures alert nobody; no `/api/health` for uptime probes. Audit logs share the database's fate with the data they audit. | repo-wide grep |

---

## 6. Low (grouped)

1. **CSRF/origin coverage gaps:** `/api/auth` POST (login) and the entire `/api/cleanup` route lack `isValidOrigin` (`auth/route.ts:39ff`, `cleanup/route.ts:33ff`) — mitigated by SameSite=Strict cookies and token checks; consistency gap. `pin/reset/confirm` has no rate limit (256-bit token, infeasible) and a non-atomic single-use consume (`confirm/route.ts:45-66`).
2. **Lint error** `settings/page.tsx:146` (see §2) — latent TDZ pattern, dead getter abstraction.
3. **Dead code & dead deps:** `@react-pdf/renderer` (+its patch), `html2canvas`, `html2pdf.js`, `jspdf`, `framer-motion` have **zero imports** in `src/`; `lib/pdf.ts` `generateTablePdf`/`generateCategorizedPdf` (pdfmake + arabic-reshaper + bidi-js pipeline) are never called; `AchievementCard.tsx` never imported (and contains English badges). Inflates install/audit surface only.
4. **No-op defensive code:** `delete data.pinHash` on 4 client surfaces + API GET — the field never lives in `achievements` (secrets collection); `storage.rules` requires `request.auth != null` but the app never authenticates to Firebase Storage.
5. **Inconsistent API hygiene:** `score` route returns 500 (not 404) for unknown IDs; `status`/`award`/`score` skip the ID-format validation PUT/DELETE enforce.
6. **Maintenance bypass key** compared with `===` (non-constant-time) and passed via query string (leaks into logs/referrers) — `proxy.ts:78-84`.
7. **README drift:** "83 tests" (actual 86), `manifest.json` vs real `manifest.webmanifest`, one visibly corrupted markdown fragment in the Backup section, and App Check described more broadly than its actual scope (upload route only, production-only, only when provisioned).
8. **Cosmetics:** vestigial `@/*` tsconfig alias vs deep relative imports; corrupted Arabic metadata "وال.equivalencies" (`layout.tsx:16`); `animate-in`/`fade-in`/`zoom-in-95` classes are silent no-ops (tailwindcss-animate not installed); hidden score column markup on home table; `admin/page.tsx:561` string-interpolated `panel` class never applied.
9. **Accessibility/i18n:** form labels not associated with inputs (modal + all settings tabs), dropzone not keyboard-accessible, no Escape/focus-trap/aria-live on modals/toasts, English alt texts and English PWA manifest (`lang:"en"`, "Install App"), contrast failures (~2.5:1) on gray-400 helper text, PIN inputs lack `inputMode="numeric"`, hamburger button's aria-label on the SVG not the button.
10. **Kiosk gaps:** no Screen Wake Lock, no next-slide preload, fixed 8s timing, muted videos without captions.

---

## 7. Security posture assessment (summary of what was verified)

| Domain | Assessment |
|---|---|
| Authentication | **Strong.** PBKDF2-SHA512 600k + pepper + static salt, timing-safe compares, legacy-hash auto-upgrade, global + per-achievement lockouts with backoff, enumeration-safe reset, hashed single-use tokens. |
| Sessions | **Strong.** HS256 JWT, 30-min expiry, HttpOnly/Secure/Strict cookie; logout clears cookie (no server-side revocation — acceptable at this scale). |
| Authorization | **Solid, two independent layers:** proxy route gate for `/admin`, `/settings`, `/reports` (`proxy.ts:99-102`) + server-side `isAdminSession()` on every admin API. Teacher mutations require PIN or admin session. Mass-assignment whitelist for teacher edits. |
| CSRF | **Good with two gaps** (auth POST, cleanup — Low-1). Origin/Referer allow-list fails closed. |
| Rate limiting / abuse | **Good design (Upstash sliding window + in-memory fallback + alerts), weakened by M-1 (unauthenticated upload signing) and M-2 (XFF trust).** |
| Injection / XSS | **Strong.** React auto-escaping + HTML stripping + Excel-formula guards on export and at rest; CSP with nonce + strict-dynamic; strict Cloudinary-only URL allow-list; ID-format validation on mutation routes. |
| Uploads | **Mixed.** Proxy path is well-validated (type allow-list, size caps, magic bytes); direct path enforces only declared MIME at sign time (M-1). |
| Secrets | **Clean.** Nothing committed, nothing client-bundled, backups scrubbed (which is exactly what breaks restore — C-1). |
| Privacy | Logs and backups contain teacher names + IP + user-agent; no retention policy (M-8). School-context PII exposure is modest but should be governed. |
| OWASP Top-10 sweep | No Critical exploitable finding. A01 (broken access control): clean. A02 (crypto): strong. A03 (injection): clean. A04: design-level (M-1/M-5). A05 (misconfig): H-3/H-5. A07 (authn): strong. A08 (integrity): xlsx tarball verified authentic; patch fail-closed. A09 (logging): M-8/M-16. A10 (SSRF): n/a. |

---

## 8. Required fixes to flip to GO (minimal, ordered)

1. **C-1:** include `admin_achievementSecrets` in both backup jobs' `COLLECTIONS`; define (and document) where auth material lives in a restorable backup; add the manual re-provision procedure to the README as an interim mitigation.
2. **H-1:** chunk backup exports (≤1 MiB per document), exclude `logs` (or add a TTL), write at least one backup copy off-platform, alert on cron failure.
3. **H-2:** send `preview_restore` → show summary → `confirm:true` from the admin UI; convert ISO strings back to Timestamps on restore.
4. **H-3:** make `.env.example`/README match `firebase-admin.ts` (`FIREBASE_SERVICE_ACCOUNT`, `SMTP_*`); fail fast at boot in production.
5. **H-4:** fix the `admin/monthly-awards` query and add snapshot error callbacks on all five pages (M-9).
6. **H-5/H-6:** add `https://docs.google.com` to CSP `frame-src`; rebuild `public/offline.html` without the appended heredoc.
7. **Hygiene gate:** bump nodemailer ≥10.1.4, fix the lint error, add a CI workflow (`npm ci && lint && tsc && vitest && build`) and an `engines` field.

Items 1-4 are small, mechanical code changes; none requires schema migration or downtime. With 1-7 applied and one green CI run, this codebase is a defensible **GO**.

---

## 9. UI/UX & workflow improvement recommendations (school-context, ranked)

1. **Close the review loop.** A teacher never learns an outcome: rejection has no reason field and no notification path (`admin/page.tsx:244-264`). Add a rejection-reason input, an optional email/`logs`-backed notification, a pending-count badge in the sidebar, and keyboard approve/reject shortcuts — the admin queue is the operational heart of the app.
2. **Unify the two ranking systems.** Scores (75/85/95 → badges) and monthly awards (gold/silver/bronze) coexist with inconsistent thresholds across pages (M-10) and two different "honor" leaderboards (M-11). One consistent model, one source of truth, labeled honestly (month vs all-time).
3. **Make admin state honest.** Replace the 20s blind full refetch with visibility-aware polling or snapshots; always distinguish "empty" from "failed to load"; show admin previews of pending achievements on the detail page (currently rules-blocked, M-13).
4. **Harden the submission flow.** Prevent closing the modal mid-upload (backdrop/X/cancel active while submitting, `AddAchievementModal.tsx:343-350,660-676`), add per-file progress (100 MB videos currently show only a spinner), keyboard-accessible dropzone, Escape/focus-trap/aria-live on modals, and label-input association everywhere.
5. **Make settings safe to touch.** Unsaved-changes guard on navigation, confirm field for the admin PIN, confirmation dialogs (with in-use checks) for deleting departments/teachers (`settings/page.tsx:389-395,465-500,601-620`).
6. **Kiosk mode:** Screen Wake Lock API, preload the next slide, configurable rotation timing, captions on muted videos.
7. **Full Arabic immersion:** Arabic PWA manifest + install prompt, Arabic alt texts, fix the corrupted `layout.tsx` description metadata.
8. **Accessibility baseline:** contrast fixes for gray-400 helper text, `inputMode="numeric"` on PIN fields, aria-label on the hamburger button, remove the no-op animate classes or add the plugin.
9. **Trim the dependency surface:** remove the four unused PDF libraries + framer-motion and the dead `AchievementCard`/`pdf.ts` pipelines — smaller installs, smaller audit noise, and it retires the fragile patch step.
10. **Ops UX:** add `/api/health`, surface backup status (last successful backup + failures) on the admin backup panel — today an admin cannot see that backups silently stopped (H-1).

---

## 10. Compliance with audit execution rules

- No code file was created, modified, or reverted (verified by clean `git status` throughout; children were bound to the same rule and reported writing only to `.zwork/` / workspace-root report files).
- No secret value was read or printed — only variable names; the tool layer additionally redacted token literals.
- No production system was contacted: no deploy, no emails, no Cloudinary/Upstash/production-URL calls; the e2e wrong-PIN test was executed with Firebase Admin credentials disabled to guarantee zero production writes.
- No test results are fabricated: every result in §2 is a real command run in this session, including the failures (lint) and the deliberate limitations (e2e scope).
- No destructive operation was performed on any database; no infrastructure was modified.

*Supporting detailed reports: [frontend-ux-audit-2026-10-28.md](frontend-ux-audit-2026-10-28.md) · [backend-data.md](.zwork/audit-20261028/backend-data.md) · [ops & dependencies](audit-20261028-ops-deps.md)*
