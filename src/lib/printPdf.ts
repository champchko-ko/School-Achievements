// Browser print-to-PDF export.
//
// Instead of generating a PDF client-side (pdfmake / react-pdf), we open a
// clean RTL print window with the report as styled HTML and let the browser's
// own text engine shape the Arabic, then trigger window.print() so the user
// can save it as a PDF. This guarantees correct, joined Arabic letters on
// every device.

import { getVideoThumbUrl, isImageUrl, isVideoUrl } from "./pdf";

export type PrintAttachment = {
  kind: "image" | "video" | "document";
  label: string;
  src?: string;
  appUrl: string;
};

export type PrintCell =
  | { type: "text"; text: string; bold?: boolean; color?: string }
  | { type: "rich"; title: string; desc?: string }
  | { type: "attachments"; items: PrintAttachment[] };

export type PrintSection = {
  title: string;
  subtitle?: string;
  columns: string[];
  widths?: number[];
  rows: PrintCell[][];
};

export type PrintReportOptions = {
  documentTitle: string;
  logoUrl?: string;
  schoolName?: string;
  title: string;
  subtitle?: string;
  sections: PrintSection[];
};

function getFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(url);
    const nameWithExt = decoded.split("/").pop()?.split("?")[0];
    return nameWithExt || "ملف_مرفق";
  } catch {
    return "ملف_مرفق";
  }
}

