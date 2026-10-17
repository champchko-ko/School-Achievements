# Independent Audit: `KH_INSPECTION_REPORT.md` vs Active Codebase (`kh-muse.md`)

**Date:** 2026-10-16
**Auditor:** Muse Spark (read-only, no files changed except this report)
**Inputs:** `kh.md` (task spec, 107 lines), `KH_INSPECTION_REPORT.md` (543 lines, Antigravity)
**Method:** Re-read every cited file at the cited lines; `git status` checked to validate "patched in working tree" claims. No code edits made.

## 1. Overall verdict

`KH_INSPECTION_REPORT.md` is **accurate in direction on all 19 kh.md items + 7 NEW items**. Every VALID/INVALID verdict was reproduced against the current tree. Every "Patched / Partially patched / UNFIXED" status matches the files on disk. `git status` confirms 12 modified tracked files (uncommitted), consistent with the report's "working tree patched" narrative.

No false validations found. Minor precision issues only (listed in §3) — none change any verdict.

| Group | KH claim | Muse re-check |
|---|---|---|
| A1–A5 criticals | 5/5 VALID | Agree 5/5 |
| B1–B5 + B4b logic bugs | 6/6 VALID | Agree 6/6 |
| C1, N-2, N-3, B5b/CSP, B6–B9 | 8/8 VALID | Agree 8/8 |
| F1, F2 known-false | 2/2 correctly rejected | Agree 2/2 |
| NEW-1 – NEW-7 | 7 new findings | Agree 7/7 are real, with 2 caveats: NEW-6 duplicates A1-remainder; N-3 duplicates A4-subset (double-count, not wrong) |

## 2. Item-by-item reproduction (evidence)

### A. Criticals
- **A1 VALID, partially patched.** `src/lib/admin-session.ts:3,45-52` now uses `jose` `SignJWT`/`jwtVerify` HS256 30m; `src/proxy.ts:15` calls `verifyAdminToken`. Remainder correctly flagged: `admin-session.ts:9` hardcoded fallback `'school-achievements-...-32chars!'`. Note: cookie `maxAge` 8h (`:63`) vs JWT 30m expiry — session dies at 30m, minor inconsistency KH did not mention.
- **A2 VALID, patched in tree.** `src/app/api/achievements/[id]/route.ts:75-87` whitelists `['title','desc','department','teacherName','attachmentUrls','date']` for `!isAdmin`; strips `pinHash` for admin path. No `...updatePayload` spread remains.
- **A3 VALID, partially patched.** `src/app/api/pin/reset/route.ts:59` is exactly `process.env.NEXT_PUBLIC_APP_URL || headers.get('origin') || 'http://localhost:3000'`. No CSRF/origin check in this route. Poisoning now requires missing env var, as KH states.
- **A4 VALID, UNFIXED.** `firestore.rules:7,13` both `allow read: if true`. `src/app/page.tsx:90-94` streams all `achievements` then client-filters `status==='approved'`. `pinHash` written at `src/app/api/achievements/route.ts:102` into the same public doc. `settings/global_info` publicly readable (`page.tsx:111-116`).
- **A5 VALID, UNFIXED.** `[id]/route.ts` has no `checkRateLimit` import/call in PUT (`:28`) or DELETE (`:119`). `src/app/api/pin/route.ts:79-84` is 30/min IP-only, no per-ID lockout. 10k-space brute force path confirmed.

### B. Logic/architecture
- **B1 VALID, patched.** `achievements/route.ts:54-59` sanitizes, `:88-93` now writes `title: sTitle, desc: sDesc`. Correct.
- **B2 VALID, patched.** `src/lib/cloudinary.ts:52` is now `resourceType === 'raw' ? rawPublicId : rawPublicId.replace(...)`. Correct.
- **B3 VALID, UNFIXED.** `[id]/route.ts:97-103,150-156` `Promise.allSettled` + `console.error`, then proceeds to `updateDoc`/`deleteDoc`. No retry queue.
- **B4 VALID, patched.** `src/app/admin/page.tsx:89` deps are now `[isAdmin, adminLoading, router]`. Correct (original `[router]` verifiable only via git history; current state is fixed).
- **B4b VALID, UNFIXED.** `src/lib/logger.ts:29-31` `setInterval(flushBuffer,5000)`; `:71-73` `flushBuffer()` unawaited on error/security. Serverless freeze/drop analysis correct.
- **B5 VALID, UNFIXED.** `pin/reset/route.ts:50` `setDoc(doc(db,"admin","pinReset"),...)` single static doc. Overwrite confirmed.

