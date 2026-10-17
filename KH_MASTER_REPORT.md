# KH_MASTER_REPORT — Combined Security & Release Audit

**Target Codebase:** School-Achievements (`Next.js 16.2.7`, `React 19`, `Firebase Admin & Client`, `Cloudinary`)  
**Audit Date:** 2026-10-17  
**Scope:** Static Analysis, Dependency Security, Secret Detection, Access Control, Next.js Config, Automated Tests, Production Build, Lighthouse  
**Standard:** 100% Unique Coverage (Exact 19/19 Union Findings, 1 Finding Per Row, Zero Repetition)

---

## 1. Audit Pipeline Results

| # | Check / Tool | Status | Summary |
|---|---|---|---|
| 1 | TypeScript (`npx tsc --noEmit`) | **PASS** | 0 type errors. |
| 2 | ESLint (`npx eslint .`) | **FAIL** | 256 problems (193 errors, 63 warnings: widespread `any`, unused vars, `set-state-in-effect`). |
| 3 | Dependency Audit (`npm audit --omit=dev`) | **FAIL** | 17 vulnerabilities (1 Critical, 8 High, 7 Moderate, 1 Low). Critical CVEs in Next.js core. |
| 4 | Secret Detection (`gitleaks detect`) | **FAIL** | 1 live GCP API key committed in git history (`CLOUDINARY.txt` @ commit `54a2c14`). |
| 5 | SAST (`semgrep scan --config auto`) | **FAIL** | 3 blocking findings: format string injection risk (`unsafe-formatstring`) in `src/lib/logger.ts`. |
| 6 | Rules & Access Control Review | **FAIL** | App Check absent; unauthenticated upload route; 4-digit PIN brute-force risk; weak CSRF. |
| 7 | Next.js Config, Headers, Env & Storage | **FAIL** | CSP `script-src` permits `'unsafe-inline'`/`'unsafe-eval'`; unsigned Cloudinary preset; in-memory limiter. |
| 8 | Automated Tests (`npm test` & Playwright) | **PASS** | Vitest: 52/52 passed; Playwright E2E: 6/6 passed (auth flows & main navigation). |
| 9 | Production Build (`npm run build`) | **PASS** | Next.js 16.2.7 Turbopack built 26 static/dynamic routes cleanly in 3.1s. |
| 10 | Lighthouse Audit (`http://localhost:3000`) | **PASS** | Performance: 90–97, Accessibility: 100, Best Practices: 100, SEO: 100. |

---

## 2. Complete Issues Inventory (19 Distinct Findings)

