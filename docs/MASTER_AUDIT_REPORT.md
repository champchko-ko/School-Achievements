# Actionable Remediation Backlog: Issues That Must Be Done Now

**Document:** `MASTER_AUDIT_REPORT.md` (Final Senior Audit Revision)  
**Date:** October 17, 2026  
**Auditor Role:** Principal Security Architect  
**Scope:** Active codebase ONLY (`src/...`, `firestore.rules`, `next.config.mjs`, `package.json`).  
**Purpose:** This document is the **definitive, deduplicated worklist of active issues that must be fixed in the codebase now**. All previously debunked claims (`FALSE-01` to `FALSE-04`) and all issues already fully patched in the working tree (`AC-01`, `LOGIC-01`, `UI-01`) have been pruned.

---

## 1. Executive Summary & Action Matrix

A total of **24 actionable tasks** remain to achieve 100% security, stability, and zero-orphan compliance.

### Priority Breakdown:
* **Tier 1: CRITICAL (3 Issues) — Immediate Deployment Blockers**
  * `MUST-01`: Unauthenticated Cloudinary Asset Purge in `/api/cleanup`
  * `MUST-02`: Hardcoded JWT Fallback Secret & Weak Key Derivation
  * `MUST-03`: Sensitive Data & PIN Hash Exposure via Public Firestore Read Rules
* **Tier 2: HIGH (7 Issues) — Core Security & Integrity Flaws**
  * `MUST-04`: Missing Rate Limiting & Lockout on PIN Endpoints (Brute-Force Risk)
  * `MUST-05`: Insufficient PBKDF2 Iteration Count (10k) on 4-Digit Search Space
  * `MUST-06`: CSRF Substring Bypass via `origin.includes(host)`
  * `MUST-07`: Password Reset Host Poisoning Fallback & Missing CSRF Check
  * `MUST-08`: Client-Side Admin State Tampering via `localStorage` Fail-Open
  * `MUST-09`: Attachment URLs Accept Arbitrary Domains (Phishing/Malware Risk)
  * `MUST-10`: Missing Formula Injection Sanitization at Excel Export Boundary
* **Tier 3: MEDIUM (7 Issues) — Hardening & Operational Reliability**
  * `MUST-11`: Stored XSS via File MIME-Type Spoofing on Upload Proxy
  * `MUST-12`: JSON-LD Script Tag `<` Breakout / DOM XSS
  * `MUST-13`: Missing Alphanumeric Document ID Regex Validation (500 SDK Errors)
  * `MUST-14`: In-Memory Rate Limiter Vulnerable to Lambda Distribution & XFF Spoofing
  * `MUST-15`: Serverless Logger Silently Drops Logs on Lambda Container Freeze
  * `MUST-16`: Backup Restore Uses `merge: true` Without Sync/Verification Checks
  * `MUST-17`: Missing Content Security Policy (CSP) & External CDN Dependency
* **Tier 4: LOW (7 Issues) — Defense-in-Depth & Quality-of-Life**
  * `MUST-18`: Maintenance Mode Bypassable via Client-Injected Cookie
  * `MUST-19`: Admin Page Guard Subpath & Trailing Slash Matching Gap in Proxy
  * `MUST-20`: Cookie `maxAge` (8h) vs JWT Expiry (30m) Ghost Session Desync
  * `MUST-21`: Non-Constant-Time Comparison (`===`) on Secret Token & PIN Hashes
  * `MUST-22`: Backup Export Leaks Admin Hashes and Tokens in Downloadable JSON
  * `MUST-23`: Single-Slot Reset Token Overwrite Concurrency in Firestore
  * `MUST-24`: Best-Effort Asset Deletion Silently Strands Cloudinary Orphans

---

## 2. Detailed Technical Worklist (File, Defect, & Concrete Fix)

---

### Tier 1: CRITICAL (Deployment Blockers)

