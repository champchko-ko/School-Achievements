# 🎓 School Achievements Platform (نظام إنجازات المدرسة)

[![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black?style=flat&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?style=flat&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=flat&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFA611?style=flat&logo=firebase)](https://firebase.google.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Signed_Uploads-3448C5?style=flat&logo=cloudinary)](https://cloudinary.com/)
[![Tests](https://img.shields.io/badge/Vitest-83%2F83_Passing-brightgreen?style=flat&logo=vitest)](https://vitest.dev/)
[![E2E Tests](https://img.shields.io/badge/Playwright-6%2F6_Passing-45ba4b?style=flat&logo=playwright)](https://playwright.dev/)
[![Security Audit](https://img.shields.io/badge/Security_Audit-100%25_Remediated-success?style=flat&logo=shield)](#-hardened-security-architecture)

A modern, secure, and production-ready school achievements management system built with Next.js 16 App Router, React 19, Firebase Firestore, and Cloudinary. Designed for schools, academies, and educational institutions to record, showcase, certify, and celebrate student and educator accomplishments with real-time updates, interactive kiosk displays, automated certificates, and multi-layered enterprise security.

---

## 🌟 Key Features

### 🏆 Achievement Management & Showcase
* **Instant Submission:** Teachers and administrators can add achievements with student names, grades, categories, descriptions, dates, and media attachments.
* **Per-Achievement PIN Protection:** Teachers can update or delete their submitted achievements using their individual 4-digit PIN, with brute-force lockout and exponential backoff protection.
* **Rich Filtering & Search:** Filter achievements by category (Academic, Sports, Arts, Community Service, Leadership, Innovation), grade level, class, date range, or keyword search.
* **Full Records (السجل الكامل):** Comprehensive historical archive with pagination, sorting, and tabular views.

### 🥇 Honor Roll & Recognition (لوحة الشرف والجوائز الشهرية)
* **Dynamic Honor Roll:** Real-time calculation of top students and top classes based on accumulated achievement points and awards.
* **Monthly Awards Showcase:** Dedicated portal highlighting Students and Teachers of the Month with custom spotlight cards, badges, and honors.

### 📜 Certificates & Reporting (الشهادات والتقارير)
* **High-Fidelity Certificate Export:** Instant PDF certificate generation with customized school seals, Arabic typography reshaped via `arabic-reshaper` and `bidi-js`, powered by `@react-pdf/renderer` and `html2canvas`.
* **Analytics & Performance Reports:** Export comprehensive achievement statistics into Excel (`xlsx`) or downloadable PDF summaries for school administration reviews.

### 🖥️ Smart Kiosk Mode (وضع العرض التفاعلي)
* **Digital Signage Display:** Fullscreen auto-cycling carousel designed for school lobby TV displays, hallways, and interactive smartboards.
* **QR Code Sharing:** Students and parents can scan instant QR codes on the kiosk screen to open their personal achievement record directly on mobile devices.

### 📱 Progressive Web App (PWA)
* Fully responsive across smartphones, tablets, and desktop workstations.
* PWA service worker with offline fallback and install prompt integration.

---

## 🛡️ Hardened Security Architecture

The platform has been audited and hardened across enterprise security, architectural, and quality standards:

| Security Layer | Implementation Details |
|---|---|
| **Content Security Policy (CSP)** | Dynamic, per-request cryptographic nonce generated in [`src/proxy.ts`](file:///c:/Users/ahmed/Desktop/School-Achievements/src/proxy.ts) (`strict-dynamic`). Hydration-safe request & response header synchronization; `'unsafe-eval'` completely removed in production. |
| **Authentication & Key Separation** | Administrative sessions use standard 256-bit JWTs signed with dedicated `AUTH_SECRET` (hashed with SHA-256 for `jose` compatibility). Zero fallback to salt peppers. |
| **Password & PIN Hashing** | PBKDF2 with SHA-512 (600,000 iterations) using static pepper and timing-safe comparison (`crypto.timingSafeEqual`) to eliminate timing-attack vulnerabilities. Zero plaintext PIN storage. |
| **Brute-Force Lockout & Backoff** | Global 5-failure lockout (15 minutes) with progressive sleep backoff on `/api/auth`. Per-achievement + IP combination lockouts on `/api/pin` with automatic admin unlock capability. |
| **CSRF Defense** | Strict `isValidOrigin` enforcement on state-changing methods (`POST`, `PUT`, `DELETE`). Validates against `Host`, `X-Forwarded-Host`, and configured production app origins; fails closed on missing or spoofed headers. |
| **Signed Media Uploads** | Cloudinary server-side cryptographic signing (`signUploadParams`) with SHA-256 and alphabetically sorted parameters. Magic-byte verification and MIME allowlists prevent malicious payload execution. |
| **Firebase App Check** | Integrated client and server App Check (reCAPTCHA Enterprise/v3) with graceful fallback to ensure zero upload outages while protecting backend assets. |
| **Distributed Rate Limiting** | Primary rate-limiting engine powered by Upstash Redis sliding window, with memory fallback and high-severity alerting in production serverless runtimes. |
| **Cron & Backup Protection** | Constant-time `crypto.timingSafeEqual` comparison for `CRON_SECRET`. Automated pre-storage sanitization strips all cryptographic hashes and sensitive credentials (`pinHash`, `tokenHash`, `adminPin`, `adminEmail`) before backup creation. |
| **Structured Audit Trail** | Centralized, searchable audit logging to Firestore (`logs` collection) with safe handling of undefined properties and formatted logging. |

---

## 🏗️ Technical Architecture & Stack

* **Framework:** Next.js 16.4.2 (App Router with Turbopack bundler)
* **Language & Runtime:** TypeScript 5.x, Node.js 20+
* **Frontend UI & Styling:** React 19.2.4, Tailwind CSS v4, Lucide Icons, Framer Motion
* **Database & Auth:** Google Cloud Firebase Firestore (Client & Admin SDK)
* **Media & CDN:** Cloudinary (Server-Side Signed Uploads)
* **Rate Limiting & Cache:** Upstash Redis (`@upstash/ratelimit`, `@upstash/redis`)
* **Document Processing:** `@react-pdf/renderer`, `html2canvas`, `pdfmake`, `xlsx`
* **Arabic Typography:** `arabic-reshaper`, `bidi-js`
* **Testing:** Vitest (83 unit tests), Playwright (6 E2E tests)

---

## 📁 Repository Structure

```
School-Achievements/
├── e2e/                           # Playwright end-to-end test suites
│   └── login-main.spec.mjs        # Main navigation and auth flow tests
├── public/                        # Static assets, PWA icons, manifest.json
│   ├── favicon.ico
│   ├── manifest.json
│   └── sw.js                      # Progressive Web App service worker
├── src/
│   ├── app/                       # Next.js 16 App Router pages & API routes
│   │   ├── achievement/[id]/      # Single achievement view & edit modal
│   │   ├── admin/                 # Admin control panel & monthly awards manager
│   │   ├── api/
│   │   │   ├── achievements/      # Achievement CRUD & scoring endpoints
│   │   │   ├── auth/              # Admin login & session verification
│   │   │   ├── backup/            # On-demand database export
│   │   │   ├── cleanup/           # Database hygiene & maintenance
│   │   │   ├── cron/              # Automated scheduled backups
│   │   │   ├── logs/              # Admin audit logs endpoint
│   │   │   ├── pin/               # Teacher PIN verification & password reset
│   │   │   ├── settings/          # School profile, grades, and categories config
│   │   │   └── upload/            # Secure media upload with signed Cloudinary
│   │   ├── full-record/           # Comprehensive achievement archive
│   │   ├── honor-roll/            # Top student & class leaderboards
│   │   ├── intro/                 # Welcome portal and introductory tour
│   │   ├── kiosk/                 # Fullscreen smartboard & lobby display mode
│   │   ├── monthly-awards/        # Public student & teacher of the month showcase
│   │   ├── reports/               # Administrative analytics & export portal
│   │   ├── reset-pin/             # Self-service PIN reset
│   │   ├── settings/              # System configuration & maintenance
│   │   ├── layout.tsx             # Root layout with metadataBase & CSP nonce injection
│   │   └── page.tsx               # Main public achievements dashboard
│   ├── components/                # Reusable React components
│   │   ├── AchievementCard.tsx    # Responsive achievement display card
│   │   ├── AddAchievementModal.tsx# Multi-step achievement submission modal
│   │   ├── ErrorBoundary.tsx      # Global React error boundary
│   │   ├── Header.tsx             # Navigation header & theme switcher
│   │   ├── PwaInstallPrompt.tsx   # Mobile PWA installation dialog
│   │   └── Sidebar.tsx            # Navigation sidebar with responsive drawer
│   ├── lib/                       # Core utilities and business logic
│   │   ├── admin-session.ts       # Jose JWT session management & verification
│   │   ├── backup-sanitize.ts     # Sensitive field redaction for database backups
│   │   ├── cloudinary.ts          # Server-side upload signing & URL helpers
│   │   ├── csrf.ts                # Origin & host validation middleware
│   │   ├── firebase.ts            # Firebase Client SDK & App Check initialization
│   │   ├── firebase-admin.ts      # Firebase Admin SDK & Firestore wrappers
│   │   ├── logger.ts              # Structured audit logging to Firestore
│   │   ├── pdf.ts                 # Certificate generation & PDF layout
│   │   ├── rate-limit.ts          # Upstash Redis & in-memory sliding window rate limiter
│   │   ├── sanitize.ts            # HTML & payload XSS sanitization
│   │   └── validate-lists.ts      # Grade, class, and category validators
│   └── proxy.ts                   # Hydration-safe nonce CSP & security proxy
├── eslint.config.mjs              # ESLint 9 configuration with React 19 rules
├── firebase.json                  # Firebase deployment rules mapping
├── next.config.mjs                # Next.js configuration & security response headers
├── package.json                   # Project dependencies and script declarations
├── playwright.config.mjs          # Playwright test runner configuration
├── storage.rules                  # Google Cloud Storage security rules
└── vitest.config.ts               # Vitest runner configuration
```

---

## ⚙️ Environment Variables Reference

Copy `.env.example` to `.env.local` for local development. In production (e.g. Vercel), configure these variables in **Project Settings → Environment Variables**:

| Variable | Scope | Required | Description |
|---|:---:|:---:|---|
| `AUTH_SECRET` | Server | **Yes** | 32+ character random secret used for JWT signing (`openssl rand -hex 32`). |
| `PIN_PEPPER` | Server | **Yes** | Cryptographic salt pepper used for PBKDF2 teacher and admin PIN hashing. |
| `NEXT_PUBLIC_APP_URL` | Public | **Yes** | Canonical URL of the application (`http://localhost:3000` or production URL). |
| `CLOUDINARY_CLOUD_NAME` | Server | **Yes** | Cloudinary cloud account name. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Public | **Yes** | Cloudinary cloud account name for client-side image rendering. |
| `CLOUDINARY_UPLOAD_PRESET` | Server | **Yes** | Name of the **Signed** upload preset created in Cloudinary Console. |
| `CLOUDINARY_API_KEY` | Server | **Yes** | Cloudinary API Key for signing uploads. |
| `CLOUDINARY_API_SECRET` | Server | **Yes** | Cloudinary API Secret for server-side cryptographic signatures. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Public | **Yes** | Firebase project Web API Key. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Public | **Yes** | Firebase authentication domain (`project-id.firebaseapp.com`). |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Public | **Yes** | Firebase Project ID. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Public | **Yes** | Firebase Storage bucket URI. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Public | **Yes** | Firebase Cloud Messaging sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Public | **Yes** | Firebase Web Application ID. |
| `FIREBASE_SERVICE_ACCOUNT` | Server | **Yes** | Single JSON string or base64-encoded string of Google Cloud service account credentials. |
| `SMTP_HOST` | Server | **Yes** | SMTP server host for sending admin PIN reset emails (e.g. `smtp.gmail.com`). |
| `SMTP_PORT` | Server | **Yes** | SMTP server port (e.g. `465` or `587`). |
| `SMTP_USER` | Server | **Yes** | SMTP username / email address. |
| `SMTP_PASS` | Server | **Yes** | SMTP password / app-specific password. |
| `CRON_SECRET` | Server | **Yes** | Secret bearer token authorizing scheduled weekly backups (`/api/cron/weekly-backup`). |
| `UPSTASH_REDIS_REST_URL` | Server | Recommended | Upstash Redis REST URL for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Server | Recommended | Upstash Redis REST Token. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Public | Optional | reCAPTCHA Enterprise/v3 site key for Firebase App Check. |
| `NEXT_PUBLIC_APPCHECK_PROVIDER` | Public | Optional | App Check provider (`enterprise` or `v3`, defaults to `enterprise`). |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js:** `>= 20.9.0`
* **npm:** `>= 10.0.0`
* **Git**

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/champchko-ko/School-Achievements.git
   cd School-Achievements
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env.local
   ```
   *Edit `.env.local` with your development credentials.*

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   *Open [http://localhost:3000](http://localhost:3000) to view the application.*

5. **Build for production:**
   ```bash
   npm run build
   npm run start
   ```

---

## 🧪 Testing & Verification

The project includes automated quality and security test suites:

```bash
# 1. Run Unit & Integration Tests (83 tests)
npm test

# 2. Run Playwright End-to-End Tests
npx playwright test

# 3. Static Type Checking
npx tsc --noEmit

# 4. Code Quality & React 19 Linting
npm run lint

# 5. Secret Leak Detection
gitleaks detect --source . -v

# 6. Static Application Security Testing (SAST)
semgrep scan --config auto

# 7. Production Turbopack Compilation
npm run build
```

---

## 💾 Backup & Disaster Recovery

* **Scheduled Backups:** The endpoint `/api/cron/weekly-backup` is executed automatically via Vercel Cron or external schedulers using `Authorization: Bearer <CRON_SECRET>`. All sensitive hashes are automatically redacted before storage.
* **Manual CLI Backup:** To run an immediate local export of all Firestore collections:
  ```bash
  npm run backup
  ```

---

## 🚢 Deployment (Vercel & Firebase)

1. **Deploy Web Application to Vercel:**
   * Connect your GitHub repository to Vercel.
   * Add all production environment variables from `.env.example` in **Vercel Settings → Environment Variables**.
   * Deploy the `master` branch.

2. **Deploy Firebase Storage Rules:**
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only storage
   ```

---

## 📄 License

This project is proprietary software developed for educational institution management. All rights reserved.

---

## Email Backup & Recovery (AES-256-GCM)

The weekly cron and a manual admin action both send an **encrypted** full backup (all collections, including the PIN-secret collection, so a restore recovers authentication) to `BACKUP_DESTINATION_EMAILS` (default: `bayanschool2026@gmail.com,elnewahy@gmail.com` — each recipient receives its own copy).

**Setup (Vercel environment variables):**
| Variable | Purpose |
|---|---|
| `BACKUP_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM. Generate with `openssl rand -hex 32`. Keep one offline recovery copy (password manager). Losing both copies = emailed backups are unrecoverable. |
| `BACKUP_DESTINATION_EMAILS` | Comma-separated recipient list. |
| `BACKUP_MAX_ATTACHMENT_BYTES` | Optional size guard (default 20 MB; Gmail limit 25 MB). Fail-closed: oversized backups are not sent. |

**Status & alerts:** every attempt updates the metadata-only `admin/backupStatus` document (`lastAttemptAt`, `lastSuccessAt`, sanitized `lastError`, checksum, size, per-recipient result). The admin dashboard shows an Arabic warning when the last SMTP-accepted success is older than 14 days or the last attempt failed. **"Submitted" means the SMTP server accepted the message — it is not confirmed delivery.** Check monthly that the newest backup email actually arrived in the mailbox.

**Restore / verify (decryption needs `BACKUP_ENCRYPTION_KEY`):**
```bash
# Validate only (no credentials, nothing written):
node scripts/restore-backup.mjs --file School-Achievements-Backup-2026-10-28.enc --key <64-hex>

# Restore into the local Firestore Emulator (isolated, repeatable):
npx firebase emulators:start --only firestore
set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
node scripts/restore-backup.mjs --file backup.enc --target emulator --confirm-restore

# Restore into a scratch Firebase project (the retirement-gate test):
node scripts/restore-backup.mjs --file backup.enc --target firestore --project-id <scratch-project-id> --confirm-restore
```
The script aborts on tampering (GCM auth), checksum mismatch, and `PIN_PEPPER` mismatches (unless `--force-pepper`). Restore is a merge upsert identical to `/api/backup` restore.

**Retention & retirement:** all backup emails are kept in Gmail (primary off-site archive — monitor mailbox capacity periodically). The legacy Firestore `backups` collection remains in parallel until the retirement gate passes (2–4 successful weekly emails + one successful isolated restore), then it is removed (see ANNOTATED-BACKUP-SPEC-2026-10-28.md). Key rotation: set a new `BACKUP_ENCRYPTION_KEY`; the file header stores `keyVersion`, and older emails decrypt only with the key era that created them.
