# 📈 Progress Tracker — Remediation Roadmap

Tracks execution of [`RESUME.md`](file:///c:/Users/ahmed/Desktop/School-Achievements/RESUME.md) (all 19 findings).
**Rule:** update this file only. One step at a time.

**Current Status:** Phase 1–4 Complete (Steps 1–14) · Phase 5 In Progress (Steps 15–16 done, Step 17 next)  
**Unit Tests:** 83/83 passing (100%) · **TypeScript:** 0 errors · **Turbopack Build:** clean (all routes dynamic)  

**Legend:** `[ ]` pending · `[~]` in progress · `[x]` done · `[!]` blocked

Started: 2026-10-17

---

## Phase 1 — Emergency Credential & Core Dependency Fixes
- [x] **Step 1** — Revoke leaked GCP key & scrub Git history (Finding #2)
- [x] **Step 2** — Upgrade Next.js to `>=16.4.2` & patch transitive deps (Finding #1)
- [x] **Step 3** — Verify Vercel env names/flags/distinctness & pull `.env.local` (Findings #3, #18)

## Phase 2 — Authentication & Access Control Hardening
- [x] **Step 4** — Disallow JWT fallback to `PIN_PEPPER`; enforce `AUTH_SECRET` (Finding #11)
- [x] **Step 5** — Safely migrate & eliminate plaintext PIN fallback (Finding #12)
- [x] **Step 6** — Lockout/backoff on admin + achievement PIN endpoints (Finding #6)
- [x] **Step 7** — Harden CSRF `isValidOrigin` (Finding #14)
- [x] **Step 8** — Secure `/api/upload` without breaking teacher submissions (Finding #4)

## Phase 3 — Storage, Cloudinary & App Check
- [x] **Step 9** — Cloudinary server-side signed uploads (Finding #5)
- [x] **Step 10** — Enforce Firebase App Check on client & routes (Finding #8)
- [x] **Step 11** — Restrict Storage rules & Console App Check (Finding #9)

## Phase 4 — Network, CSP & Rate Limiting
- [x] **Step 12** — Nonce-based CSP (single owner: `proxy.ts`) (Finding #7)
- [x] **Step 13** — Distributed rate limiter (Upstash) + prod alerting (Finding #10)
- [x] **Step 14** — `CRON_SECRET` constant-time compare, no bypass (Finding #13)

## Phase 5 — Data Privacy, Code Quality & SEO
- [x] **Step 15** — Scrub secrets from weekly backups (Finding #17)
- [x] **Step 16** — Fix logger format-string (semgrep) (Finding #15)
- [ ] **Step 17** — Resolve ESLint errors & `useAdmin` state render (Finding #16)
- [ ] **Step 18** — Define `metadataBase` (Finding #19)

## Phase 6 — Final Release Gate
- [ ] **Step 19** — Full 10-step release verification (All)

---

## Execution Log

| Step | Date | Result / Notes |
|:---:|:---:|---|
| — | 2026-10-17 | Tracker created. |
| Step 1 | 2026-10-17 | `[x]` PASS. Leaked key confirmed removed. Git history purged of `CLOUDINARY.txt` via `git-filter-repo`. Gitleaks verified: 0 leaks found across 190 commits. Working tree preserved and remote re-linked. |
| Step 1 (recheck) | 2026-10-17 | Re-verified independently: `gitleaks detect` → 0 leaks / 190 commits; `CLOUDINARY.txt` absent from working tree, index, and all history refs. Gap closed: added `*.env`, `CLOUDINARY.txt`, `/CLOUDINARY.txt` to `.gitignore` to prevent reintroduction. |
| Step 2 | 2026-10-17 | `[x]` PASS. Upgraded to `next@16.4.2` & `eslint-config-next@16.4.2`. Ran `npm audit fix`. 0 Critical CVEs. All 52 Vitest unit tests passed. Turbopack production build succeeded cleanly (26 routes). |
| Step 2 (recheck) | 2026-10-17 | Re-verified independently: installed `next@16.4.2`, `npm audit --omit=dev` → 0 critical, Vitest 52/52. Residual: 11 high (4 prod `@grpc/grpc-js` via `firebase`/`firebase-admin`; 7 dev-only via `eslint-config-next`/`patch-package`). `npm audit fix --dry-run` = "up to date" → all need breaking `--force`. Flag for Step 19: broaden the accepted-risk note beyond `@grpc/grpc-js` or the "0 high" gate fails. |
| Step 3 | 2026-10-17 | `[x]` PASS. Linked to `champ-ko/school-achievements`. Confirmed server-only variables, distinct `AUTH_SECRET`, and `CLOUDINARY_UPLOAD_PRESET`. Aligned `.env.example`. Pulled `.env.local`. Smoke test `GET /api/auth` returned HTTP 200 (Firebase Admin initialized cleanly, 0 crashes). |
| Step 4 | 2026-10-17 | `[x]` PASS. Removed `PIN_PEPPER` fallback in `src/lib/admin-session.ts`, strictly requiring `AUTH_SECRET` (hashed with SHA-256 for 256-bit `jose` compatibility). Added unit tests confirming key distinctness and non-fallback behavior. All 54 unit tests pass cleanly. |
| Step 5 | 2026-10-17 | `[x]` PASS. Verified `admin/pinConfig.pinHash` exists (128 hex chars) and legacy `adminPin` is absent. Removed plaintext fallback and unused `setDoc` import from `src/app/api/auth/route.ts`. Preserved 600k verification with timingSafeEqual and 10k auto-upgrade. All 54 unit tests pass cleanly, tsc clean. |
| Step 6 | 2026-10-17 | `[x]` PASS. Implemented global 5-failure/15-minute lockout on `/api/auth` with exponential backoff (`await sleep(attempts * 250)`). Implemented per-achievement + IP lockout on `/api/pin` and `/api/achievements/[id]` with admin session bypass and auto-unlock (`resetAchievementLockouts`). Added 9 new unit tests in `src/lib/rate-limit.test.ts`. All 63 Vitest unit tests pass cleanly; `tsc --noEmit` clean (0 errors). |
| Steps 3–6 (recheck) | 2026-10-17 | Code-level verification (source only): #3 `.env.example` = `CLOUDINARY_UPLOAD_PRESET`, 0 `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in `src/`, `.env.local` present w/ distinct secrets; #4 `admin-session.ts` AUTH_SECRET-only (no pepper fallback); #5 `auth/route.ts` reads only `pinConfig.pinHash` (no `adminPin`, no `setDoc`); #6 lockout+backoff present in `auth`, `pin`, `achievements/[id]` (key `pin-lockout:${id}:${ip}`). `tsc --noEmit` exit 0; Vitest 63/63. |
| Step 7 | 2026-10-17 | `[x]` PASS. Rewrote `src/lib/csrf.ts`: trusted-host allowlist from `Host` + `X-Forwarded-Host` + `NEXT_PUBLIC_APP_URL`; state-changing methods (`POST/PUT/DELETE/PATCH`) now **fail closed** when no trusted host, or when both Origin/Referer omitted/invalid; safe methods unaffected. All callers are POST/PUT. Expanded `csrf.test.ts` to 10 tests (added omitted-headers, no-host, `null` origin, app-URL allowlist, safe-GET). `tsc --noEmit` exit 0; Vitest 68/68. |
| Step 8 | 2026-10-17 | `[x]` PASS. `src/app/api/upload/route.ts`: added `isValidOrigin(request)` CSRF gate (403 on invalid origin) and tightened rate limit to **10 uploads / 10 min** per IP via `getClientIp`. Kept endpoint public (no admin session) to preserve teacher submissions; existing MIME allowlist + magic-byte + per-type size checks retained. App Check enforcement intentionally deferred to Step 10 (client not yet initialized). `tsc --noEmit` exit 0; Vitest 68/68. |
| Step 9 | 2026-10-17 | `[x]` PASS. Added `signUploadParams()` to `src/lib/cloudinary.ts` (alphabetical sort + api_secret appended, SHA-256). `src/app/api/upload/route.ts` computes `timestamp`+`signature` and sends `api_key`/`timestamp`/`upload_preset`/`signature`. Cloudinary preset `school_achievements` updated from Unsigned → Signed in console by user (verified). Tests: 5/5 `cloudinary.test.ts` pass. `tsc --noEmit` exit 0; Vitest 73/73. |
| Step 10 | 2026-10-17 | `[x]` PASS (Code Ready & Graceful Fallback). Client: `src/lib/firebase.ts` initializes App Check (reCAPTCHA Enterprise/v3) behind a `globalThis` guard + `getAppCheckToken()` helper. Server: `firebase-admin.ts` adds `verifyAppCheckToken()`. `/api/upload` enforces App Check in production *only* when `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` is provisioned. If reCAPTCHA is not created, uploads safely fall back to CSRF + Rate Limiting + Magic Bytes + Signed Cloudinary without breaking production. `tsc --noEmit` exit 0; Vitest 73/73; build clean. |
| Step 10 (provider note) | 2026-10-17 | SDK exports both `ReCaptchaV3Provider` and `ReCaptchaEnterpriseProvider`. Configurable via `NEXT_PUBLIC_APPCHECK_PROVIDER` (`enterprise` default \| `v3`). Optional: If user creates a free reCAPTCHA v3 key later, it activates automatically without further code changes. |
| Step 11 | 2026-10-17 | `[x]` PASS. `storage.rules`: removed public `allow read: if true` → now `allow read: if request.auth != null; allow write: if false;`. Verified no app code uses Firebase Storage (only unused `getStorage` import), so no breakage — all media is served via Cloudinary. **MANUAL:** run `firebase deploy --only storage` to push rules. Storage App Check console toggle deferred with the rest of App Check. |
| Step 12 | 2026-10-17 | `[x]` PASS. `src/proxy.ts` now generates a per-request nonce (`crypto.randomUUID()` → base64), builds `script-src 'self' 'nonce-…' 'strict-dynamic'` (dropped `'unsafe-inline'` + `'unsafe-eval'`; `'unsafe-eval'` re-added only in dev), and sets CSP on **both** request headers (so Next applies the nonce during SSR — hydration-safe) and the response header (incl. redirects). Removed the `cspHeader` const + `Content-Security-Policy` entry from `next.config.mjs` (HSTS/X-CTO/XFO/Referrer-Policy/Permissions-Policy kept). Preserved `apis.google.com`, Cloudinary/Firebase sources; added reCAPTCHA (`google.com`) for future App Check. `src/app/layout.tsx` → `async` + `export const dynamic = 'force-dynamic'` (nonce requires dynamic rendering); nonce passed to the conditional Cloudflare `<Script>`. |
| Step 12 (runtime verify) | 2026-10-17 | `npm run start` → `GET /intro`: HTTP 200, CSP header nonce == nonce on all 21 injected `<script>` tags (verified match). `tsc --noEmit` exit 0; Vitest 73/73; build clean. **Trade-off:** all routes are now `ƒ (Dynamic)` (static optimization lost — inherent to nonce CSP). |
| Step 13 | 2026-10-17 | `[x]` PASS. Installed `@upstash/ratelimit` + `@upstash/redis` (audit unchanged: still 11 high, no new CVEs). Refactored `src/lib/rate-limit.ts`: Upstash Redis is the primary engine (`@upstash/ratelimit` sliding window; lockouts in Redis with TTL) and the in-memory `Map` is the fallback. `checkRateLimit`/`checkLockout`/`recordFailedAttempt`/`resetLockout`/`resetAchievementLockouts` are now **async**; added `isDistributedRateLimitEnabled()`. **Safeguard:** in production, missing Upstash creds → one-time `console.error` + `logError('security', …)` high-severity alert (no silent degradation); runtime Upstash errors also fall back + alert. Updated all 7 callers (`auth`, `pin`, `pin/reset`, `pin/reset/confirm`, `achievements`, `achievements/[id]`, `upload`) to `await`. `.env.example` documents `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`. `tsc --noEmit` exit 0; Vitest 78/78 (rate-limit 15→16, +distributed-detection test); build clean. |
| Step 13 (runtime verify) | 2026-10-17 | `npm run start` → `POST /api/auth {"pin":"0000"}` returned **401** `{remainingAttempts:4}` — confirms the async lockout + rate-limit (in-memory fallback) path executes end-to-end. **MANUAL:** create an Upstash Redis DB and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel (Prod + Preview). Until then the prod alert will fire by design. |
| Step 14 | 2026-10-17 | `[x]` PASS. `src/app/api/cron/weekly-backup/route.ts`: replaced the non-constant-time `authHeader === \`Bearer ${CRON_SECRET}\`` check with `timingSafeEqual` over equal-length buffers (`expected.length === actual.length && timingSafeEqual(...)`). Empty/missing secret can never authorize (no bypass); admin-session fallback retained. `tsc --noEmit` exit 0; Vitest 78/78. |
| Step 14 (runtime verify) | 2026-10-17 | `npm run start` → `GET /api/cron/weekly-backup`: `Authorization: Bearer ` (empty) → **401**; no auth header → **401**. Build clean. |
| Step 15 | 2026-10-17 | `[x]` PASS. Created `src/lib/backup-sanitize.ts` with `scrubSensitiveFields(docData)` which strips `pinHash`, `tokenHash`, `adminPin`, `adminEmail` before storage. Non-mutating shallow copy. Wired into `src/app/api/cron/weekly-backup/route.ts:54`. New `backup-sanitize.test.ts` (5 tests). `tsc --noEmit` exit 0; Vitest 83/83. |
| Step 16 | 2026-10-17 | `[x]` PASS. `src/lib/logger.ts`: replaced dynamic format strings with literal `'%s %s'` in `console.error`, `console.warn`, and `console.log`. Clears Semgrep SAST rule `unsafe-formatstring`. All 6 `logger.test.ts` pass cleanly. `tsc --noEmit` exit 0; Vitest 83/83; build clean. |