### C. Additional (kh.md §C)
- **C1 VALID, UNFIXED, location correction accepted.** `src/app/api/upload/route.ts` exports only `POST` (no DELETE). The real hole is `src/app/api/cleanup/route.ts:43-52` `action==='rollback'` placed **before** the `isAdminSession()` gate at `:54-57`, with only `u.includes('cloudinary.com')` check. Unauthenticated destroy confirmed. KH's re-mapping of kh.md's stale `DELETE /api/upload` reference is correct.
- **N-2 VALID, UNFIXED.** `src/lib/rate-limit.ts:6` in-memory `Map` + per-file comment `:3-4` admits serverless bypass. Callers key on `headers.get('x-forwarded-for')` (e.g. `achievements/route.ts:43`, `upload/route.ts:37`, `auth/route.ts:28`, `pin/reset/route.ts:16`). Spoof/multi-instance analysis correct.
- **N-3 VALID, duplicate of A4.** `src/app/api/settings/route.ts:25-29` strips `adminPin` but `firestore.rules:12-15` allows direct read. Real, but counting it separately from A4 double-counts one root cause.
- **B5/CSP VALID, UNFIXED.** `next.config.mjs:1-15` has HSTS/nosniff/XFO/Referrer-Policy, no CSP. `package.json:31` `xlsx` from `https://cdn.sheetjs.com/...tgz`. Correct.
- **B6 VALID, UNFIXED.** `src/lib/useAdmin.ts:27-28` fails open to `localStorage`. Correct. Impact is UI-only spoof (server routes still gate on cookie), KH's wording slightly overstates but risk direction is right.
- **B7 VALID, UNFIXED.** PBKDF2 10k/SHA-512 in `auth/route.ts:13`, `achievements/[id]/route.ts:23`, `pin/route.ts:19`; fixed salt `admin-pin-${pepper}`, deterministic per-ID salt for achievements. Combined with A4 public `pinHash`, offline crack trivial. Correct.
- **B8 VALID, UNFIXED.** `src/app/api/backup/route.ts:64` `.set(docData,{merge:true})`, no delete path. Zombie/overwrite analysis correct.
- **B9 VALID, UNFIXED.** `src/lib/sanitize.ts:60-62` accepts any `http(s)://`. Cloudinary-only restriction missing. Correct.

### D. Known-false
- **F1 correctly rejected.** `package.json:26` `next@16.2.7`; `src/proxy.ts:12` `export async function proxy`. Rename to `middleware.ts` would break Next 16 convention. Correct.
- **F2 correctly rejected.** `backup/route.ts:59-68` only iterates backup docs with `set(...,{merge:true})`; no `deleteDoc`/purge. Newer docs untouched. Correct.

### NEW-1 – NEW-7 (KH deep audit)
- **NEW-1 VALID, UNFIXED, HIGH.** `achievements/route.ts:33,37`, `settings/route.ts:44,47`, `pin/route.ts:32,35` all use `origin.includes(host)` / `referer.includes(host)`. Substring bypass (`host.evil.com`, `evil.com?host`) confirmed.
- **NEW-2 VALID, UNFIXED, HIGH.** `upload/route.ts:55` checks only `file.type` (client-supplied multipart header). No magic-byte check. SVG-as-`text/plain` vector as described is plausible.
- **NEW-3 VALID, UNFIXED, HIGH.** `page.tsx:133-136` `dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}}` with `schoolName` from Firestore, no `</script>` escaping. Breakout confirmed.
- **NEW-4 VALID, UNFIXED, MEDIUM (hardening).** `[id]/route.ts:29,38,120,125` passes `id` straight to `doc(db,'achievements',id)` with no regex. Next.js decoded slashes/`..` mostly 404/throw rather than clean traversal, so exploitability is lower than "path traversal" wording implies — still valid input-validation gap.
- **NEW-5 VALID, UNFIXED, MEDIUM.** `pin/reset/confirm/route.ts:40-42` comment says "Constant-time compare" but code is `storedHash === tokenHash`. Correct catch. Practical timing signal over network is small, but fix is one line.
- **NEW-6 VALID but DUPLICATE.** Same hardcoded fallback as A1-remainder (`admin-session.ts:9`). Should be merged with A1, not counted as a new vuln.
- **NEW-7 VALID, UNFIXED, MEDIUM.** `full-record/page.tsx:219-232` maps stored rows straight to `XLSX.utils.json_to_sheet` with no export-boundary sanitize. Caveat: current export omits `desc` (exports teacher/department/title/date/score/attachments), and new writes are tab-prefixed by `preventExcelFormula` (`sanitize.ts:19-25`) — so risk is legacy-row only. Still valid defense-in-depth.

