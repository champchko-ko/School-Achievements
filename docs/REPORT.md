# Security & Release Audit Report

**Target Codebase:** School-Achievements  
**Audit Date:** 2026-10-17  
**Auditor:** Senior App Security & Release Auditor  
**Scope:** Static Analysis, Dependency Security, Secret Detection, Firebase Rules, Next.js Config, Automated Tests, Production Build, Lighthouse  

---

## 1. Audit Pipeline Summary

| Step | Check | Status | Summary |
|---|---|---|---|
| 1 | TypeScript (`tsc --noEmit`) | **PASS** | 0 type errors |
| 2 | ESLint (`eslint .`) | **FAIL** | 193 errors, 63 warnings (`no-explicit-any`, unused vars, `set-state-in-effect`) |
| 3 | Dependency Audit (`npm audit --omit=dev`) | **FAIL** | 17 vulnerabilities (1 Critical, 8 High, 7 Moderate, 1 Low) in `next`, `sharp`, `postcss` |
| 4 | Secret Detection (`gitleaks detect`) | **FAIL** | 1 leak detected: GCP API key committed in git history (`CLOUDINARY.txt`) |
| 5 | SAST (`semgrep scan --config auto`) | **FAIL** | 3 blocking findings: format string injection risk in `src/lib/logger.ts` |
| 6 | Rules & API Access Control Review | **FAIL** | Firebase App Check completely absent; no tenant isolation; timing attack in cron route |
| 7 | Next.js Config, CSP & Uploads Review | **FAIL** | CSP uses `'unsafe-inline'`/`'unsafe-eval'`; unsigned Cloudinary preset; in-memory rate limiting |
| 8 | Automated Tests (`npm test` & Playwright) | **PASS** | Vitest: 52/52 passed; Playwright E2E: 6/6 passed (auth & main navigation) |
| 9 | Production Build (`npm run build`) | **PASS** | Next.js 16.2.7 Turbopack built 26 static/dynamic routes cleanly |
| 10 | Lighthouse Audit (Desktop/Mobile) | **PASS** | Performance: 90, Accessibility: 100, Best Practices: 100, SEO: 100 |

---

## 2. Top Issues & Remediation Table

| Severity | File / Component | Problem | Exact Fix |
|---|---|---|---|
| **Critical** | `package.json` | Next.js 16.2.7 vulnerable to Critical RCE, SSRF, and cache poisoning (GHSA-6gpp-xcg3-4w24, GHSA-p293-qw3h-jr36, GHSA-89xv-2m56-2m9x). | Update `next` in `package.json` to `>= 16.4.2` and run `npm update next`. |
| **Critical** | Git History (`CLOUDINARY.txt` @ commit `54a2c14`) | Hardcoded GCP API key committed into git repository history. | 1. Immediately revoke and regenerate the compromised key in Google Cloud Console.<br>2. Run `git-filter-repo --invert-paths --path CLOUDINARY.txt` and force push to purge from history. |
| **Critical** | Environment / `.env.local` | Missing production credentials (`FIREBASE_SERVICE_ACCOUNT`, `AUTH_SECRET`, `PIN_PEPPER`). Live server logs show Firebase Admin authentication failures (HTTP 500). | Provision production environment variables in `.env.local` and Vercel dashboard according to `.env.example`. |
| **High** | `src/app/api/upload/route.ts` & `.env.example` | Uploads use unsigned Cloudinary presets (`CLOUDINARY_UPLOAD_PRESET`). Anyone with the preset name can upload unauthorized files directly. | Implement server-side signed uploads using `CLOUDINARY_API_SECRET` and Cloudinary signature API (`api_sign_request`). Disable unsigned presets in Cloudinary console. |
| **High** | `firestore.rules` & `src/lib/firebase.ts` | Firebase App Check is completely absent on client and server rules, leaving Firestore and backend endpoints unprotected against automated bot traffic. | Enable App Check in Firebase Console (reCAPTCHA Enterprise), initialize in `src/lib/firebase.ts`, and add `request.auth != null || request.app != null` in `firestore.rules`. |
| **High** | `src/app/api/cron/weekly-backup/route.ts` | Non-constant-time string comparison (`authHeader === 'Bearer ' + secret`) exposes `CRON_SECRET` to side-channel timing attacks. | Use `crypto.timingSafeEqual` with matched buffer lengths to compare `authHeader` and expected bearer token. |
| **Medium** | `next.config.mjs` | CSP `script-src` includes `'unsafe-inline'` and `'unsafe-eval'`, increasing exposure to Cross-Site Scripting (XSS). | Remove `'unsafe-eval'`; implement nonce-based script execution inside `src/proxy.ts` (Next.js request proxy). |
| **Medium** | `src/lib/rate-limit.ts` | Rate limiter relies on in-memory JavaScript `Map`. In serverless deployments (Vercel), memory is ephemeral and limits reset across function instances. | Replace in-memory store with a distributed Redis store (e.g., Upstash Redis `@upstash/ratelimit`). |
| **Medium** | Codebase (193 ESLint errors) | Lint quality gate failure: excessive `any` types, unused variables, and synchronous `setState` in `src/lib/useAdmin.ts` causing cascading renders. | Replace `any` with strict TypeScript types, remove dead variables, and wrap initial auth fetch in an async callback without direct effect state mutation. |
| **Medium** | `src/lib/logger.ts` (lines 76, 78, 80) | Format string vulnerability flagged by Semgrep (`unsafe-formatstring` in `console.error`/`warn`/`log`). | Use literal format specifiers: `console.log('%s %s', logPrefix, entry.message, entry.details || '')` or structured JSON logging. |
| **Low** | `src/lib/csrf.ts` | `isValidOrigin` allows requests through when both `origin` and `referer` headers are missing (`return true`). | Enforce strict origin validation: reject state-mutating requests (POST, PUT, DELETE) if origin headers are omitted. |
| **Low** | `src/app/api/cron/weekly-backup/route.ts` | Automated weekly backup dumps complete documents including `pinHash` and `adminPin` into `backups` collection. | Sanitize document objects before backup: strip `pinHash`, `tokenHash`, `adminPin`, and `adminEmail`. |

---

## 3. Ready to Deliver?

### **Verdict: NO**

### **Release Blockers:**
1. **Critical Next.js Vulnerabilities:** Unpatched Next.js version exposes production to remote code execution and SSRF risks.
2. **Exposed Credentials in Git History:** Compromised GCP API key must be revoked and wiped from git commit history before release.
3. **Missing Production Service Account & Secrets:** Database operations fail at runtime without configured Firebase service account credentials.
4. **Unsigned Cloudinary Uploads:** Unsigned preset allows direct storage tampering and quota exhaustion.
5. **Linting & Code Quality Gates Failing:** 193 ESLint errors and blocking SAST findings must be resolved to meet deployment standards.
