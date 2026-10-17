# GLM_REPORT — Security & Release Audit

Target: School-Achievements (Next.js 16.2.7, React 19, Firebase, Cloudinary)
Scope: read-only audit. No code changed. Secrets are never printed.

## Step results

| # | Step | Result |
|---|------|--------|
| 1 | `npx tsc --noEmit` | PASS — 0 type errors |
| 2 | `npx eslint .` | FAIL — 257 problems (193 errors, 64 warnings) |
| 3 | `npm audit --omit=dev` | FAIL — 17 vulns (1 critical, 8 high, 7 moderate, 1 low) |
| 4 | `gitleaks detect --source . -v` | FAIL — 1 secret in git history (`CLOUDINARY.txt`, commit `54a2c14`) |
| 5 | `semgrep scan --config auto` | FAIL — 3 blocking `unsafe-formatstring` in `src/lib/logger.ts` |
| 6 | Rules + API route review | FAIL — App Check absent; unauthenticated upload; weak CSRF |
| 7 | next.config / env / Cloudinary / CORS / rate limit | FAIL — CSP `unsafe-inline`+`unsafe-eval`; unsigned Cloudinary preset |
| 8 | `npm test` + `npx playwright test` | PASS — vitest 52/52, playwright 6/6 |
| 9 | `npm run build` | PASS — 26 routes compiled |
| 10 | `npx lighthouse http://localhost:3000` | PASS — Perf 97, A11y 100, SEO 100, Best-Practices 100 |

## Top issues by severity

| Sev | File | Problem | Exact fix |
|-----|------|---------|-----------|
| Critical | git history (`CLOUDINARY.txt`, commit `54a2c14`) | A live Google/GCP API key (value redacted) is committed and recoverable from history. | Rotate/revoke the key in Google Cloud Console. Purge history with `git filter-repo --path CLOUDINARY.txt --invert-paths` (or BFG) then force-push. Add `gitleaks` to CI + pre-commit and extend `.gitignore`. |
| Critical | `package.json` (`next@16.2.7`) | Next.js version carries critical advisories (RCE on Windows, RCE in Image Optimization/`next/og`, SSRF, cache poisoning). | `npm i next@16.4.2` and re-run build/tests. Then `npm audit fix` for `postcss`, `sharp`, `brace-expansion`, `uuid`, `dompurify`, `source-map-js`, `@grpc/grpc-js`. |
| High | `src/app/api/upload/route.ts:88` | `/api/upload` is fully unauthenticated and has no CSRF/origin check — anyone can proxy arbitrary files into the Cloudinary account (cost/abuse/SSRF-ish). | Require admin session or a signed one-time upload token; add `isValidOrigin(request)` and enforce App Check. |
| High | `src/app/api/upload/route.ts:141-149`, `.env.example:17-18` | Uploads use an **unsigned** Cloudinary preset; cloud name/preset are public, so anyone can upload directly, bypassing all app validation and rate limits. | Switch to **signed** uploads: generate `timestamp`+`signature` server-side with `CLOUDINARY_API_SECRET`, or use a signed upload preset. Do not expose the preset as `NEXT_PUBLIC_*`. |
| High | `src/lib/firebase.ts:16-20` | Firebase App Check is not initialized/enforced anywhere (client Firestore/Storage reachable with the public config). | Add `initializeAppCheck(app,{provider: new ReCaptchaV3Provider(siteKey),isTokenAutoRefreshEnabled:true})` and enable App Check enforcement for Firestore + Storage in the Firebase Console. |
| High | `next.config.mjs:3` | CSP `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`, negating XSS protection. | Use a nonce-based CSP set in `src/proxy.ts` (per-request nonce + `strict-dynamic`) and drop `unsafe-eval`/`unsafe-inline`. |
| High | `src/app/api/auth/route.ts:15-27`, `src/lib/rate-limit.ts:41` | 4-digit PIN (10,000 combos) for admin and achievements, protected only by per-instance in-memory limits — brute-forceable. | Lengthen PIN (>=6) or add exponential backoff + global account lockout; move limits to a shared store (Upstash Redis/Vercel KV). |
| Medium | `src/lib/csrf.ts:9,29` | `isValidOrigin` returns `true` when `Origin` **and** `Referer` are both missing (and when `Host` is missing), so CSRF is bypassable by omitting headers. | For state-changing methods return `false` when both headers are absent; compare `Origin` against a configured `NEXT_PUBLIC_APP_URL` allow-list, not the request `Host`. |
| Medium | `src/app/api/cron/weekly-backup/route.ts:17` | `CRON_SECRET` compared with `===` (non-constant-time). | Use `crypto.timingSafeEqual` on equal-length buffers. |
| Medium | `src/lib/rate-limit.ts:1-6` | In-memory limiter is per serverless instance; limits multiply per cold start/region. | Replace with distributed rate limiting (Upstash Redis / Vercel KV). |
| Medium | `src/lib/admin-session.ts:8` | JWT signing secret silently falls back to `PIN_PEPPER` (key reuse). | Require a dedicated `AUTH_SECRET`; throw if absent; never derive from `PIN_PEPPER`. |
| Medium | `src/app/api/auth/route.ts:80-98` | Legacy plaintext `adminPin` fallback compared with `===` and plaintext read from `settings`. | Remove the plaintext path; ship a one-time migration and delete `settings.adminPin`. |
| Medium | `storage.rules:6-8` | Firebase Storage allows public read of all objects with no App Check. | Restrict reads to needed paths or enforce App Check; serve media via Cloudinary signed URLs only. |
| Medium | `src/lib/logger.ts:76,78,80` | Semgrep blocking `unsafe-formatstring`: user-controlled `message` concat in `console.*`. | Log a constant prefix with args: `console.error(logPrefix, entry.message, entry.details ?? '')` is already close — pass `details` as an object (as in the public API) and avoid format-specifier interpolation of `message`. |
| Low | `.env.example:18` vs `upload/route.ts:141` | Env-name mismatch (`NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` vs `CLOUDINARY_UPLOAD_PRESET`). | Align on one name (`CLOUDINARY_UPLOAD_PRESET`, server-only). |
| Low | `next.config.mjs` / app metadata | `metadataBase` unset (build warning); SEO image URLs fall back to localhost. | Set `metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL)`. |

## Ready to deliver? — **No**

Blockers (must fix before release):

1. **Rotate/revoke the leaked API key and purge it from git history** (step 4).
2. **Upgrade Next.js to 16.4.2+** to clear the critical RCE/SSRF advisories (step 3).
3. **Authenticate + sign the upload path**: require session/origin check and switch Cloudinary to signed uploads (steps 6-7).
4. **Enable and enforce Firebase App Check** (step 6).
5. **Harden the admin auth surface**: remove the unsafe CSP directives, remove the plaintext PIN fallback, and make rate limiting shared with stronger PIN/backoff (steps 6-7).

Non-blocking but recommended: clear semgrep blockers, resolve ESLint errors, align env names. Functional quality is good: type-check, unit tests (52/52), e2e (6/6), production build, and Lighthouse (97/100/100/100) all pass.