## 3. Precision notes (do not change verdicts)

1. **Arithmetic:** "19 items (5 + 6 + 8 + 2)" sums to 21, not 19. Cosmetic.
2. **Double counting:** N-3 ⊂ A4; NEW-6 = A1-remainder. True unique root causes are fewer than the 26-row table suggests.
3. **Line drift:** B2 cited as `cloudinary.ts ~L59` (now `:52`); C1 `cleanup ~L104` references shifted after rollback block insertion. Expected in a moving tree.
4. **NEW-4 severity wording:** "path traversal" overstates Firestore `doc()` behavior; "missing ID validation" is the precise label.
5. **NEW-7 field list:** report says `row.title/row.desc`; current export uses `row.title` (no `desc`) plus unsanitized `teacherName/department/attachments`. Conclusion unchanged.

## 4. Consolidated table (KH table reproduced — all statuses confirmed)

| ID | Verdict | Status on disk | Risk |
|---|---|---|---|
| A1 | VALID | Partially patched (JWT done, fallback remains) | CRITICAL |
| A2 | VALID | Patched in tree | CRITICAL |
| A3 | VALID | Partially patched (env-first, still header fallback, no CSRF) | HIGH |
| A4 | VALID | UNFIXED | CRITICAL |
| A5 | VALID | UNFIXED | HIGH |
| B1 | VALID | Patched in tree | HIGH |
| B2 | VALID | Patched in tree | HIGH |
| B3 | VALID | UNFIXED | LOW |
| B4 | VALID | Patched in tree | MEDIUM |
| B4b | VALID | UNFIXED | MEDIUM |
| B5 | VALID | UNFIXED | LOW |
| C1 (cleanup rollback) | VALID | UNFIXED | CRITICAL |
| N-2 (XFF + in-memory limiter) | VALID | UNFIXED | MEDIUM |
| N-3 (settings direct-read bypass) | VALID (subset of A4) | UNFIXED | HIGH |
| B5b (CSP + xlsx CDN) | VALID | UNFIXED | MEDIUM |
| B6 (useAdmin fail-open) | VALID | UNFIXED | HIGH (UI) |
| B7 (PBKDF2 10k) | VALID | UNFIXED | HIGH |
| B8 (backup merge:true) | VALID | UNFIXED | MEDIUM |
| B9 (attachment host allowlist) | VALID | UNFIXED | HIGH |
| F1 (proxy rename) | FALSE — correctly rejected | N/A | — |
| F2 (restore deletes) | FALSE — correctly rejected | N/A | — |
| NEW-1 (includes() CSRF) | VALID | UNFIXED | HIGH |
| NEW-2 (MIME spoof) | VALID | UNFIXED | HIGH |
| NEW-3 (JSON-LD breakout) | VALID | UNFIXED | HIGH |
| NEW-4 (ID validation) | VALID | UNFIXED | MEDIUM |
| NEW-5 (=== vs timingSafeEqual) | VALID | UNFIXED | MEDIUM |
| NEW-6 (JWT fallback) | VALID, dup of A1 | UNFIXED | HIGH |
| NEW-7 (export-boundary sanitize) | VALID | UNFIXED | MEDIUM |

## 5. Recommended fix order (unchanged from KH §5 — endorsed)

1. C1 rollback auth → A1 fallback removal → B6 fail-closed.
2. A4+N-3 rules + `pinHash` isolation.
3. A5 per-ID lockout → B7 iterations/salt.
4. B9 host allowlist → NEW-1 exact-host compare → NEW-3 `<` escape → NEW-2 magic bytes → NEW-5 `timingSafeEqual` → A3 env-only base URL + CSRF.
5. B4b await flush → B5 per-token docs → B5b CSP/vendor xlsx → B3 retry queue → B8 audited restore.

*End of kh-muse audit. No source files were modified; only this report was created.*
