# Frontend & UX Audit — School-Achievements (2026-10-28)

Scope: all 14 pages in src/app/**/page.tsx, layout.tsx, globals.css, 7 components in src/components/**, lib/pdf.ts, lib/printPdf.ts, public/sw.js, offline.html, manifest.webmanifest, proxy.ts. Read-only audit; findings grounded in file:line.

## Findings (severity-ordered)

### HIGH
1. [HIGH] offline.html corrupted — shell heredoc (`cat > public/sw.js <<'JS'` … `JS`) concatenated after `</html>`; offline fallback renders raw shell script text — public/offline.html:39-81 (81 lines total; HTML ends at line 38)
2. [HIGH] CSP blocks document previews — proxy.ts frame-src allowlist `frame-src 'self' https://www.google.com https://recaptcha.google.com` (src/proxy.ts:24) vs. Google-Docs-Viewer iframe `https://docs.google.com/gview?...` (src/app/achievement/[id]/page.tsx:432-439) → iframe blocked in production, empty 60vh box
3. [HIGH] No app-level error UX — no error.tsx / global-error.tsx / not-found.tsx / loading.tsx anywhere; ErrorBoundary wraps only home (src/app/page.tsx:321); render error on the other 13 pages shows Next.js default English error screen in an Arabic app
4. [HIGH] Infinite spinner on Firestore failure — 5 pages subscribe with onSnapshot without an error callback, so `isLoading` never resolves: full-record:78, honor-roll:16, kiosk:81, monthly-awards:64, admin/monthly-awards:57 (home page.tsx:92-101 is the only one with an error handler)

### MEDIUM
5. [MEDIUM] Badge thresholds inconsistent — home silver ≥75 (app/page.tsx:57) vs silver ≥80 on achievement/[id]:16, full-record:18+141+156, kiosk:199; admin awards bronze=75 (admin/page.tsx:731) which renders as SILVER on home
6. [MEDIUM] Silent fetch failures render as empty states — admin/page.tsx:65-74 (fetch ?all=true failure → "عمل رائع! لا توجد…"), reports page (tables with bare headers), full-record admin path; security-logs panel shows "لا توجد أحداث مسجلة بعد" on fetch failure (admin/page.tsx:296-304)
7. [MEDIUM] Add-achievement modal can be closed mid-upload (backdrop onClick=onClose + X + cancel active while isSubmitting) — submission then completes invisibly in background; no guard — AddAchievementModal.tsx:343-350, 660-676
8. [MEDIUM] Form labels not associated with inputs — FieldLabel renders `<label>` with no htmlFor and inputs are siblings (AddAchievementModal.tsx:113-121 and every field); same pattern across settings/page.tsx (all tabs) → unlabeled fields for screen readers
9. [MEDIUM] No Escape-to-close, focus trap, focus restore, or aria-live on any modal/toast (AddAchievementModal has role=dialog/aria-modal:341-348 but no keyboard exit; PIN modals in Sidebar.tsx:246+, achievement/[id], full-record have neither role nor Escape; toasts in ui.ts:36 + all pages not aria-live)
10. [MEDIUM] File dropzone is keyboard-inaccessible — div with onClick only, hidden input, no role/tabIndex; "+ إضافة المزيد" button only appears after ≥1 file — AddAchievementModal.tsx:617-640
11. [MEDIUM] PWA i18n: manifest `lang:"en"`, English name/description (public/manifest.webmanifest:2-4); PwaInstallPrompt button "Install App" + iOS guide mostly English (PwaInstallPrompt.tsx:68-92) in an all-Arabic product
12. [MEDIUM] sw.js: CACHE_VERSION 'school-achievements-v1' never changes (public/sw.js:1) + cache-first for non-hashed /fonts/, /icons/, destination-based images → stale assets + unbounded cache growth on kiosk tablets; navigation responses are never written to cache, so offline always dead-ends at offline.html (sw.js:37-43)
13. [MEDIUM] Kiosk gaps: no next-slide preload (each slide fetched on show — kiosk/page.tsx:295-300), no Screen Wake Lock, fixed 8s advance, muted video with no captions — kiosk/page.tsx:44-56, 296-307
14. [MEDIUM] Settings data-loss risks: no unsaved-changes guard on navigation; admin PIN has no confirm field; deleting departments/teachers is instant with no confirmation and no check for departments in use — settings/page.tsx:389-395, 601-620, 465-500
15. [MEDIUM] Review loop has no feedback channel — reject has no reason input and no notification path to the teacher anywhere; teacher never learns outcome/reason — admin/page.tsx:244-264; rejected items only visible to admins in full-record
16. [MEDIUM] No per-file upload progress — up to 100 MB videos upload with a lone spinner (AddAchievementModal.tsx:380-460)
17. [MEDIUM] Whole-page 'use client' on all 14 pages + client Firestore SDK; achievement detail has no SSR/SEO (no generateMetadata; JSON-LD only on home page.tsx:118-128); attachment images use raw <img> with no lazy loading/srcset
18. [MEDIUM] Background polling waste — admin page refetches everything every 20s regardless of tab visibility (admin/page.tsx:77), useAdmin polls /api/auth every 2 min per open tab (useAdmin.ts:4-5, runs even on kiosk), settings/global_info doc fetched 3-4× per page load (Sidebar.tsx:58-72, Footer.tsx:10-24, each page, AddAchievementModal on open)
19. [MEDIUM] Contrast: text-gray-400 helper/empty-state text on white ≈ 2.5:1, fails WCAG AA 4.5:1 (settings hints, full-record empty row:417, admin log timestamps); text-purple-200 loading text on purple gradient
20. [MEDIUM] `animate-in / fade-in / zoom-in-95 / slide-in-from-*` classes are silent no-ops — tailwindcss-animate/tw-animate-css not installed (globals.css imports only tailwindcss:1); used in ui.ts:36 (toast), Sidebar.tsx:246+, achievement page, admin review sheet, settings, kiosk
21. [MEDIUM] Document preview iframe leaks URLs to Google and has no error fallback when gview cannot render (achievement/[id]/page.tsx:432-439)

### LOW
22. [LOW] Dead PDF deps — @react-pdf/renderer (plus patches/@react-pdf+textkit+6.3.0.patch), html2canvas, html2pdf.js, jspdf, framer-motion: zero imports in src; pdfmake/arabic-reshaper/bidi-js reachable only via generateTablePdf/generateCategorizedPdf (lib/pdf.ts:248,330) which have zero callers; only isImageUrl/isVideoUrl/getVideoThumbUrl of pdf.ts are used (via printPdf.ts:3). xlsx IS used (full-record:237). Inflates install/audit surface, not runtime bundle
23. [LOW] AchievementCard.tsx is dead code (never imported) and contains English badges "Pending/Gold/Silver/Bronze" (AchievementCard.tsx:20-24) + hover-only edit/delete buttons (opacity-0 group-hover) unusable on touch
24. [LOW] Corrupted Arabic metadata — layout.tsx:16 description contains "وال.equivalencies"
25. [LOW] Unused imports: Metadata (achievement/[id]:3), orderBy (page.tsx:6, full-record:9, kiosk:4); unused handlers handleStatusChange/handleScore (admin/page.tsx:104-135)
26. [LOW] Hamburger button has no accessible name — aria-label set on the Menu SVG, not the button (Sidebar.tsx:228-233)
27. [LOW] English alt texts: "Attachment 1", "Enlarged Attachment", "School Logo" (achievement/[id]:462,496; layout.tsx:125; kiosk:273; intro; settings:367); offline.html <title> English (offline.html:5)
28. [LOW] admin/page.tsx:561 `className="${panel} p-5 md:p-6"` is a plain string — panel styles never applied to backup section
29. [LOW] Home table renders hidden score column (`hidden` on th:221 and td:249) — dead markup; stats "إنجازات مميزة" uses score≥90 (page.tsx:186)
30. [LOW] Toast success/error decided by substring `toastMsg.includes('خطأ')` (achievement/[id]:628)
31. [LOW] PIN inputs lack inputMode="numeric"/pattern; phone field is type=text without inputMode (settings, AddAchievementModal)
32. [LOW] monthly-awards pages maintain a second, parallel ranking system (awards[month] gold/silver/bronze) separate from score badges — admin must operate both (admin/monthly-awards/page.tsx:52-66)

## Verification status
- All file:line references verified by direct file reads (not run/deployed — hard rule; CSP-frame-src and SW behaviors derived from code, not runtime).
- Reports page contains no chart library and no charts (tables only; BarChart3 is an icon) — charts question answered: N/A.
- Firestore rules / API internals / rate-limiting: out of scope here (backend audit territory).
