# Task: Verify and fix security/logic issues in the "School-Achievements" codebase

You are reviewing a Next.js 16 (App Router, `proxy.ts` convention) + Firebase (client + Admin SDK) + Cloudinary + Vercel app. Repo root contains `src/app`, `src/lib`, `firestore.rules`, `next.config.mjs`.

For EACH issue below, do all three:
1. State a verdict: VALID / INVALID / NEEDS-MORE-CONTEXT, with a one-line reason.
2. If VALID, give the minimal concrete fix (exact file, function, and diff-level change).
3. Do NOT change unrelated code. Keep the existing UI/design/config.

Some issues below were flagged by a prior audit; two of them are known to be WRONG — identify and reject those, do not apply them.

---

## A. Confirmed critical vulnerabilities

A1. Unsigned admin session cookie (auth bypass).
File: `src/lib/admin-session.ts` (createSessionValue ~L47-49; isAdminSession ~L20-38) and `src/proxy.ts` (isAdminCookie ~L12-22).
Behavior: cookie value is `btoa(Date.now().toString())`; verification only base64-decodes and checks a 30-min idle window. No HMAC/JWT/server-side session. Any HTTP client can set `admin_session=<base64(now)>`.
Note: cookie is `httpOnly`, so `document.cookie` cannot overwrite it (the audit's snippet is imprecise) — but the forge-via-HTTP-client bypass is real.
Fix ask: replace with an HMAC-signed token (e.g. `jose`) using a server secret, verified identically in both files.

A2. Mass assignment / privilege escalation in PUT.
File: `src/app/api/achievements/[id]/route.ts` (~L44-58 destructures only `pin`; ~L93-97 spreads the rest into `updateDoc`). `sanitizeAchievementPayload` (`src/lib/sanitize.ts` ~L51-66) sanitizes only teacherName/title/desc/department + attachmentUrls.
Impact: any user with the 4-digit PIN can submit `{"status":"approved","score":95,"pinHash":"x"}` and self-approve/self-score/tamper hashes.
Fix ask: whitelist teacher-editable fields (`title, desc, department, teacherName, attachmentUrls, date`); admin-only fields only via admin session.

A3. Password reset poisoning / host header injection.
File: `src/app/api/pin/reset/route.ts` (~L59-62): `const origin = request.headers.get('origin') || request.headers.get('x-forwarded-host') || 'http://localhost:3000'` then `resetUrl = ${origin}/reset-pin?token=${token}`.
Notes: `origin` is checked first; the route has NO CSRF/origin validation; the email must match `adminEmail`, which is publicly exposed (see A4).
Fix ask: build the URL from a server env base URL (e.g. `NEXT_PUBLIC_APP_URL`), and add the same origin/referer CSRF check used in `POST /api/achievements`.

A4. Sensitive data exposure via public Firestore rules + client-side filtering.
Files: `firestore.rules` (~L6-15: `allow read: if true` on `achievements` and `settings`); `src/app/page.tsx` (~L90-95 streams all docs then filters `status==='approved'` in-browser); `pinHash` stored at `src/app/api/achievements/route.ts` ~L99.
Note: `GET /api/settings` strips `adminPin` for non-admins (`src/app/api/settings/route.ts` ~L27-30), but the raw `settings/global_info` doc is publicly readable, so `adminEmail` (and any legacy `adminPin`) leak anyway.
Fix ask: restrict rules to approved reads; move `pinHash`/`adminEmail` to the protected `admin/` path.

A5. Brute force on 4-digit PIN endpoints.
Files: `src/app/api/achievements/[id]/route.ts` PUT (~L28) and DELETE (~L106) have NO rate limit; `src/app/api/pin/route.ts` PUT (~L77-84) allows 30/min but has no per-achievement lockout.
Fix ask: per-achievement attempt limits + temporary lockout after ~5 failures.

## B. Confirmed logic/architecture bugs

B1. Unsanitized `title`/`desc` written to Firestore.
File: `src/app/api/achievements/route.ts` ~L87-88 writes raw `title`/`desc` although `sTitle`/`sDesc` exist (L57-58).
Impact: Excel formula injection on export (`src/app/full-record/page.tsx` ~L232 uses `XLSX.utils.json_to_sheet`).
Fix ask: write `sTitle`/`sDesc`.

B2. Raw asset extension stripped (data-loss risk).
File: `src/lib/cloudinary.ts` ~L59: `.replace(/\.[^./]+$/, '')` is applied to ALL resource types, but Cloudinary `raw` public_ids INCLUDE the extension (e.g. `docs/math_guide.pdf`).
Impact: raw deletes fail (orphans persist); worse, `src/app/api/cleanup/route.ts` (~L107 broken detection, ~L151-159 `action=clean`) misclassifies valid raw attachments as "broken" and REMOVES their URLs from Firestore → data loss.
Fix ask: do not strip extensions for `raw`; verify round-trip id equality.

B3. Best-effort deletion strands assets.
File: `src/app/api/achievements/[id]/route.ts` ~L135-146: Cloudinary errors are swallowed and `deleteDoc` proceeds.
Fix ask: at minimum enqueue/retry or record for cleanup (weekly scan already exists).

B4. Admin page effect missing deps.
File: `src/app/admin/page.tsx` ~L88: `useEffect(..., [router])` — should be `[isAdmin, adminLoading, router]`; otherwise redirect never runs after `useAdmin` resolves.

B4b. Serverless logger can drop logs.
File: `src/lib/logger.ts` (~L23-32 interval flush; ~L67-74: error/security flush is immediate but NOT awaited). In serverless, info/warn queued on the 5s timer are lost.
Fix ask: await/`waitUntil` the flush, or write synchronously.

B5. Single-slot reset concurrency.
File: `src/app/api/pin/reset/route.ts` ~L50-56 writes one static doc `admin/pinReset`, so a second request invalidates the first link.
Fix ask: key tokens per request (random id) or accept the tradeoff explicitly.

## C. Additional issues found beyond the original audit

C1. Unauthenticated, non-CSRF `DELETE /api/upload`.
File: `src/app/api/upload/route.ts` ~L107-131 accepts `{urls:[…]}` and destroys them with no admin session and no CSRF/origin check. Because rules expose all `attachmentUrls` and `settings.logoUrl`, an attacker can enumerate real public IDs and wipe files. Fix ask: require admin session OR a short-lived signed rollback token tied to the uploader; add CSRF check.

B3. (N-2) Rate limits trust spoofable `x-forwarded-for`.
All limiters key on `request.headers.get('x-forwarded-for')` (upload, auth, pin, pin/reset, achievements). In serverless this is spoofable and the limiter is per-instance in-memory (`src/lib/rate-limit.ts`).

B4. (N-3) Settings/PIN leak bypass — covered in A4.
Fix ask: don't rely on API stripping; fix the rules.

B5. No CSP + `xlsx` from third-party CDN.
File: `next.config.mjs` (~L1-15) sets HSTS/nosniff/XFO/Referrer-Policy but no CSP; `xlsx` is resolved from a CDN (supply chain).
Fix ask: add at least `default-src 'self'` CSP and vendor `xlsx`.

B6. `useAdmin` trusts `localStorage` on API failure.
File: `src/lib/useAdmin.ts` (~L26-28). Fail closed instead.

B7. Weak, publicly-readable PIN hashing.
File: `src/app/api/auth/route.ts` (~L9-15): PBKDF2 10,000 iters, SHA-512, FIXED salt `admin-pin-${pepper}`; achievement PINs use a deterministic per-achievement salt. With public `pinHash` (A4) and a 4-digit space, offline cracking is trivial.
Fix ask: raise iterations (≥600k), random per-record salt, move hashes off publicly readable docs.

B8. Backup restore uses `merge:true`.
File: `src/app/api/backup/route.ts` ~L64: `.set(docData,{merge:true})` can resurrect deleted achievements and overwrite `status`/`score`.
Fix ask: audited restore with confirmation + post-restore orphan scan.

B9. `attachmentUrls` accept arbitrary hosts.
File: `src/lib/sanitize.ts` ~L59-64 only checks `http(s)://` prefix.
Fix ask: restrict to the project Cloudinary host.

## C. KNOWN-FALSE — do NOT apply

F1. "Rename `src/proxy.ts` to `src/middleware.ts`." FALSE. In Next.js 16 the convention is `proxy.ts` exporting `proxy`; the file is correct and runs. Renaming would break route protection/maintenance mode.

F2. "Backup restore deletes newer documents / orphans files." FALSE. Restore only `.set(...,{merge:true})` for docs present in the backup; it never deletes absent docs. (The real risk is B8.)

---

## Output format
Return a table: Issue ID | Verdict | Minimal fix (file + change) | Risk if unfixed. Then list the exact order you would apply fixes in.
