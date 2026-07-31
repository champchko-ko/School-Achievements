// Render a react-pdf document to a PDF blob and trigger a browser download.
// Fonts are registered lazily on first export so the main bundle stays small.

import React from "react";
import { pdf, type DocumentProps } from "@react-pdf/renderer";
import { registerArabicFonts } from "./fonts";

export async function downloadPdf(element: React.ReactElement, filename: string): Promise<void> {
  registerArabicFonts();
  const blob = await pdf(element as React.ReactElement<DocumentProps>).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
