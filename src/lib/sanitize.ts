// src/lib/sanitize.ts
// Sanitization utilities for user-supplied text

/**
 * Strips HTML tags from a string to prevent XSS in rendered contexts.
 * React auto-escapes in JSX, but this provides defense-in-depth
 * for raw-HTML contexts like the Excel export.
 */
export function stripHtml(value: string): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, '');
}

/**
 * Prevents Excel formula injection by prefixing dangerous leading characters.
 * Excel interprets strings starting with =, +, -, @ as formulas.
 * Prepending a tab character prevents that while preserving the visible value.
 */
export function preventExcelFormula(value: string): string {
  if (!value) return '';
  if (/^[=+\-@]/.test(value)) {
    return '\t' + value;
  }
  return value;
}

/**
 * Full sanitize for text fields: strip HTML, then prevent Excel formula injection.
 * Use this for all user-supplied text before storing to Firestore.
 */
const MAX_TEXT_LENGTH = 10000;
const MAX_ARRAY_LENGTH = 100;
const MAX_TEACHERS_LENGTH = 1000;

export function sanitizeText(value: string): string {
  if (!value) return '';
  return preventExcelFormula(stripHtml(value).trim().slice(0, MAX_TEXT_LENGTH));
}

/**
 * Sanitize an array of strings (e.g., departments or teachers lists).
 */
export function sanitizeStringArray(arr: string[]): string[] {
  if (!arr) return [];
  return arr.map(item => sanitizeText(item)).filter(Boolean);
}

/**
 * Cleans an entire settings/achievement payload object
 * by applying sanitizeText to all known string fields.
 */
export function sanitizeAchievementPayload<T extends Record<string, any>>(body: T): T {
  const textFields = ['teacherName', 'title', 'desc', 'department'];
  for (const field of textFields) {
    const val = body[field];
    if (typeof val === 'string') {
      (body as Record<string, any>)[field] = sanitizeText(val);
    }
  }
  // attachmentUrls is an array of URLs — restrict strictly to Cloudinary (MUST-09)
  if (Array.isArray(body.attachmentUrls)) {
    (body as Record<string, any>).attachmentUrls = body.attachmentUrls.filter((url: any) => 
      typeof url === 'string' && url.startsWith('https://res.cloudinary.com/')
    ).slice(0, MAX_ARRAY_LENGTH);
  }
  return body;
}

/**
 * Sanitizes settings payload.
 */
export function sanitizeSettingsPayload<T extends Record<string, any>>(body: T): T {
  const textFields = [
    'schoolName', 'managerName', 'viceManagerName', 'assistantManager2',
    'computerDeptTeacher', 'computerDeptHead',
    'vision', 'message', 'address', 'phone'
  ];
  for (const field of textFields) {
    const val = body[field];
    if (typeof val === 'string') {
      (body as Record<string, any>)[field] = sanitizeText(val);
    }
  }
  // Sanitize array fields
  if (Array.isArray(body.departments)) {
    (body as Record<string, any>).departments = sanitizeStringArray(body.departments).slice(0, MAX_ARRAY_LENGTH);
  }
  if (Array.isArray(body.teachers)) {
    const teachersList = (body.teachers as any[]).slice(0, MAX_TEACHERS_LENGTH);
    (body as Record<string, any>).teachers = teachersList.map((t: any) =>
      typeof t === 'string'
        ? { name: sanitizeText(t), department: '' }
        : { name: sanitizeText(t?.name || ''), department: sanitizeText(t?.department || '') }
    ).filter((t: any) => Boolean(t.name));
  }
  return body;
}
