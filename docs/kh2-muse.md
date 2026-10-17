# Final Codebase-Only Inspection — `MASTER_AUDIT_REPORT.md` Verdict (`kh2-muse.md`)

**Role:** Senior security review. **Scope:** active codebase ONLY. No prior report was trusted; every MASTER claim was re-checked at its cited file:line.
**Date:** 2026-10-16. **Mode:** read-only — no source file was changed; only this report was created.
**Tree:** HEAD `3b3121a`, `git status` shows 12 modified tracked files (uncommitted) + 7 untracked `*.md` — consistent with MASTER's "working-tree patched" premise.

## 1. Final verdict on MASTER (24 issues + 4 false claims)

**Result: MASTER is correct on all 24 issues and all 4 false-claim rejections.** Statuses (Patched / Partial / UNFIXED) all reproduce on disk. Three severity adjustments and two new low-severity gaps below; none overturn any MASTER verdict.

| MASTER ID | Codebase evidence (fresh read) | Verdict | Status | Severity note |
|---|---|---|---|---|
| AUTH-01 hardcoded JWT fallback | `src/lib/admin-session.ts:8-11` fallback literal present; JWT `SignJWT/jwtVerify` `:45-51` present; `src/proxy.ts:15` verifies | CONFIRM | Partial (as MASTER says) | CRITICAL — keep |
| AUTH-02 cookie 8h vs JWT 30m | `admin-session.ts:6` `8*60*60` vs `:50` `'30m'`; cookie `maxAge` `:63` | CONFIRM bug | UNFIXED | **DOWNGRADE to LOW** — JWT expiry is server-enforced, so no privilege extension; impact is dead-cookie UX/redirect only |
| AUTH-03 useAdmin fail-open | `src/lib/useAdmin.ts:27-28` `localStorage.getItem('isAdmin')` in catch | CONFIRM | UNFIXED | HIGH (UI) — keep; server APIs still gate, so blast radius is UI spoof only |
| AUTH-04 `===` compare | `pin/reset/confirm/route.ts:40-42`, `auth/route.ts:56`, `pin/route.ts:105` all `===` | CONFIRM pattern | UNFIXED | **DOWNGRADE to LOW** — real hardening item, but no practical timing signal over HTTP against hex digests; one-line fix |
| AUTH-05 PBKDF2 10k | `auth/route.ts:13`, `[id]/route.ts:23`, `pin/route.ts:19` all `pbkdf2Sync(...,10000,...,sha512)` | CONFIRM | UNFIXED | HIGH — keep (compounds with DATA-01) |
| AUTH-06 reset host fallback | `pin/reset/route.ts:59` `NEXT_PUBLIC_APP_URL \|\| origin \|\| localhost`; no CSRF check in file | CONFIRM | Partial (as MASTER says) | HIGH — keep |
| AUTH-07 single-slot token | `pin/reset/route.ts:50` static `doc(db,"admin","pinReset")` | CONFIRM | UNFIXED | LOW — keep |
| AC-01 mass assignment | `[id]/route.ts:75-87` whitelist `['title','desc','department','teacherName','attachmentUrls','date']`, strips `pinHash` for admin | CONFIRM fix | Patched in tree | CRITICAL (residual: none) |
| AC-02 rollback purge | `cleanup/route.ts:43-52` rollback **before** `isAdminSession()` at `:54-57`; filter is only `includes('cloudinary.com')` | CONFIRM | UNFIXED | CRITICAL — keep; highest immediate priority |
| DATA-01 public reads | `firestore.rules:7,13` `allow read: if true`; `page.tsx:90-94` fetch-all + client filter; `achievements/route.ts:102` `pinHash` in public doc | CONFIRM | UNFIXED | CRITICAL — keep |
| INJ-01 formula injection | write path fixed (sanitized `sTitle/sDesc` written); `full-record/page.tsx:219-232` maps stored rows straight to `json_to_sheet` | CONFIRM | Partial (as MASTER says) | HIGH — keep |
| INJ-02 `includes(host)` CSRF | `achievements/route.ts:33`, `settings/route.ts:44`, `pin/route.ts:32` all `.includes(host)` | CONFIRM | UNFIXED | HIGH — keep |
| INJ-03 MIME spoof | `upload/route.ts:55` `ALLOWED_MIME_TYPES.includes(file.type)` only; `file.type` is client header | CONFIRM | UNFIXED | Agree with MASTER's **MEDIUM** (Cloudinary cross-origin hosting limits session theft) |
| INJ-04 JSON-LD breakout | `page.tsx:133-136` `JSON.stringify(jsonLd)` unescaped, `schoolName` from Firestore | CONFIRM | UNFIXED | Agree **MEDIUM** (requires privileged settings write; defense-in-depth) |
| INJ-05 ID validation | `[id]/route.ts:29,38,120,125` raw `id` into `doc()`; agree with MASTER: Firestore throws `InvalidArgument`, no `..` escape | CONFIRM as robustness bug | UNFIXED | MEDIUM — keep MASTER framing, reject "traversal" label |
| INJ-06 arbitrary hosts | `sanitize.ts:60-62` any `http(s)://` | CONFIRM | UNFIXED | HIGH — keep |
| DOS-01 no PIN limiter | `[id]/route.ts:28-167` no `checkRateLimit` import/call; `pin/route.ts:79-84` IP-only 30/min | CONFIRM | UNFIXED | HIGH — keep |
| DOS-02 in-memory + XFF | `rate-limit.ts:6` `Map`; callers key on raw `x-forwarded-for` (`achievements:43`, `upload:37`, `auth:28`, `pin/reset:16`) | CONFIRM | UNFIXED | MEDIUM — keep |
| LOGIC-01 raw extension | `cloudinary.ts:52` `raw ? rawPublicId : strip` | CONFIRM fix | Patched in tree | HIGH (residual: none) |
| LOGIC-02 best-effort orphans | `[id]/route.ts:97-103,150-156` `allSettled` + `console.error`, proceeds | CONFIRM | UNFIXED | LOW — keep |
| LOGIC-03 backup merge | `backup/route.ts:64` `.set(docData,{merge:true})`, no delete path | CONFIRM | UNFIXED | MEDIUM — keep |
| UI-01 effect deps | `admin/page.tsx:89` now `[isAdmin, adminLoading, router]` | CONFIRM fix | Patched in tree | MEDIUM (residual: none) |
| LOG-01 logger drops | `logger.ts:29-31` 5s interval; `:71-73` unawaited `flushBuffer()`; `:51-55` exit handlers can't flush on freeze | CONFIRM | UNFIXED | MEDIUM — keep |
| SEC-01 CSP + xlsx CDN | `next.config.mjs:1-15` no CSP; `package.json:31` `cdn.sheetjs.com` tarball | CONFIRM | UNFIXED | MEDIUM — keep |
| FALSE-01 proxy rename | `proxy.ts:12` `export async function proxy`, Next 16.2.7 | REJECTED (agree) | N/A | — |
| FALSE-02 restore deletes | `backup/route.ts:59-68` set-only, no delete | REJECTED (agree) | N/A | — |
| FALSE-03 DELETE /api/upload | `upload/route.ts` exports only `POST`; real hole is cleanup rollback (AC-02) | REJECTED (agree) | N/A | — |
| FALSE-04 `..` traversal | Admin SDK `doc(db,...join('/'))` + Firestore rejects malformed IDs with error, no collection escape | REJECTED (agree) | N/A | — |

