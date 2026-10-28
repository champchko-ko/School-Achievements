# Second Re-Audit Verification — School-Achievements (grpc fix + full matrix)

**Date:** 2026-10-28 · **Base:** audited commit `609110a` (HEAD unchanged) · **Scope of this pass:** verify the fix for the last GO condition (`@grpc/grpc-js` advisory) and re-run the full matrix on the corrected dependency tree. Read-only inspection; e2e again ran locally with Firebase Admin credentials disabled.

> ## VERDICT: **GO FOR PRODUCTION — CONDITIONAL (one condition left: commit & push)**
> The `@grpc/grpc-js` fix is correct and — after a clean install — verified effective: production dependency audit now reports **0 vulnerabilities**. The fix set remains **uncommitted**, so committing and pushing is the only remaining action between this tree and a compliant production deploy.

## 1. What changed since the previous verification

- `package.json` gained `"overrides": { "@grpc/grpc-js": "^1.14.6" }` (plus the earlier `engines` and nodemailer bump). **Correct approach** — the override satisfies every dependent range; the alternative suggested by npm (`npm audit fix --force` → firebase 9) would have been a breaking downgrade.
- `package-lock.json` regenerated accordingly: hoisted `@grpc/grpc-js` entry is now **1.14.6**; `@firebase/firestore@4.17.2` unchanged.
- No other source files changed — the 17 modified files + `error.tsx`/`not-found.tsx` are byte-identical to the set verified in the first re-audit (all 1 Critical + 7 High fixes remain in place and verified).

## 2. The one defect found this round (and its resolution)

**Stale `node_modules` vs. lockfile.** The lock was regenerated without running `npm install`: the on-disk hoisted copy was still the vulnerable `@grpc/grpc-js@1.9.16` (≤1.13.5 advisory range), and `npm ls` marked the tree *invalid* (`^1.14.6` unmet). Local builds/tests were therefore still exercising the vulnerable library even though the lock was fixed.
**Resolution (performed during this verification):** `npm ci` → exit 0, tree reconciled, `@grpc/grpc-js@1.14.6` now installed and deduped across all dependents, `npm ls` clean. Note for deployment: Vercel installs from the lockfile at build time, so a deploy of the committed tree would get 1.14.6 regardless — the stale state affected only local runs. Running `npm ci` locally after any lockfile edit remains best practice (and is exactly what a CI gate would enforce mechanically).

## 3. Full matrix on the corrected tree (all executed this session)

| Check | Result |
|---|---|
| `npm ci` | **PASS** (exit 0; patch-package postinstall ran; npm's new install-scripts allowlist warnings are informational — lint/build/e2e all confirm nothing broke) |
| `npm audit --omit=dev` | **0 vulnerabilities** (was: 4 high via `@grpc/grpc-js`; nodemailer already clear) |
| `npm run lint` | **PASS** — 0 errors, 231 warnings |
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `npm test` (Vitest) | **PASS** — 86/86 (9 files) |
| `npm run build` | **PASS** — production build, 29 routes |
| `npx playwright test` | **PASS — 6/6** against the rebuilt production server (wrong-PIN test fails fast at 500 with credentials disabled; zero production contact) |

## 4. Action list (exhaustive)

1. **Commit and push the fix set** (`git add -A` on the 17 modified files + `src/app/error.tsx` + `src/app/not-found.tsx` — the three audit-report Markdown files can be committed or excluded per your preference) → then deploy. **This is the only remaining GO condition.**
2. After deploy, sanity-check once in production: `/api/auth` GET returns `{"admin":false}`, admin login works (confirms `FIREBASE_SERVICE_ACCOUNT` is present in Vercel env — the new fail-fast now makes a missing credential loud instead of silent), and the weekly cron produces a `backups` document containing `admin_achievementSecrets`.
3. Fast-follows (non-blocking, unchanged from the first re-audit): CI pipeline running `npm ci && lint && tsc && vitest && build`; backup chunking/off-site copy/cron-failure alerting; upload-sign authentication; award-map transaction; pagination + log retention; monitoring/health endpoint.

*Prior reports: [RE-AUDIT-VERIFICATION-2026-10-28.md](RE-AUDIT-VERIFICATION-2026-10-28.md) · [PRODUCTION-READINESS-AUDIT-2026-10-28.md](PRODUCTION-READINESS-AUDIT-2026-10-28.md)*
