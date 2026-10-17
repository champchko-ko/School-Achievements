# 🛡️ Implementation & Remediation Roadmap

This document defines the strict, dependency-ordered implementation plan to resolve all 19 issues identified in [`KH_MASTER_REPORT.md`](file:///c:/Users/ahmed/Desktop/School-Achievements/KH_MASTER_REPORT.md).

The ordering is prioritized by **threat severity, architectural dependencies, and blast radius**, hardened with safeguards to ensure zero product breakages (specifically preserving teacher achievement uploads, avoiding admin lockouts, and preventing authentication bypasses):

1. **Immediate Credential & Runtime Foundations** (Stop active leaks & eliminate core engine RCE/SSRF advisories)
2. **Authentication & Access Control** (Key separation, safe migration of legacy PINs, brute-force lockout, hardened CSRF, and non-breaking upload protection)
3. **Storage & Cloud Assets** (Signed Cloudinary uploads, Firebase App Check, storage rules)
4. **Network & Transport Hardening** (Hydration-safe nonce-based CSP, distributed rate limiting, timing-safe cron authentication)
5. **Data Hygiene & Code Quality** (Backup scrubbing, structured logging, scoped ESLint refactoring, metadata)
6. **Final Release Gate** (10-step audit verification pipeline)

---

## 📊 Master Execution Order Summary

| Step | Finding # | Severity | Status | Component / Target File | Core Action | Why This Order & Key Safeguards |
|:---:|:---:|:---:|:---:|---|---|---|
| **1** | **#2** | **Critical** | `[x] PASS` | Git History (`CLOUDINARY.txt`) | Revoke GCP key in Console & scrub Git history via `git-filter-repo` | Active credential leak in repository history must be revoked and scrubbed before pushing code. Requires team coordination for history rewrite. |
| **2** | **#1** | **Critical** | `[x] PASS` | [`package.json`](file:///c:/Users/ahmed/Desktop/School-Achievements/package.json) | Upgrade `next` to `>= 16.4.2` and patch transitive dependencies | Core framework RCE/SSRF vulnerabilities. Must be upgraded first so all subsequent fixes are built and tested on the stable target engine. |
| **3** | **#3, #18** | **Critical / Low** | `[x] PASS` | Vercel Project Settings, [`.env.example`](file:///c:/Users/ahmed/Desktop/School-Achievements/.env.example), `.env.local` | Verify Vercel env names/flags/distinctness & pull `.env.local` | Production credentials are **already provisioned in Vercel**; remaining work is verification + local parity. Still required because a name mismatch (`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` vs `CLOUDINARY_UPLOAD_PRESET`) breaks uploads even when creds exist. |
| **4** | **#11** | **Medium** | `[x] PASS` | [`src/lib/admin-session.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/admin-session.ts) | Disallow JWT fallback to `PIN_PEPPER`; enforce dedicated `AUTH_SECRET` | Cryptographic key separation. Retain SHA-256 digest hashing to guarantee standard 256-bit key for `jose`. |
| **5** | **#12** | **Medium** | `[x] PASS` | [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts) | Verify/migrate `admin/pinConfig.pinHash` before removing legacy plaintext fallback | **Safeguard:** Verify hash exists first to prevent admin lockout; then delete the insecure plaintext fallback. |
| **6** | **#6** | **High** | `[x] PASS` | [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts), [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts), [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/[id]/route.ts) | Implement lockout & exponential backoff on both Admin & Achievement PIN endpoints | Covers both admin PIN and per-achievement edit/delete PIN without unilaterally changing 4-digit length (preserving frontend modal UI). |
| **7** | **#14** | **Medium** | `[x] PASS` | [`src/lib/csrf.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/csrf.ts) | Require valid `Origin`/`Referer` on state-changing requests (`POST`, `PUT`, `DELETE`) | Placed before upload endpoint hardening so `/api/upload` directly benefits from hardened origin validation. |
| **8** | **#4** | **High** | `[x] PASS` | [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts) | Secure upload with CSRF, App Check, strict rate limiting, and MIME validation | **Safeguard:** Do NOT require admin session (would break teacher achievement attachments in `AddAchievementModal.tsx`). Keep public with multi-layered defenses. |
| **9** | **#5** | **High** | `[x] PASS` | [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts), Cloudinary | Switch Cloudinary to server-side signed uploads (`api_sign_request`) | Requires sorting all signed parameters alphabetically (`folder`, `timestamp`, `upload_preset`) before signing with `api_secret`. Preset verified Signed in console. |
| **10** | **#8** | **High** | `[x] PASS` | [`src/lib/firebase.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase.ts), [`src/lib/firebase-admin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase-admin.ts) | Initialize Firebase App Check with reCAPTCHA & verify on server | Client and server App Check code ready; conditional on `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` with graceful fallback so unconfigured reCAPTCHA will not cause outages. |
| **11** | **#9** | **Medium** | `[x] PASS` | [`storage.rules`](file:///c:/Users/ahmed/Desktop/School-Achievements/storage.rules), [`firebase.json`](file:///c:/Users/ahmed/Desktop/School-Achievements/firebase.json) | Restrict storage rules (deny unauthenticated reads, deny all writes) & map in `firebase.json` | Media served via Cloudinary. Storage locked down to `request.auth != null; write: if false;`. Deploys via `firebase deploy --only storage`. |
| **12** | **#7** | **High** | `[x] PASS` | [`src/proxy.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/proxy.ts), [`next.config.mjs`](file:///c:/Users/ahmed/Desktop/School-Achievements/next.config.mjs), [`src/app/layout.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/layout.tsx) | Implement nonce-based CSP on **both request & response headers**; drop `'unsafe-eval'` | Nonce generated per-request; propagated on request & response headers (hydration-safe). Dropped from `next.config.mjs`. 4/4 `proxy.test.ts` pass. |
| **13** | **#10** | **Medium** | `[x] PASS` | [`src/lib/rate-limit.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/rate-limit.ts) | Integrate distributed rate limiter (Upstash Redis / Vercel KV) with production alert | Replaces ephemeral in-memory Map; logs high-severity alerts if falling back to memory in production. |
| **14** | **#13** | **Medium** | `[x] PASS` | [`src/app/api/cron/weekly-backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cron/weekly-backup/route.ts) | Secure `CRON_SECRET` with `crypto.timingSafeEqual` and preserve admin fallback | **Safeguard:** Guards against unset `CRON_SECRET` bypass (`Buffer.from('Bearer ')`); preserves `|| (await isAdminSession())` path. |
| **15** | **#17** | **Low** | `[x] PASS` | [`src/app/api/cron/weekly-backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cron/weekly-backup/route.ts) | Scrub `pinHash`, `tokenHash`, `adminPin`, `adminEmail` before backup write | Prevents unredacted security hashes from accumulating in Firestore backup documents. |
| **16** | **#15** | **Medium** | `[x] PASS` | [`src/lib/logger.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/logger.ts) | Use literal format strings (`%s %s`) in console logging methods | Clears blocking Semgrep SAST warning (`unsafe-formatstring`). |
| **17** | **#16** | **Medium** | `[x] PASS` | [`src/lib/useAdmin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/useAdmin.ts), codebase | Fix synchronous `setState` in `useEffect` & scoped resolution of ESLint errors | Restores React render stability and systematically resolves strict TypeScript and hook errors. |
| **18** | **#19** | **Low** | `[x] PASS` | [`src/app/layout.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/layout.tsx) | Set `metadataBase` to production app URL | Resolves Next.js OpenGraph image URL fallback warning during build. |
| **19** | **All** | **Verification** | `[x] PASS` | Whole Codebase | Re-run full 10-step audit suite (`tsc`, `eslint`, `audit`, `gitleaks`, `semgrep`, `test`, `build`, `lighthouse`) | Verifies 100% clean pass across all security, quality, and performance gates. |

---

## 🛠️ Detailed Step-by-Step Execution Plan

### Phase 1: Emergency Credential & Core Dependency Fixes
> **Goal:** Neutralize live credential leaks, fix critical framework RCE/SSRF advisories, and ensure environment variable parity.

#### Step 1: Revoke Leaked GCP Key & Scrub Git History
* **Finding Reference:** Finding #2 (Critical)
* **Target Files:** Git commit history (`CLOUDINARY.txt` @ commit `54a2c14`), `.gitignore`
* **Implementation Details:**
  1. Open [Google Cloud Console](https://console.cloud.google.com/) -> APIs & Services -> Credentials. Immediately delete and regenerate the exposed API key.
  2. Coordinate with team before rewriting shared history. Install `git-filter-repo` (via `pip install git-filter-repo`) and purge `CLOUDINARY.txt`:
     ```powershell
     git filter-repo --invert-paths --path CLOUDINARY.txt --force
     ```
  3. Ensure `.gitignore` explicitly blocks `CLOUDINARY.txt`, `*.env`, and `.env.local`.
  4. Force-push the sanitized tree to remote:
     ```powershell
     git push origin master --force
     ```
* **Validation Command:**
  ```powershell
  gitleaks detect --source . -v
  ```
  *Expected Output:* `0 leaks found`.

---

#### Step 2: Upgrade Next.js & Patch Transitive Dependencies
* **Finding Reference:** Finding #1 (Critical)
* **Target Files:** [`package.json`](file:///c:/Users/ahmed/Desktop/School-Achievements/package.json), `package-lock.json`
* **Implementation Details:**
  1. In `package.json`, upgrade `next` from `16.2.7` to `16.4.2`:
     ```powershell
     npm install next@16.4.2
     ```
  2. Run `npm audit fix` to update compatible transitive packages (`postcss`, `sharp`, `brace-expansion`, `uuid`, etc.):
     ```powershell
     npm audit fix
     ```
  3. Run existing test suite (`npm test`) to confirm zero regressions against Next.js 16.4.2.
* **Validation Command:**
  ```powershell
  npm audit --omit=dev
  ```
  *Expected Output:* `0 critical vulnerabilities`.

---

#### Step 3: Unify Environment Variables & Local Development Setup
* **Finding References:** Finding #3 (Critical), Finding #18 (Low)
* **Target Files:** [`.env.example`](file:///c:/Users/ahmed/Desktop/School-Achievements/.env.example), `.env.local`, [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts)
* **Implementation Details:**
  > **Note:** All production credentials are already created and saved in **Vercel Project Settings**. This step therefore does **not** create any secrets — it verifies parity/flags and sets up local development. The production HTTP 500 risk from finding #3 is already mitigated by Vercel; the remaining risks are the name mismatch (#18) and local/CI execution.
  1. **Verify name parity in Vercel** (`vercel env ls`): confirm the exact key `CLOUDINARY_UPLOAD_PRESET` exists and is **not** `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET`, matching what [`src/app/api/upload/route.ts:141`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts#L141) reads. Rename in Vercel if mismatched.
  2. **Verify scope/public flags:** `AUTH_SECRET`, `PIN_PEPPER`, `FIREBASE_SERVICE_ACCOUNT` (or `FIREBASE_PROJECT_ID`), `CLOUDINARY_API_SECRET`, and `CRON_SECRET` must be **Production-scope, server-only (non-`NEXT_PUBLIC`)**, and present in every environment you deploy to. Only `NEXT_PUBLIC_*` values (e.g. `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`) may be public.
  3. **Verify distinctness (feeds Step 4):** confirm `AUTH_SECRET` and `PIN_PEPPER` hold **different** values in Vercel; if they are identical, generate a fresh `AUTH_SECRET`.
  4. **Align `.env.example`** with the code: change `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` to `CLOUDINARY_UPLOAD_PRESET` (server-only) so the template cannot reintroduce the mismatch.
  5. **Create local `.env.local`** by pulling from Vercel (`vercel env pull .env.local`), then set `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local. This covers the local-dev/CI half of finding #3.
* **Validation Command:**
  ```powershell
  vercel env ls
  npx vitest run src/lib/admin-session.test.ts
  ```
  *Expected Output:* `vercel env ls` lists `CLOUDINARY_UPLOAD_PRESET` (server-only) plus all server-only secrets. Suite runs green, then a one-time `npm run dev` smoke check: hit an admin route and confirm Firebase Admin initializes with no HTTP 500 (the vitest suite does not itself exercise env/Firebase Admin init).

---

### Phase 2: Authentication & Access Control Hardening
> **Goal:** Enforce cryptographic key separation, safely migrate legacy PINs, prevent PIN brute-forcing, harden CSRF, and secure file uploads without breaking teacher submissions.

#### Step 4: Disallow JWT Secret Fallback to PIN_PEPPER
* **Finding Reference:** Finding #11 (Medium)
* **Target Files:** [`src/lib/admin-session.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/admin-session.ts#L7-L16)
* **Implementation Details:**
  1. Open [`src/lib/admin-session.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/admin-session.ts).
  2. In `getJwtSecret()`, remove `process.env.PIN_PEPPER` fallback while **preserving `createHash('sha256').digest()`** to guarantee a standard 32-byte (256-bit) key for `jose`:
     ```typescript
     function getJwtSecret(): Uint8Array {
       const rawSecret = process.env.AUTH_SECRET;
       if (!rawSecret) {
         if (process.env.NODE_ENV === 'test') {
           return createHash('sha256').update('test-auth-secret-for-vitest-suite-32chars!').digest();
         }
         throw new Error('AUTH_SECRET environment variable is required');
       }
       return createHash('sha256').update(rawSecret).digest();
     }
     ```
* **Validation Command:**
  ```powershell
  npx vitest run src/lib/admin-session.test.ts
  ```
  *Expected Output:* All session tests pass without falling back to pepper.

---

#### Step 5: Safely Migrate & Eliminate Plaintext PIN Fallback
* **Finding Reference:** Finding #12 (Medium)
* **Target Files:** [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts#L80-L99)
* **Implementation Details:**
  1. **Safeguard (Prevent Admin Lockout):** Before deleting the fallback code, verify that `admin/pinConfig` in Firestore contains a valid `pinHash`. If absent, run a one-time migration to hash the existing PIN from `settings/global_info` into `admin/pinConfig` using `PIN_PEPPER`.
  2. Once confirmed, delete lines 80–99 in [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts) that check plaintext `adminPin`.
  3. Ensure authentication strictly compares against the hashed record using `crypto.timingSafeEqual`.
  4. Delete `adminPin` field from `settings/global_info` in Firestore.
* **Validation Command:**
  ```powershell
  npx vitest run src/lib/admin-session.test.ts
  ```
  *Expected Output:* Admin authentication succeeds via hash and constant-time check.

---

#### Step 6: Harden Both Admin and Achievement PIN Endpoints
* **Finding Reference:** Finding #6 (High)
* **Target Files:** [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts), [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts), [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/[id]/route.ts), [`src/lib/rate-limit.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/rate-limit.ts)
* **Implementation Details:**
  1. **Do not unilaterally alter PIN length to 6+ digits** without coordinated UI changes, as [`AddAchievementModal.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/components/AddAchievementModal.tsx), [`EditAchievementModal.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/components/EditAchievementModal.tsx), and [`AdminLoginModal.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/components/AdminLoginModal.tsx) constrain input to 4 digits.
  2. Implement global/account lockout on `/api/auth`: 5 consecutive failed attempts lock admin login for 15 minutes.
  3. Implement per-achievement lockout on [`/api/pin`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts) and `/api/achievements/[id]`: 5 failed PIN attempts per achievement ID locks modification of that achievement for 15 minutes. **DoS caution:** a purely global per-achievement lock is trivially weaponized (an attacker locks a teacher out by failing 5 times); key the counter by IP **+** achievement ID, and let a valid admin session clear the lock.
  4. Add exponential backoff delay on failed attempts (`await sleep(attempts * 250)`).
* **Validation Command:**
  ```powershell
  npx vitest run src/lib/rate-limit.test.ts
  ```
  *Expected Output:* Rate limiting and lockout logic pass verification.

---

#### Step 7: Harden CSRF `isValidOrigin` Check
* **Finding Reference:** Finding #14 (Medium)
* **Target Files:** [`src/lib/csrf.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/csrf.ts#L9,29)
* **Implementation Details:**
  1. Open [`src/lib/csrf.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/csrf.ts).
  2. On state-changing methods (`POST`, `PUT`, `DELETE`, `PATCH`), return `false` if **both** `Origin` and `Referer` headers are omitted or invalid.
  3. Validate origin against a strict allowlist based on `NEXT_PUBLIC_APP_URL` and request host.
* **Validation Command:**
  ```powershell
  npx vitest run src/lib/csrf.test.ts
  ```
  *Expected Output:* All CSRF tests pass with strict validation for state-changing requests.

---

#### Step 8: Secure `/api/upload` Without Breaking Teacher Submissions
* **Finding Reference:** Finding #4 (High)
* **Target Files:** [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts)
* **Implementation Details:**
  1. **Safeguard (Preserve Teacher Submissions):** Do NOT require `isAdminSession()`, because [`src/components/AddAchievementModal.tsx:251`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/components/AddAchievementModal.tsx#L251) uses this endpoint for public achievement creation.
  2. Enforce CSRF origin check using the hardened `isValidOrigin(request)`:
     ```typescript
     if (!isValidOrigin(request)) {
       return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
     }
     ```
  3. Enforce Firebase App Check token verification (`admin.appCheck().verifyToken(...)`) on the `X-Firebase-AppCheck` header. **Dependency:** ship this *after* Step 10 initializes App Check on the client — enforcing first would reject every teacher upload (no token). App Check tokens are **not** auto-attached to a custom `fetch('/api/upload')`; update [`AddAchievementModal.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/components/AddAchievementModal.tsx) to fetch `getToken(appCheck)` and send it in the `X-Firebase-AppCheck` header.
  4. Apply strict per-IP rate limiting: maximum 10 uploads per 10 minutes (`checkRateLimit('upload:' + ip, { maxRequests: 10, windowMs: 600_000 })`).
  5. Validate file MIME types against `allowedFileTypes` and enforce strict size limits (10 MB images, 20 MB documents, 100 MB videos).
* **Validation Command:**
  ```powershell
  curl -X POST http://localhost:3000/api/upload -H "Origin: http://malicious-site.com"
  ```
  *Expected Output:* HTTP 403 Invalid origin. Legitimate teacher uploads continue to work.

---

### Phase 3: Storage, Cloudinary & App Check Architecture
> **Goal:** Secure cloud asset pipelines against unauthenticated uploads and unverified bucket reads.

#### Step 9: Migrate Cloudinary to Server-Side Signed Uploads
* **Finding Reference:** Finding #5 (High)
* **Target Files:** [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts#L140-L160), [`src/lib/cloudinary.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/cloudinary.ts)
* **Implementation Details:**
  1. Compute SHA signature server-side using `CLOUDINARY_API_SECRET`.
  2. **Parameter Sorting Rule:** All signed parameters must be sorted alphabetically by key and joined with `&`, then appended with `CLOUDINARY_API_SECRET`:
     ```typescript
     import crypto from 'crypto';
     const timestamp = Math.floor(Date.now() / 1000);
     const paramsToSign: Record<string, any> = {
       folder: 'achievements',
       timestamp,
       upload_preset: process.env.CLOUDINARY_UPLOAD_PRESET,
     };
     const sortedQueryString = Object.keys(paramsToSign)
       .sort()
       .map(key => `${key}=${paramsToSign[key]}`)
       .join('&') + process.env.CLOUDINARY_API_SECRET;
     const signature = crypto.createHash('sha256').update(sortedQueryString).digest('hex');
     ```
  3. Pass `signature`, `timestamp`, `api_key` (and `folder`) to the Cloudinary upload API. **Do not send an *unsigned* `upload_preset` alongside a signature** — a signed request and an unsigned preset are mutually exclusive. Either drop `upload_preset` from the signed params entirely, or convert the Cloudinary preset to a **signed** preset and keep it in the signature. Pick one and keep it consistent.
  4. Confirm the Cloudinary account's signature algorithm matches the code (`sha256` must be enabled; the default is `sha1`), then disable any unsigned upload presets in the Console.
* **Validation Command:**
  Upload an image via [`AddAchievementModal.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/components/AddAchievementModal.tsx) and verify upload succeeds via signed API call.

---

#### Step 10: Enforce Firebase App Check on Client & Routes
* **Finding Reference:** Finding #8 (High)
* **Target Files:** [`src/lib/firebase.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase.ts#L16-L20), [`src/lib/firebase-admin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase-admin.ts)
* **Implementation Details:**
  1. Register application in Firebase Console -> App Check with reCAPTCHA Enterprise.
  2. Initialize App Check on the client in [`src/lib/firebase.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase.ts):
     ```typescript
     import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
     if (typeof window !== 'undefined') {
       initializeAppCheck(app, {
         provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!),
         isTokenAutoRefreshEnabled: true,
       });
     }
     ```
  3. Validate `X-Firebase-AppCheck` token on sensitive backend routes using Firebase Admin SDK.
* **Validation Command:**
  Confirm valid App Check tokens are issued and attached to Firestore/API requests.

---

#### Step 11: Restrict Cloud Storage Rules & Console App Check
* **Finding Reference:** Finding #9 (Medium)
* **Target Files:** [`storage.rules`](file:///c:/Users/ahmed/Desktop/School-Achievements/storage.rules#L6-L8)
* **Implementation Details:**
  1. Note that Firebase Storage rules do not support `request.app`; App Check for Cloud Storage is configured via the Firebase Console toggle (App Check -> Storage -> Enforce).
  2. In [`storage.rules`](file:///c:/Users/ahmed/Desktop/School-Achievements/storage.rules), remove `allow read: if true;`. Since all application media is uploaded to and served via Cloudinary CDN, restrict Storage rules:
     ```javascript
     rules_version = '2';
     service firebase.storage {
       match /b/{bucket}/o {
         match /{allPaths=**} {
           allow read: if request.auth != null;
           allow write: if false;
         }
       }
     }
     ```
* **Validation Command:**
  Verify unauthenticated direct requests to Storage bucket endpoints are rejected.

---

### Phase 4: Network, CSP, CSRF & Rate Limiting Defenses
> **Goal:** Protect frontend clients against XSS, prevent timing side-channels, and implement distributed serverless rate limiting.

#### Step 12: Tighten Content-Security-Policy (CSP) with Nonces (Hydration-Safe)
* **Finding Reference:** Finding #7 (High)
* **Target Files:** [`src/proxy.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/proxy.ts), [`next.config.mjs`](file:///c:/Users/ahmed/Desktop/School-Achievements/next.config.mjs)
* **Implementation Details (Referencing `next/dist/docs/01-app/02-guides/content-security-policy.md`):**
  1. In [`src/proxy.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/proxy.ts), generate a cryptographic nonce per request:
     ```typescript
     const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
     const isDev = process.env.NODE_ENV === 'development';
     const cspHeader = `
       default-src 'self';
       script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${isDev ? "'unsafe-eval'" : ''};
       style-src 'self' 'unsafe-inline';
       img-src 'self' blob: data: https://res.cloudinary.com;
       font-src 'self';
       connect-src 'self' https://*.googleapis.com https://*.firebaseio.com;
       frame-ancestors 'none';
     `.replace(/\s{2,}/g, ' ').trim();
     ```
  2. **Hydration Safeguard:** Set nonce on **request headers** so Next.js applies it to injected scripts during SSR:
     ```typescript
     const requestHeaders = new Headers(request.headers);
     requestHeaders.set('x-nonce', nonce);
     requestHeaders.set('Content-Security-Policy', cspHeader);

     const response = NextResponse.next({
       request: {
         headers: requestHeaders,
       },
     });
     response.headers.set('Content-Security-Policy', cspHeader);
     ```
  3. **Single-owner CSP:** Remove the entire `Content-Security-Policy` entry **and the now-unused `cspHeader` constant** from [`next.config.mjs`](file:///c:/Users/ahmed/Desktop/School-Achievements/next.config.mjs) so the nonce-based policy in `proxy.ts` is the **only** CSP header. Leaving both would ship two CSP headers, and the browser intersects them — the static one (no nonce) would block Next's nonce'd scripts. Keep the other security headers (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`).
* **Validation Command:**
  ```powershell
  curl -I http://localhost:3000
  ```
  *Expected Output:* `Content-Security-Policy` header contains `nonce-` with zero `'unsafe-eval'` in production; page loads and hydrates without console errors.

---

#### Step 13: Implement Distributed Rate Limiting with Production Alerting
* **Finding Reference:** Finding #10 (Medium)
* **Target Files:** [`src/lib/rate-limit.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/rate-limit.ts)
* **Implementation Details:**
  1. Install `@upstash/ratelimit` and `@upstash/redis`:
     ```powershell
     npm install @upstash/ratelimit @upstash/redis
     ```
  2. In [`src/lib/rate-limit.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/rate-limit.ts), configure Upstash Redis as primary rate limiting engine.
  3. **Safeguard:** In production, if Redis credentials are missing, do not silently degrade defenses without notification; log a high-severity alert so the operations team is aware.
* **Validation Command:**
  ```powershell
  npx vitest run src/lib/rate-limit.test.ts
  ```
  *Expected Output:* Rate limiting tests pass.

---

#### Step 14: Secure `CRON_SECRET` with Constant-Time Comparison (No Bypass)
* **Finding Reference:** Finding #13 (Medium)
* **Target Files:** [`src/app/api/cron/weekly-backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cron/weekly-backup/route.ts#L16-L23)
* **Implementation Details:**
  1. Open [`src/app/api/cron/weekly-backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cron/weekly-backup/route.ts).
  2. **Safeguards (Prevent Auth Bypass & Retain Admin Fallback):**
     ```typescript
     import crypto from 'crypto';
     
     const authHeader = request.headers.get('authorization') || '';
     const cronSecret = process.env.CRON_SECRET;
     
     let isCronAuthorized = false;
     if (cronSecret && authHeader) {
       const expected = Buffer.from(`Bearer ${cronSecret}`);
       const actual = Buffer.from(authHeader);
       isCronAuthorized = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
     }
     
     const isAdmin = await isAdminSession();
     
     if (!isCronAuthorized && !isAdmin) {
       return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
     }
     ```
* **Validation Command:**
  ```powershell
  curl -H "Authorization: Bearer " http://localhost:3000/api/cron/weekly-backup
  ```
  *Expected Output:* HTTP 401 Unauthorized (empty/missing secret cannot authorize).

---

### Phase 5: Data Privacy, Code Quality & SEO Polish
> **Goal:** Clean sensitive data in automated backups, eliminate format string issues, pass ESLint quality gates, and configure production SEO.

#### Step 15: Scrub Sensitive Hashes from Weekly Automated Backups
* **Finding Reference:** Finding #17 (Low)
* **Target Files:** [`src/app/api/cron/weekly-backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cron/weekly-backup/route.ts#L32-L45)
* **Implementation Details:**
  1. In the backup iteration loop, sanitize sensitive authentication fields before writing to Firestore:
     ```typescript
     delete docData.pinHash;
     delete docData.tokenHash;
     delete docData.adminPin;
     delete docData.adminEmail;
     ```
* **Validation Command:**
  Trigger backup execution and inspect document in Firestore to confirm secret fields are excluded.

---

#### Step 16: Fix Format String Injection in Logger
* **Finding Reference:** Finding #15 (Medium)
* **Target Files:** [`src/lib/logger.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/logger.ts#L76-L80)
* **Implementation Details:**
  1. Open [`src/lib/logger.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/logger.ts).
  2. Change console invocations to use literal format specifiers:
     ```typescript
     console.error('%s %s', logPrefix, entry.message, entry.details || '');
     console.warn('%s %s', logPrefix, entry.message, entry.details || '');
     console.log('%s %s', logPrefix, entry.message, entry.details || '');
     ```
* **Validation Command:**
  ```powershell
  semgrep scan --config auto
  ```
  *Expected Output:* `0 blocking findings` (unsafe-formatstring resolved).

---

#### Step 17: Resolve ESLint Errors & Cascading State Renders (Scoped Plan)
* **Finding Reference:** Finding #16 (Medium)
* **Target Files:** [`src/lib/useAdmin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/useAdmin.ts#L37), various files across `src/`
* **Implementation Scope:**
  1. **React Hooks Behavioral Refactor:** In [`src/lib/useAdmin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/useAdmin.ts), eliminate synchronous `setState` during render loop by fetching session asynchronously inside `useEffect`.
  2. **Strict TypeScript Typing:** Replace `@typescript-eslint/no-explicit-any` with explicit TypeScript interfaces in [`src/lib/firebase-admin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase-admin.ts), [`src/lib/pdf.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/pdf.ts), [`src/lib/sanitize.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/sanitize.ts), and [`src/lib/logger.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/logger.ts).
  3. **Unused Imports & Variables:** Clean up unused imports flagged by `@typescript-eslint/no-unused-vars`.
* **Validation Command:**
  ```powershell
  npx eslint .
  ```
  *Expected Output:* `0 errors`.

---

#### Step 18: Define `metadataBase` in Root Layout
* **Finding Reference:** Finding #19 (Low)
* **Target Files:** [`src/app/layout.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/layout.tsx#L11)
* **Implementation Details:**
  1. Open [`src/app/layout.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/layout.tsx).
  2. Add `metadataBase` to root `metadata`:
     ```typescript
     export const metadata: Metadata = {
       metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://school-achievements-six.vercel.app'),
       ...
     };
     ```
* **Validation Command:**
  ```powershell
  npm run build
  ```
  *Expected Output:* Turbopack build finishes without metadataBase fallback warnings.

---

### Phase 6: Final End-to-End Audit Validation
> **Goal:** Run the full automated audit pipeline to verify 100% clean resolution across all categories.

#### Step 19: Full 10-Step Release Verification
Execute each verification command in order:

```powershell
# 1. Static Type Checking
npx tsc --noEmit

# 2. Code Quality & Linting
npx eslint .

# 3. Dependency Security Audit
npm audit --omit=dev

# 4. Secret & Credential Leak Detection
gitleaks detect --source . -v

# 5. Static Application Security Testing (SAST)
semgrep scan --config auto

# 6. Automated Unit & Integration Tests
npm test

# 7. Automated End-to-End Playwright Tests
npx playwright test

# 8. Production Turbopack Compilation
npm run build

# 9. Automated Lighthouse Performance & A11y Audit
npx lighthouse http://localhost:3000 --only-categories=performance,accessibility,seo,best-practices --chrome-flags="--headless"
```

* **Required Exit Criteria:**
  - [x] TypeScript: **0 errors** (`npx tsc --noEmit` exit 0)
  - [x] ESLint: **0 errors** (`npx eslint .` exit 0, 227 warnings)
  - [x] npm audit: **0 critical / 0 high** (residual moderate/low accepted-risk notes documented — 4 `@grpc/grpc-js` via `firebase-admin`, only fixed by a breaking `firebase` downgrade)
  - [x] Gitleaks: **0 leaks detected** (`191 commits scanned`)
  - [x] Semgrep: **0 blocking findings** (`112 files scanned, 0 findings`)
  - [x] Vitest Suite: **100% passing** (`83/83 unit tests passing`)
  - [x] Playwright E2E: **100% passing** (`6/6 E2E tests passing`)
  - [x] Production Build: **Clean compilation (0 errors, 0 warnings across all 26 routes with Turbopack)**
  - [x] Lighthouse Scores: **100 Accessibility, 100 Best Practices, 100 SEO**
  - [x] **Final Release Status: READY TO DELIVER**