MASTER's count ("5 patched incl. partial portions / 2 partial / 17 unfixed") is arithmetically consistent when AUTH-01 and INJ-01 write-paths are counted as partial — accepted.

## 2. Gaps MASTER missed (final sweep — all verified in code)

1. **[G-1] Maintenance gate bypassable by client-set cookie — LOW.** `proxy.ts:20` treats `maintenance_bypass === '1'` as valid. Any client can send `Cookie: maintenance_bypass=1` manually (the `httpOnly` flag on `:32-37` only blocks JS, not header injection), skipping maintenance mode entirely. Fix: sign the bypass cookie (HMAC) or keep server-side allowlist.
2. **[G-2] Admin page guard uses exact match — LOW (defense-in-depth).** `proxy.ts:47-48` `adminRoutes.includes(pathname)` misses `/admin/`, `/settings/`, and any future nested page (`/admin/logs`, `/reports/x`). API routes self-gate (verified: `status/score/award/logs/backup/cron` all call `isAdminSession()`; cron additionally checks `CRON_SECRET`), so impact is page-level only. Fix: `adminRoutes.some(r => pathname === r || pathname.startsWith(r + '/'))`.
3. **[G-3 — checked, NO issue] API exclusion from proxy is safe.** `proxy.ts:65` matcher skips `/api/*`, but every sensitive API re-verifies server-side (see G-2 list). Closed, no action.
4. **[G-4 — checked, CORRECT pattern] Cron fail-closed.** `cron/weekly-backup/route.ts:16-18` `(CRON_SECRET && bearer === ...) || isAdminSession()` — empty secret falls through to admin check, not open. Keep as reference implementation.
5. **[G-5] Short-secret key stretching — LOW (hardening).** `admin-session.ts:10` `padEnd(32,'!')` means an 8-char pepper yields a mostly-predictable 32-byte HS256 key. Fix alongside AUTH-01: require `rawSecret.length >= 32`, throw otherwise.
6. **[G-6] Rules don't cover future subcollections — INFO.** `firestore.rules:18-20` `match /admin/{docId}` matches only top-level docs; the proposed `admin/pinResets/tokens/{hash}` remediation would fall to default-deny (`:23-25`, currently safe) — whoever implements AUTH-07 must add an explicit subcollection deny.
7. **[G-7] Backup includes `admin` secrets — LOW.** `backup/route.ts:10` + `cron:9` export `admin` (contains `pinHash`) into downloadable JSON. Admin-only endpoint, but theft of one backup file = offline crack material (compounds AUTH-05). Fix: exclude `pinHash`/tokens from the `download` action (keep them only in server-side `backups` collection copies or encrypt).

