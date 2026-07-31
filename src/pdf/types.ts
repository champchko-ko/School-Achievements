// Serializable data model for the react-pdf report documents. The export
// buttons build this plain data (images are pre-fetched as data URLs) and the
// document components only render it — no hooks, no async work inside the
// document tree.

export type PdfAttachment = {
  kind: "image" | "video" | "document";
  label: string;
  dataUrl?: string;
  appUrl: string;
};

export type PdfCell =
  | { type: "text"; text: string; bold?: boolean; color?: string }
  | { type: "rich"; title: string; desc?: string }
  | { type: "attachments"; items: PdfAttachment[] };

export type PdfColumn = {
  header: string;
  width?: number; // percentage 0-100
  align?: "right" | "center";
};

export type PdfTable = {
  columns: PdfColumn[];
  rows: PdfCell[][];
};

export type PdfSection = PdfTable & {
  title: string;
  subtitle?: string;
};

export type PdfHeader = {
  logoDataUrl?: string;
  schoolName?: string;
  title: string;
  subtitle?: string;
  printedAt?: string;
};