| # | Severity | File / Component | Source | Problem Description | Exact Remediation |
|---|---|---|---|---|---|
| 1 | **Critical** | `package.json:27` | R, G | Next.js 16.2.7 contains critical advisories: Windows RCE (GHSA-p293-qw3h-jr36), `next/og` & Image Optimization RCE (GHSA-vcvr-r3jv-pc5j), SSRF in Server Actions (GHSA-89xv-2m56-2m9x), and App Router cache poisoning (GHSA-6gpp-xcg3-4w24). | Upgrade `next` in `package.json` to `>= 16.4.2` (`npm i next@16.4.2`), re-run build/tests, then run `npm audit fix` for transitive deps (`postcss`, `sharp`, `brace-expansion`, `uuid`). |
| 2 | **Critical** | Git History (`CLOUDINARY.txt` @ commit `54a2c14`) | R, G | A live Google Cloud / GCP API key is committed in repository history and recoverable by anyone with repository access. | 1. Immediately rotate and revoke the key in Google Cloud Console.<br>2. Purge file from history: `git filter-repo --invert-paths --path CLOUDINARY.txt` and force-push.<br>3. Add `gitleaks` to CI / pre-commit hooks and update `.gitignore`. |
| 3 | **Critical** | Environment / Local Configuration | R | Missing local runtime credentials (`FIREBASE_SERVICE_ACCOUNT`, `AUTH_SECRET`, `PIN_PEPPER`). Local server execution crashes with HTTP 500 (`Unable to detect a Project Id in the current environment`). | Create `.env.local` for local development populated from `.env.example`. *(Note: If variables are saved in Vercel Project Settings, production is protected from this crash, but local dev/CI requires `.env.local`).* |
| 4 | **High** | `src/app/api/upload/route.ts:88` | G | `/api/upload` is completely unauthenticated and lacks CSRF/origin verification (`isValidOrigin` is not called). Anyone can POST arbitrary binary payloads up to 100 MB directly into the system. | Require a verified admin session (`isAdminSession()`) or a signed one-time upload token; enforce `if (!isValidOrigin(request)) return 403;`; bind upload requests to Firebase App Check. |
| 5 | **High** | `src/app/api/upload/route.ts:141-149`, `.env.example:17-18` | R, G | Uploads use an **unsigned** Cloudinary preset (`CLOUDINARY_UPLOAD_PRESET`). Anyone with the public cloud name and preset name can upload files directly to Cloudinary, bypassing all app validation and rate limits. | Switch Cloudinary to **signed** uploads: compute SHA signature server-side using `CLOUDINARY_API_SECRET` (`api_sign_request`) and transmit signed upload parameters (`timestamp`, `signature`, `api_key`). Disable unsigned uploads in Cloudinary console. |
| 6 | **High** | `src/app/api/auth/route.ts:39-51`, `src/lib/rate-limit.ts:41` | G | 4-digit PIN (10,000 keyspace) for admin authentication is protected only by an IP-based limit (10 req/min) in an ephemeral in-memory Map with no global account lockout. Rotating IPs or distributed requests can exhaust the keyspace in hours. | Implement global/account lockout after consecutive failures; lengthen admin PIN (>= 6 digits or alphanumeric); add exponential backoff; back rate limiting with a shared distributed store (Upstash Redis / Vercel KV). |
| 7 | **High** | `next.config.mjs:3` | R, G | CSP `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`, completely disabling CSP's ability to prevent execution of injected scripts via Cross-Site Scripting (XSS). | Remove `'unsafe-eval'` and `'unsafe-inline'`. Implement per-request nonce-based CSP (`strict-dynamic`) inside Next.js 16 request proxy (`src/proxy.ts`). |
| 8 | **High** | `src/lib/firebase.ts:16-20` | R, G | Firebase App Check is completely absent across client SDK initialization and server-side route validation, leaving Firestore and backend endpoints vulnerable to direct automated traffic. | Initialize Firebase App Check in `src/lib/firebase.ts` with reCAPTCHA Enterprise (`initializeAppCheck`); enforce App Check token validation in backend API routes and Firestore security rules. |
| 9 | **Medium** | `storage.rules:6-8` | G | `storage.rules` allows unconditional public read access (`allow read: if true;`) to all files in Google Cloud Storage with no App Check or auth verification. | Restrict reads to authenticated users or verified asset paths; enforce `request.app != null`; serve private media exclusively via signed URLs. |
| 10 | **Medium** | `src/lib/rate-limit.ts:1-6` | R, G | In-memory `Map` limiter is local to a single Node.js process. In Vercel serverless environments, memory is ephemeral and not shared across lambdas or regions; limits reset on every cold start. | Replace in-memory store with a persistent distributed rate limiter (e.g., Upstash Redis `@upstash/ratelimit` or Vercel KV). |
| 11 | **Medium** | `src/lib/admin-session.ts:8` | G | `getJwtSecret()` silently falls back to `PIN_PEPPER` when `AUTH_SECRET` is unset. Reusing the static PBKDF2 salt as an HMAC-SHA256 JWT key violates cryptographic key separation; compromising the pepper compromises all admin sessions. | Require a dedicated `AUTH_SECRET`; throw an explicit error if missing; never fall back to `PIN_PEPPER`. |
| 12 | **Medium** | `src/app/api/auth/route.ts:80-98` | G | Legacy fallback reads plaintext `adminPin` from `settings/global_info` and compares it using standard equality `pin === legacyPin` (not constant-time). | Remove the legacy plaintext fallback path from the route; execute a one-time migration script and permanently delete `adminPin` from `settings/global_info`. |
| 13 | **Medium** | `src/app/api/cron/weekly-backup/route.ts:17` | R, G | `CRON_SECRET` is verified using standard string comparison `authHeader === Bearer ${process.env.CRON_SECRET}`, exposing the secret to side-channel timing analysis. | Use `crypto.timingSafeEqual` comparing equal-length Buffer representations of the authorization header and expected bearer token. |
| 14 | **Medium** | `src/lib/csrf.ts:9,29` | R, G | `isValidOrigin` returns `true` if both `Origin` and `Referer` headers are omitted (or `Host` is absent), allowing non-browser clients or stripped-header requests to bypass CSRF checks on state-changing endpoints. | For state-mutating requests (`POST`, `PUT`, `DELETE`), return `false` if origin headers are absent; compare `Origin` against a strict allowlist (`NEXT_PUBLIC_APP_URL`) rather than request `Host`. |
| 15 | **Medium** | `src/lib/logger.ts:76,78,80` | R, G | Semgrep blocking finding `unsafe-formatstring`: passing dynamic variables (`logPrefix`, `entry.message`) directly into `console.log`/`warn`/`error` allows log injection/formatting issues if format specifiers (`%s`, `%d`) are supplied. | Use literal format strings: `console.log('%s %s', logPrefix, entry.message, entry.details || '')` or structured JSON logging via `JSON.stringify()`. |
| 16 | **Medium** | Codebase-wide | R | 193 errors and 63 warnings across codebase. Synchronous `setState` in `src/lib/useAdmin.ts:37` triggers cascading renders; excessive `@typescript-eslint/no-explicit-any` disables compile-time type safety. | Refactor `useAdmin.ts` to fetch session asynchronously without synchronous `setState` in effect body; replace `any` with strict TypeScript types; remove unused variables. |
| 17 | **Low** | `src/app/api/cron/weekly-backup/route.ts:32-57` | R | Unlike the manual backup endpoint (`/api/backup`), the weekly automated cron backup does not scrub sensitive fields, writing unredacted `pinHash`, `tokenHash`, `adminPin`, and `adminEmail` into the `backups` collection. | Sanitize backup documents prior to storage: delete `pinHash`, `tokenHash`, `adminPin`, and `adminEmail` before calling `db.collection('backups').add()`. |
| 18 | **Low** | `.env.example:18` vs `src/app/api/upload/route.ts:141` | G | Environment variable naming mismatch: `.env.example` lists `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, but the server API route reads `process.env.CLOUDINARY_UPLOAD_PRESET`. If deployed using the example name, uploads fail with HTTP 500. | Standardize on `CLOUDINARY_UPLOAD_PRESET` (server-only) across `.env.example`, code, and Vercel environment variables. |
| 19 | **Low** | `src/app/layout.tsx:11` | G | `metadataBase` is not defined in root metadata. Next.js outputs a build warning and falls back to `http://localhost:3000` for relative OpenGraph / Twitter preview images (`/og-image.png`). | Set `metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000')` in root `metadata`. |