export function buildPrintAttachments(urls: string[], appUrl: string): PrintCell {
  const items: PrintAttachment[] = [];
  let imageIndex = 1;
  let videoIndex = 1;
  for (const url of urls) {
    if (!url) continue;
    if (isImageUrl(url)) {
      items.push({ kind: "image", label: `صورة ${imageIndex++}`, src: url, appUrl });
    } else if (isVideoUrl(url)) {
      items.push({
        kind: "video",
        label: `فيديو ${videoIndex++}`,
        src: getVideoThumbUrl(url),
        appUrl,
      });
    } else {
      items.push({ kind: "document", label: getFileName(url), appUrl });
    }
  }
  return { type: "attachments", items };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAttachments(items: PrintAttachment[]): string {
  if (items.length === 0) return '<span class="empty">—</span>';
  return `<div class="attachments">${items
    .map((item) => {
      const inner =
        item.kind === "document" || !item.src
          ? `<span class="file-name">${escapeHtml(item.label)}</span>`
          : `<img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.label)}" loading="lazy" /><span class="file-name">${escapeHtml(item.label)}</span>`;
      return `<a class="attachment" href="${escapeHtml(item.appUrl)}" target="_blank" rel="noopener">${inner}</a>`;
    })
    .join("")}</div>`;
}

function renderCell(cell: PrintCell): string {
  switch (cell.type) {
    case "attachments":
      return `<td>${renderAttachments(cell.items)}</td>`;
    case "rich": {
      const desc = cell.desc ? `<div class="rich-desc">${escapeHtml(cell.desc)}</div>` : "";
      return `<td><div class="rich-title">${escapeHtml(cell.title)}</div>${desc}</td>`;
    }
    default: {
      const style: string[] = [];
      if (cell.bold) style.push("font-weight:bold");
      if (cell.color) style.push(`color:${cell.color}`);
      const attr = style.length ? ` style="${style.join(";")}"` : "";
      return `<td class="cell-text"${attr}>${escapeHtml(cell.text)}</td>`;
    }
  }
}

function renderSection(section: PrintSection): string {
  const thead = `<tr>${section.columns
    .map((col, i) => {
      const w = section.widths?.[i];
      return `<th${w ? ` style="width:${w}%"` : ""}>${escapeHtml(col)}</th>`;
    })
    .join("")}</tr>`;
  const tbody = section.rows.map((row) => `<tr>${row.map(renderCell).join("")}</tr>`).join("");
  return `<div class="section">
    <div class="section-title">${escapeHtml(section.title)}</div>
    ${section.subtitle ? `<div class="section-subtitle">${escapeHtml(section.subtitle)}</div>` : ""}
    <table>
      <thead>${thead}</thead>
      <tbody>${tbody}</tbody>
    </table>
  </div>`;
}

function buildPrintHtml(opts: PrintReportOptions): string {
  const origin = window.location.origin;
  const printedAt = `تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")} - الوقت: ${new Date().toLocaleTimeString("ar-SA")}`;
  const logo = opts.logoUrl ? `<img class="logo" src="${escapeHtml(opts.logoUrl)}" alt="" />` : "";
  const schoolName = opts.schoolName
    ? `<div class="school-name">${escapeHtml(opts.schoolName)}</div>`
    : "";
  const subtitle = opts.subtitle ? `<div class="subtitle">${escapeHtml(opts.subtitle)}</div>` : "";
  const sections = opts.sections.map(renderSection).join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.documentTitle)}</title>
  <style>
    @font-face {
      font-family: "Tajawal";
      src: url("${origin}/fonts/Tajawal-Regular.ttf") format("truetype");
      font-weight: 400;
      font-display: swap;
    }
    @font-face {
      font-family: "Tajawal";
      src: url("${origin}/fonts/Tajawal-Bold.ttf") format("truetype");
      font-weight: 700;
      font-display: swap;
    }
    @page { size: A4; margin: 12mm; }
    * { box-sizing: border-box; }
    html, body { direction: rtl; }
    body {
      font-family: "Tajawal", "Noto Naskh Arabic", "Segoe UI", Tahoma, Arial, sans-serif;
      color: #222222;
      font-size: 12px;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 10px 16px;
      background: #ffffff;
      border-bottom: 1px solid #dddddd;
    }
    .toolbar button {
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      background: #46178f;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      cursor: pointer;
    }
    .toolbar .hint { font-size: 11px; color: #666666; }
    .content { padding: 24px; }
    .header { text-align: center; margin-bottom: 22px; }
    .logo { max-height: 90px; max-width: 200px; object-fit: contain; margin-bottom: 6px; }
    .school-name { font-size: 20px; font-weight: 700; color: #333333; margin-bottom: 6px; }
    .title { font-size: 16px; font-weight: 700; color: #46178f; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #666666; margin-bottom: 6px; }
    .printed-at { font-size: 10px; color: #999999; margin-bottom: 4px; }
    .section { margin-bottom: 18px; }
    .section-title { font-size: 13px; font-weight: 700; color: #0087ed; margin-bottom: 2px; }
    .section-subtitle { font-size: 11px; color: #666666; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      border: 1px solid #dddddd;
      padding: 6px 8px;
      text-align: right;
      vertical-align: top;
      word-break: break-word;
    }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    th { background: #46178f; color: #ffffff; font-size: 11px; }
    .cell-text { font-size: 11px; }
    .rich-title { font-weight: 700; font-size: 11px; }
    .rich-desc { color: #555555; font-size: 10px; margin-top: 2px; }
    .empty { color: #999999; }
    .attachments { display: flex; flex-wrap: wrap; gap: 8px; }
    .attachment {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      text-decoration: none;
      max-width: 120px;
    }
    .attachment img {
      max-height: 80px;
      max-width: 110px;
      object-fit: contain;
      border: 1px solid #eeeeee;
      border-radius: 4px;
    }
    .file-name {
      font-size: 9px;
      color: #0087ed;
      text-decoration: underline;
      text-align: center;
      word-break: break-all;
    }
    @media print {
      .toolbar { display: none; }
      .content { padding: 0; }
      a { color: inherit; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button id="print-btn" type="button">طباعة / حفظ PDF</button>
    <span class="hint">اختر "حفظ كـ PDF" من نافذة الطباعة</span>
  </div>
  <div class="content">
    <div class="header">
      ${logo}
      ${schoolName}
      <div class="title">${escapeHtml(opts.title)}</div>
      ${subtitle}
      <div class="printed-at">${escapeHtml(printedAt)}</div>
    </div>
    ${sections}
  </div>
  <script>
    var printed = false;
    function doPrint() {
      if (printed) return;
      printed = true;
      window.print();
    }
    function imageReady(img) {
      if (img.complete) return Promise.resolve();
      return new Promise(function (resolve) {
        var done = function () { resolve(); };
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
        setTimeout(done, 4000);
      });
    }
    function waitAndPrint() {
      Promise.all(Array.prototype.map.call(document.images, imageReady))
        .then(function () {
          var finish = function () { setTimeout(doPrint, 350); };
          if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(finish, finish);
          } else {
            finish();
          }
        });
      setTimeout(doPrint, 8000);
    }
    document.getElementById("print-btn").addEventListener("click", doPrint);
    if (document.readyState === "complete") {
      waitAndPrint();
    } else {
      window.addEventListener("load", waitAndPrint);
    }
  </script>
</body>
</html>`;
}

export function printReport(opts: PrintReportOptions): void {
  const win = window.open("", "_blank");
  if (!win) {
    alert("تعذر فتح نافذة الطباعة. يرجى السماح بالنوافذ المنبثقة والمحاولة مجدداً.");
    return;
  }
  win.document.open();
  win.document.write(buildPrintHtml(opts));
  win.document.close();
}