#### [MUST-01] Unauthenticated Arbitrary Cloudinary Asset Purge
* **File:** [`src/app/api/cleanup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cleanup/route.ts#L43-L52)
* **Defect:** `action === 'rollback'` sits **before** `isAdminSession()`. Any visitor can pass `{ "action": "rollback", "urls": ["..."] }` and trigger server-authorized destruction of any Cloudinary file (e.g. school logo, active attachments).
* **Fix:** Move `action === 'rollback'` behind `isAdminSession()`, OR require an HMAC-signed rollback token issued during `/api/upload`.
```diff
--- a/src/app/api/cleanup/route.ts
+++ b/src/app/api/cleanup/route.ts
@@ -40,3 +40,8 @@
     const action = body?.action || 'scan';
+
+    const isAdmin = await isAdminSession();
+    if (!isAdmin) {
+      return NextResponse.json({ error: 'غير مصرح بهذا الإجراء' }, { status: 401 });
+    }
 
     if (action === 'rollback') {
```

---

#### [MUST-02] Hardcoded Fallback Secret & Predictable Key Padding
* **File:** [`src/lib/admin-session.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/admin-session.ts#L8-L11)
* **Defect:** Line 9 falls back to `'school-achievements-admin-session-secret-salt-key-32chars!'` if env vars are missing. `padEnd(32, '!')` on line 10 leaves short keys predictable.
* **Fix:** Enforce required secret in production; derive a uniform 256-bit key via SHA-256.
```diff
--- a/src/lib/admin-session.ts
+++ b/src/lib/admin-session.ts
@@ -3,2 +3,3 @@
 import { SignJWT, jwtVerify } from 'jose';
+import { createHash } from 'crypto';
@@ -8,4 +9,5 @@
 function getJwtSecret(): Uint8Array {
-  const rawSecret = process.env.AUTH_SECRET || process.env.PIN_PEPPER || 'school-achievements-admin-session-secret-salt-key-32chars!';
-  return new TextEncoder().encode(rawSecret.padEnd(32, '!'));
+  const rawSecret = process.env.AUTH_SECRET || process.env.PIN_PEPPER;
+  if (!rawSecret) throw new Error('AUTH_SECRET or PIN_PEPPER environment variable is required');
+  return createHash('sha256').update(rawSecret).digest();
 }
```

---

#### [MUST-03] Sensitive Data & PIN Hash Exposure via Public Firestore Read Rules
* **Files:** [`firestore.rules`](file:///c:/Users/ahmed/Desktop/School-Achievements/firestore.rules#L6-L16), [`src/app/page.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/page.tsx#L90-L95), [`src/app/api/achievements/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/route.ts#L102)
* **Defect:** `allow read: if true;` on `/achievements/{id}` and `/settings/{docId}` allows any client to stream all records across the network. Unapproved achievements, admin review scores, `adminEmail`, and `pinHash` are delivered directly to unauthenticated visitors.
* **Fix:**
  1. Update `firestore.rules`:
  ```diff
  --- a/firestore.rules
  +++ b/firestore.rules
  @@ -6,4 +6,4 @@
       match /achievements/{achievementId} {
  -      allow read: if true;
  +      allow read: if resource.data.status == 'approved' || resource.data.status == null;
         allow write: if false;
       }
  ```
  2. Relocate `pinHash` out of the public achievement document into a server-only subcollection `admin/achievementSecrets/{id}`.

---

### Tier 2: HIGH (Core Security & Integrity)

#### [MUST-04] Brute Force on 4-Digit PIN Endpoints
* **Files:** [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/%5Bid%5D/route.ts#L28-L167) & [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts#L79-L84)
* **Defect:** `PUT` and `DELETE` in `[id]/route.ts` have **zero rate limiting**. An attacker can test all 10,000 PIN combinations (0000–9999) directly against these endpoints in under 2 minutes.
* **Fix:** Add IP rate limiting and a 5-failure / 15-minute lockout on `PUT` and `DELETE`.
```diff
--- a/src/app/api/achievements/[id]/route.ts
+++ b/src/app/api/achievements/[id]/route.ts
@@ -10,2 +10,3 @@
 import { collectAttachmentUrls, destroyCloudinaryAsset } from '../../../../lib/cloudinary';
+import { checkRateLimit } from '../../../../lib/rate-limit';
@@ -29,3 +30,8 @@
   try {
+    const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
+    const { allowed } = checkRateLimit(`pin-lockout:${id}:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
+    if (!allowed) {
+      return NextResponse.json({ error: 'تم إيقاف المحاولات مؤقتاً لمدة 15 دقيقة.' }, { status: 429 });
+    }
```

---

#### [MUST-05] Weak PBKDF2 Iterations (10k) on 4-Digit Search Space
* **Files:** [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts#L13), [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/%5Bid%5D/route.ts#L23), [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts#L19)
* **Defect:** 10,000 iterations over a 4-digit space allows cracking any exposed hash in <800ms.
* **Fix:** Increase PBKDF2 iterations to ≥600,000 and use unique cryptographically random per-record salts.
```diff
--- a/src/app/api/auth/route.ts
+++ b/src/app/api/auth/route.ts
@@ -13,3 +13,3 @@
-  const hash = pbkdf2Sync(pin, salt, 10000, 64, 'sha512');
+  const hash = pbkdf2Sync(pin, salt, 600000, 64, 'sha512');
```

---

#### [MUST-06] CSRF Substring Bypass via `origin.includes(host)`
* **Files:** [`src/app/api/achievements/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/route.ts#L33), [`src/app/api/settings/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/settings/route.ts#L44), [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts#L32)
* **Defect:** `origin.includes(host)` matches `https://victim.com.attacker.com`, bypassing CSRF checks.
* **Fix:** Compare exact host parsed from URL.
```diff
- if (origin && host && !origin.includes(host)) {
+ if (origin && host) {
+   try {
+     if (new URL(origin).host !== host) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
+   } catch {
+     return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
+   }
+ }
```

---

#### [MUST-07] Password Reset Host Header Fallback & Missing CSRF Check
* **File:** [`src/app/api/pin/reset/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/reset/route.ts#L59)
* **Defect:** Line 59 falls back to `request.headers.get('origin') || 'http://localhost:3000'` if `NEXT_PUBLIC_APP_URL` is omitted, and route has no origin validation.
* **Fix:** Derive reset URL strictly from `process.env.NEXT_PUBLIC_APP_URL`; add origin CSRF check.
```diff
--- a/src/app/api/pin/reset/route.ts
+++ b/src/app/api/pin/reset/route.ts
@@ -58,3 +58,4 @@
-    const origin = process.env.NEXT_PUBLIC_APP_URL || request.headers.get('origin') || 'http://localhost:3000';
-    const resetUrl = `${origin.replace(/\/$/, '')}/reset-pin?token=${token}`;
+    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
+    if (!appUrl) throw new Error('NEXT_PUBLIC_APP_URL is not configured');
+    const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-pin?token=${token}`;
```

---

#### [MUST-08] Client-Side Admin State Tampering via `localStorage` Fail-Open
* **File:** [`src/lib/useAdmin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/useAdmin.ts#L26-L29)
* **Defect:** Catch block falls back to `localStorage.getItem('isAdmin') === 'true'`. Users can set localStorage and block `/api/auth` to render admin views.
* **Fix:** Fail closed on error.
```diff
--- a/src/lib/useAdmin.ts
+++ b/src/lib/useAdmin.ts
@@ -26,3 +26,4 @@
     } catch {
-      setIsAdmin(localStorage.getItem('isAdmin') === 'true');
+      setIsAdmin(false);
+      localStorage.removeItem('isAdmin');
     } finally {
```

---

#### [MUST-09] Attachment URLs Accept Arbitrary Domains (Phishing / Malware)
* **File:** [`src/lib/sanitize.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/sanitize.ts#L60-L63)
* **Defect:** Accepts any URL beginning with `http://` or `https://`.
* **Fix:** Restrict attachment URLs strictly to Cloudinary.
```diff
--- a/src/lib/sanitize.ts
+++ b/src/lib/sanitize.ts
@@ -60,3 +60,3 @@
     body.attachmentUrls = body.attachmentUrls.filter((url: any) => 
-      typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
+      typeof url === 'string' && url.startsWith('https://res.cloudinary.com/')
     ).slice(0, MAX_ARRAY_LENGTH);
```

---

#### [MUST-10] Missing Formula Injection Sanitization at Excel Export Boundary
* **File:** [`src/app/full-record/page.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/full-record/page.tsx#L223-L233)
* **Defect:** Legacy Firestore rows exported without formula prefix escaping. If records contain `=CSV`, `+`, `-`, or `@`, opening the `.xlsx` triggers formula execution in Excel.
* **Fix:** Prefix formula trigger characters with a single quote `'`.
```diff
--- a/src/app/full-record/page.tsx
+++ b/src/app/full-record/page.tsx
@@ -220,6 +220,7 @@
+        const sanitizeCell = (v: string) => /^[=\+\-\@\t\r]/.test(v) ? `'${v}` : v;
         return {
-          'المعلمة': row.teacherName || '',
-          'القسم': row.department || '',
-          'الإنجاز': row.title || '',
+          'المعلمة': sanitizeCell(row.teacherName || ''),
+          'القسم': sanitizeCell(row.department || ''),
+          'الإنجاز': sanitizeCell(row.title || ''),
```

---

### Tier 3: MEDIUM (Hardening & Robustness)

#### [MUST-11] Stored XSS via File MIME-Type Spoofing on Upload Proxy
* **File:** [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts#L55-L60)
* **Defect:** Only validates client-supplied `file.type` header without inspecting actual file magic bytes. Disguised SVG or HTML can be uploaded as `text/plain`.
* **Fix:** Verify file buffer magic numbers before forwarding to Cloudinary.

#### [MUST-12] JSON-LD Script Tag `<` Breakout / DOM XSS
* **File:** [`src/app/page.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/page.tsx#L133-L136)
* **Defect:** `JSON.stringify(jsonLd)` lacks `<` escaping, allowing closing script tag breakout.
* **Fix:** Replace `<` with `\u003c`: `JSON.stringify(jsonLd).replace(/</g, '\\u003c')`.

#### [MUST-13] Missing Alphanumeric Document ID Regex Validation (500 SDK Errors)
* **File:** [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/%5Bid%5D/route.ts#L29, L38, L120, L125)
* **Defect:** Unvalidated `id` param causes unhandled Firestore SDK 500 exceptions if slashes or malformed IDs are passed.
* **Fix:** Validate ID format with `/^[A-Za-z0-9_-]{1,100}$/.test(id)` and return 400 on failure.

#### [MUST-14] In-Memory Rate Limiter Serverless Bypass & XFF Spoofing
* **File:** [`src/lib/rate-limit.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/rate-limit.ts#L6-L16)
* **Defect:** In-memory map isolated per lambda; raw `x-forwarded-for` header is easily spoofed via comma-separated IPs.
* **Fix:** Parse the leftmost IP: `(header.split(',')[0] || '').trim()`.

#### [MUST-15] Serverless Logger Silently Drops Logs on Lambda Freeze
* **File:** [`src/lib/logger.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/logger.ts#L23-L48, L70-L74)
* **Defect:** 5-second interval timer and unawaited `flushBuffer()` are killed when the serverless function finishes responding.
* **Fix:** Await `flushBuffer()` on security events; emit logs synchronously to `console.log` / `console.error`.

#### [MUST-16] Backup Restore Uses `merge: true` Without Verification
* **File:** [`src/app/api/backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/backup/route.ts#L64)
* **Defect:** Restoring backups blindly recreates deleted records and overwrites newer evaluations without dry-run preview.
* **Fix:** Provide a dry-run preview and require explicit admin confirmation before merging.

#### [MUST-17] Missing Content Security Policy (CSP) & External CDN Dependency
* **Files:** [`next.config.mjs`](file:///c:/Users/ahmed/Desktop/School-Achievements/next.config.mjs#L1-L15) & [`package.json`](file:///c:/Users/ahmed/Desktop/School-Achievements/package.json#L31)
* **Defect:** No CSP headers configured; `xlsx` package is resolved directly from an external CDN tarball.
* **Fix:** Add a strict CSP header in `next.config.mjs` and vendor `xlsx`.

---

### Tier 4: LOW (Defense-in-Depth & Quality-of-Life)

#### [MUST-18] Maintenance Mode Bypassable via Client-Injected Cookie
* **File:** [`src/proxy.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/proxy.ts#L20, L41)
* **Defect:** `proxy.ts` trusts `request.cookies.get('maintenance_bypass')?.value === '1'`. Any client sending `Cookie: maintenance_bypass=1` bypasses maintenance mode.
* **Fix:** Sign the bypass cookie with HMAC or compare against a server-side secret hash.

#### [MUST-19] Admin Page Guard Subpath & Trailing Slash Matching Gap in Proxy
* **File:** [`src/proxy.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/proxy.ts#L47-L48)
* **Defect:** `adminRoutes.includes(pathname)` misses `/admin/` (trailing slash) and future nested pages (`/admin/logs`).
* **Fix:** `adminRoutes.some(r => pathname === r || pathname.startsWith(r + '/'))`.

#### [MUST-20] Cookie `maxAge` (8h) vs JWT Expiry (30m) Inconsistency
* **File:** [`src/lib/admin-session.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/admin-session.ts#L6, L63)
* **Defect:** Cookie lasts 8 hours while JWT expires in 30 minutes, leaving a dead cookie and triggering silent redirects.
* **Fix:** Align cookie `maxAge` to 1,800 seconds (30 minutes).

#### [MUST-21] Non-Constant-Time String Comparison (`===`) on Secret Hashes
* **Files:** [`src/app/api/pin/reset/confirm/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/reset/confirm/route.ts#L42), [`src/app/api/auth/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/auth/route.ts#L56), [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts#L105)
* **Defect:** Uses `===` on cryptographic hex hashes.
* **Fix:** Use `crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(inputHash))`.

#### [MUST-22] Backup Export Leaks Admin Hashes and Tokens in Downloadable JSON
* **File:** [`src/app/api/backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/backup/route.ts#L10, L78-95)
* **Defect:** Exporting `'admin'` collection includes `pinHash` and password reset `tokenHash` in plain JSON download.
* **Fix:** Exclude sensitive hash fields from the client-downloadable JSON payload.

#### [MUST-23] Single-Slot Reset Token Overwrite Concurrency in Firestore
* **File:** [`src/app/api/pin/reset/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/reset/route.ts#L50-L56)
* **Defect:** Stores reset tokens at fixed document `admin/pinReset`. A second request invalidates the first link.
* **Fix:** Key token documents by hash: `doc(db, "admin/pinResets/tokens", tokenHash)`.

#### [MUST-24] Best-Effort Asset Deletion Silently Strands Cloudinary Orphans
* **File:** [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/%5Bid%5D/route.ts#L96-L103, L148-156)
* **Defect:** Swallows Cloudinary deletion errors with `console.error` while Firestore document deletion proceeds.
* **Fix:** Append failed asset deletions to `admin/pendingDeletions` for automatic retry by weekly cleanup.

---

## 3. Master Consolidated Checklist

| # | Task ID | File | Summary Task | Severity |
| :---: | :--- | :--- | :--- | :--- |
| 1 | `MUST-01` | `src/app/api/cleanup/route.ts` | Move `action: rollback` behind admin auth gate | **CRITICAL** |
| 2 | `MUST-02` | `src/lib/admin-session.ts` | Remove hardcoded fallback secret; derive 256-bit key via SHA-256 | **CRITICAL** |
| 3 | `MUST-03` | `firestore.rules` | Restrict read rules to approved docs; move `pinHash` server-side | **CRITICAL** |
| 4 | `MUST-04` | `src/app/api/achievements/[id]/route.ts` | Add 5-fail / 15-min lockout on `PUT` and `DELETE` | **HIGH** |
| 5 | `MUST-05` | `src/app/api/auth/route.ts` | Increase PBKDF2 iterations to ≥600,000 + random salt | **HIGH** |
| 6 | `MUST-06` | `src/app/api/achievements/route.ts` | Replace `origin.includes(host)` with `new URL(origin).host === host` | **HIGH** |
| 7 | `MUST-07` | `src/app/api/pin/reset/route.ts` | Enforce `NEXT_PUBLIC_APP_URL` strictly + add CSRF check | **HIGH** |
| 8 | `MUST-08` | `src/lib/useAdmin.ts` | Fail closed on API error: `setIsAdmin(false); removeItem()` | **HIGH** |
| 9 | `MUST-09` | `src/lib/sanitize.ts` | Whitelist `https://res.cloudinary.com/` for attachment URLs | **HIGH** |
| 10 | `MUST-10` | `src/app/full-record/page.tsx` | Sanitize cells starting with `=, +, -, @` at export boundary | **HIGH** |
| 11 | `MUST-11` | `src/app/api/upload/route.ts` | Validate file magic bytes against declared MIME type | **MEDIUM** |
| 12 | `MUST-12` | `src/app/page.tsx` | Escape `<` in JSON-LD script tag: `.replace(/</g, '\\u003c')` | **MEDIUM** |
| 13 | `MUST-13` | `src/app/api/achievements/[id]/route.ts` | Validate route `id` with `/^[A-Za-z0-9_-]{1,100}$/` regex | **MEDIUM** |
| 14 | `MUST-14` | `src/lib/rate-limit.ts` | Parse leftmost client IP from `x-forwarded-for` | **MEDIUM** |
| 15 | `MUST-15` | `src/lib/logger.ts` | Await `flushBuffer()` on security events; emit to console | **MEDIUM** |
| 16 | `MUST-16` | `src/app/api/backup/route.ts` | Add pre-restore dry-run preview and confirmation check | **MEDIUM** |
| 17 | `MUST-17` | `next.config.mjs` | Add Content Security Policy (CSP); vendor `xlsx` dependency | **MEDIUM** |
| 18 | `MUST-18` | `src/proxy.ts` | Sign `maintenance_bypass` cookie with HMAC secret | **LOW** |
| 19 | `MUST-19` | `src/proxy.ts` | Update admin route matcher to support subpaths & trailing slashes | **LOW** |
| 20 | `MUST-20` | `src/lib/admin-session.ts` | Align cookie `maxAge` to 1,800 seconds (30m) | **LOW** |
| 21 | `MUST-21` | `src/app/api/pin/reset/confirm/route.ts` | Use `crypto.timingSafeEqual` on secret hashes | **LOW** |
| 22 | `MUST-22` | `src/app/api/backup/route.ts` | Strip `pinHash` and `tokenHash` from JSON backup downloads | **LOW** |
| 23 | `MUST-23` | `src/app/api/pin/reset/route.ts` | Key reset documents by hash: `admin/pinResets/tokens/{hash}` | **LOW** |
| 24 | `MUST-24` | `src/app/api/achievements/[id]/route.ts` | Append failed asset deletes to `admin/pendingDeletions` queue | **LOW** |