---

## 3. Ready to Deliver?

### **Verdict: NO**

### **Release Blockers (Referenced by Finding #):**
Release is blocked until the following high-severity vulnerabilities are resolved:
* **Finding #1** (Next.js core critical RCE/SSRF vulnerabilities)
* **Finding #2** (Exposed GCP API key in git commit history)
* **Finding #4** (Unauthenticated `/api/upload` endpoint)
* **Finding #5** (Unsigned Cloudinary upload preset)
* **Finding #6** (4-digit PIN brute-force exposure without account lockout)
* **Finding #7** (CSP bypass via `unsafe-inline` and `unsafe-eval`)
* **Finding #8** (Missing Firebase App Check enforcement)
* **Finding #11** (JWT signing secret fallback violating key separation)
* **Finding #12** (Plaintext PIN fallback and non-constant-time equality)

### **Deployment & Configuration Requirements:**
* **Finding #3** (Provide `.env.local` for local execution / verify Vercel environment variables for production)
* **Finding #10** (Configure distributed rate limiter for serverless environments)

### **Recommended Non-Blocking Improvements:**
* **Findings #9, #13, #14, #15, #16, #17, #18, #19** (Hardening storage rules, constant-time cron auth, strict CSRF headers, structured logging, ESLint resolution, backup scrubbing, env naming alignment, and `metadataBase` definition).

---
*Zero-repetition master report compiled from `REPORT.md` and `GLM_REPORT.md`.*
