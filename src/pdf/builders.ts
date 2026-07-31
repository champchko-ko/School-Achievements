// Build plain, serializable PDF data from Firestore records: pre-fetches
// images / video posters as data URLs so the react-pdf render never has to
// fetch remote resources mid-render.

import { fetchAsDataUrl, getVideoThumbUrl, isImageUrl, isVideoUrl } from "../lib/pdf";
import type { PdfAttachment, PdfCell, PdfHeader } from "./types";

function getFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const nameWithExt = decoded.split("/").pop()?.split("?")[0];
    return nameWithExt || "ملف_مرفق";
  } catch {
    return "ملف_مرفق";
  }
}

export async function buildAttachmentData(urls: string[], appUrl: string): Promise<PdfAttachment[]> {
  const items: PdfAttachment[] = [];
  let imageIndex = 1;
  let videoIndex = 1;
  for (const url of urls) {
    if (!url) continue;
    if (isImageUrl(url)) {
      const dataUrl = await fetchAsDataUrl(url);
      items.push({
        kind: "image",
        label: `صورة ${imageIndex++}`,
        dataUrl: dataUrl ?? undefined,
        appUrl,
      });
    } else if (isVideoUrl(url)) {
      const dataUrl = await fetchAsDataUrl(getVideoThumbUrl(url));
      items.push({
        kind: "video",
        label: `فيديو ${videoIndex++}`,
        dataUrl: dataUrl ?? undefined,
        appUrl,
      });
    } else {
      items.push({
        kind: "document",
        label: getFileName(url),
        appUrl,
      });
    }
  }
  return items;
}

export function attachmentsCell(items: PdfAttachment[]): PdfCell {
  return { type: "attachments", items };
}

export async function buildPdfHeader(
  settings: { logoUrl?: string; schoolName?: string } | null,
  title: string,
  subtitle?: string
): Promise<PdfHeader> {
  const logoDataUrl = settings?.logoUrl ? (await fetchAsDataUrl(settings.logoUrl)) ?? undefined : undefined;
  return {
    logoDataUrl,
    schoolName: settings?.schoolName,
    title,
    subtitle,
    printedAt: `تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")} - الوقت: ${new Date().toLocaleTimeString("ar-SA")}`,
  };
}

export function textCell(text: string | number, opts: { bold?: boolean; color?: string } = {}): PdfCell {
  return { type: "text", text: String(text), ...opts };
}

export function richCell(title: string, desc?: string): PdfCell {
  return { type: "rich", title, desc };
}
