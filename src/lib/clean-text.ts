// Strips invisible Unicode marks (zero-width space, RTL/LTR marks, BOM, etc.)
// that can end up in a name pasted from Word/WhatsApp. A name containing only
// those looks "empty" visually but is truthy, silently bypassing the fallback.
export function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').trim();
}