## 3. Final fix order (last inspection — endorsed with two moves)

1. AC-02 rollback behind `isAdminSession()` (or signed rollback token).
2. AUTH-01 remove fallback + enforce ≥32-char secret (covers G-5).
3. DATA-01 rules to approved-only + move `pinHash`/`adminEmail` server-side (covers G-6 prospectively; exclude secrets from download per G-7).
4. AUTH-03 fail closed; AUTH-02 align `maxAge` to 1800; G-1 sign maintenance bypass; G-2 `startsWith` guard.
5. DOS-01 per-ID 5-fail/15-min lockout; DOS-02 leftmost-IP parse (+ Redis later).
6. AUTH-05 iterations ≥600k + random salts; AUTH-04 `timingSafeEqual` (low cost, do with AUTH-05).
7. INJ-02 exact-host compare; INJ-06 Cloudinary-prefix allowlist; AUTH-06 env-only base URL.
8. INJ-01 export sanitize; INJ-04 `\u003c` escape; INJ-03 magic-byte check; INJ-05 ID regex.
9. LOG-01 console + awaited flush; AUTH-07 per-hash token docs; LOGIC-02 pending-deletion queue; LOGIC-03 restore dry-run; SEC-01 CSP + vendored `xlsx`.

**Closing statement:** this is the last inspection. MASTER stands as the definitive reference subject only to the severity tweaks (AUTH-02→LOW, AUTH-04→LOW) and gaps G-1–G-7 above. The residual CRITICAL set is exactly three: **AC-02, AUTH-01 (fallback), DATA-01** — everything else is HIGH or below. No further audit is needed before remediation; re-audit only after the Stage 1–3 fixes land.
