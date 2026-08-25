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
export function sanitizeText(value: string): string {
  if (!value) return '';
  return preventExcelFormula(stripHtml(value).trim());
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
export function sanitizeAchievementPayload(body: Record<string, any>): Record<string, any> {
  const textFields = ['teacherName', 'title', 'desc', 'department'];
  for (const field of textFields) {
    if (body[field] && typeof body[field] === 'string') {
      body[field] = sanitizeText(body[field]);
    }
  }
  // attachmentUrls is an array of URLs — validate they look like URLs
  if (body.attachmentUrls && Array.isArray(body.attachmentUrls)) {
    body.attachmentUrls = body.attachmentUrls.filter((url: any) => 
      typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
    );
  }
  return body;
}

/**
 * Sanitizes settings payload.
 */
export function sanitizeSettingsPayload(body: Record<string, any>): Record<string, any> {
  const textFields = [
    'schoolName', 'managerName', 'viceManagerName', 'assistantManager2',
    'vision', 'message', 'address', 'phone'
  ];
  for (const field of textFields) {
    if (body[field] && typeof body[field] === 'string') {
      body[field] = sanitizeText(body[field]);
    }
  }
  // Sanitize array fields
  if (body.departments && Array.isArray(body.departments)) {
    body.departments = sanitizeStringArray(body.departments);
  }
  if (body.teachers && Array.isArray(body.teachers)) {
    body.teachers = body.teachers.map((t: any) =>
      typeof t === 'string'
        ? sanitizeText(t)
        : { name: sanitizeText(t.name || ''), department: sanitizeText(t.department || '') }
    ).filter((t: any) => typeof t === 'string' ? Boolean(t) : Boolean(t.name));
  }
  return body;
}
