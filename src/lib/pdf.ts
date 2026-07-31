// Real PDF generation using pdfmake (client-side) with the Tajawal Arabic font.
// pdfmake and the font files are loaded lazily so the main bundle stays small.

export type PdfHeader = {
  logoUrl?: string;
  schoolName?: string;
  title: string;
  subtitle?: string;
};

export type PdfColumn = {
  header: string;
  width?: number | "auto" | "*";
  alignment?: "right" | "center" | "left";
};

let pdfMakePromise: Promise<any> | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function loadPdfMake(): Promise<any> {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const mod = await import("pdfmake/build/pdfmake");
      const pdfMake = (mod as any).default || mod;
      const loadFont = async (url: string) =>
        arrayBufferToBase64(await (await fetch(url)).arrayBuffer());
      const [regular, bold] = await Promise.all([
        loadFont("/fonts/Tajawal-Regular.ttf"),
        loadFont("/fonts/Tajawal-Bold.ttf"),
      ]);
      pdfMake.addFontContainer({
        vfs: {
          "Tajawal-Regular.ttf": regular,
          "Tajawal-Bold.ttf": bold,
        },
        fonts: {
          Tajawal: {
            normal: "Tajawal-Regular.ttf",
            bold: "Tajawal-Bold.ttf",
            italics: "Tajawal-Regular.ttf",
            bolditalics: "Tajawal-Bold.ttf",
          },
        },
      });
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

export async function fetchAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function isImageUrl(url: string): boolean {
  if (!url) return false;
  if (/\.(jpeg|jpg|gif|png|webp|svg|bmp)/i.test(url)) return true;
  if (url.includes("/image/upload/") && !url.toLowerCase().endsWith(".pdf")) return true;
  return false;
}

export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (/\.(mp4|webm|mov|ogg|avi|flv|mkv|m3u8)/i.test(url)) return true;
  return url.includes("/video/upload/");
}

// Build a Cloudinary poster-frame URL for a video (so_0 = first frame, .jpg).
export function getVideoThumbUrl(url: string): string {
  try {
    if (!url.includes("/video/upload/")) return url;
    const u = new URL(url);
    const segments = u.pathname.split("/");
    const uploadIdx = segments.indexOf("upload");
    if (uploadIdx === -1) return url;
    // Strip any existing extension, insert so_0 right after "upload", end with .jpg
    segments[segments.length - 1] = segments[segments.length - 1].replace(/\.[^/.]+$/, "");
    segments.splice(uploadIdx + 1, 0, "so_0");
    u.pathname = segments.join("/") + ".jpg";
    return u.toString();
  } catch {
    return url;
  }
}

const getFileName = (url: string) => {
  try {
    const decoded = decodeURIComponent(url);
    const nameWithExt = decoded.split("/").pop()?.split("?")[0];
    return nameWithExt || "ملف_مرفق";
  } catch {
    return "ملف_مرفق";
  }
};

// Build a PDF table cell for attachments: embedded image thumbnails + clickable
// links that open inside the app (the achievement page), not the raw storage URL.
// `appUrl` is the in-app page (e.g. origin + "/achievement/<id>") where all
// attachments are displayed.
export async function attachmentsCell(urls: string[], appUrl: string): Promise<any> {
  const cells: any[] = [];
  let index = 1;
  for (const url of urls) {
    if (isImageUrl(url)) {
      const dataUrl = await fetchAsDataUrl(url);
      if (dataUrl) {
        cells.push({ image: dataUrl, width: 32, height: 32, link: appUrl, margin: [0, 1, 0, 1] });
      } else {
        cells.push({
          text: `صورة ${index}`,
          link: appUrl,
          color: "#0087ed",
          decoration: "underline",
          fontSize: 8,
          margin: [0, 1, 0, 1],
        });
      }
    } else if (isVideoUrl(url)) {
      const thumbDataUrl = await fetchAsDataUrl(getVideoThumbUrl(url));
      if (thumbDataUrl) {
        cells.push({ image: thumbDataUrl, width: 40, height: 26, link: appUrl, margin: [0, 1, 0, 1] });
      } else {
        cells.push({
          text: `فيديو ${index}`,
          link: appUrl,
          color: "#0087ed",
          decoration: "underline",
          fontSize: 8,
          margin: [0, 1, 0, 1],
        });
      }
    } else {
      cells.push({
        text: getFileName(url),
        link: appUrl,
        color: "#0087ed",
        decoration: "underline",
        fontSize: 8,
        margin: [0, 1, 0, 1],
      });
    }
    index += 1;
  }
  if (cells.length === 0) return { text: "—", color: "#999999" };
  return cells;
}

export async function generateTablePdf(opts: {
  header: PdfHeader;
  columns: PdfColumn[];
  rows: any[][];
  filename: string;
}): Promise<void> {
  const pdfMake = await loadPdfMake();
  const { header, columns, rows, filename } = opts;

  const content: any[] = [];

  if (header.logoUrl) {
    const logo = await fetchAsDataUrl(header.logoUrl);
    if (logo) {
      content.push({ image: logo, width: 52, height: 52, alignment: "center", margin: [0, 0, 0, 8] });
    }
  }
  if (header.schoolName) {
    content.push({ text: header.schoolName, style: "schoolName", alignment: "center" });
  }
  content.push({ text: header.title, style: "title", alignment: "center", margin: [0, 8, 0, 2] });
  if (header.subtitle) {
    content.push({ text: header.subtitle, style: "subtitle", alignment: "center", margin: [0, 0, 0, 6] });
  }
  content.push({
    text: `تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")} - الوقت: ${new Date().toLocaleTimeString("ar-SA")}`,
    style: "date",
    alignment: "center",
    margin: [0, 4, 0, 14],
  });

  content.push({
    table: {
      headerRows: 1,
      widths: columns.map((c) => c.width ?? "*"),
      body: [
        columns.map((c) => ({ text: c.header, style: "tableHeader", alignment: c.alignment || "center" })),
        ...rows.map((row) =>
          row.map((cell, i) => ({
            ...(Array.isArray(cell) ? { stack: cell } : { text: String(cell) }),
            alignment: columns[i]?.alignment || "right",
          }))
        ),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => "#dddddd",
      vLineColor: () => "#dddddd",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
  });

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    defaultStyle: { font: "Tajawal", fontSize: 9, alignment: "right" },
    styles: {
      schoolName: { fontSize: 16, bold: true, color: "#333333" },
      title: { fontSize: 13, bold: true, color: "#46178f" },
      subtitle: { fontSize: 10, color: "#666666" },
      date: { fontSize: 8, color: "#999999" },
      tableHeader: { bold: true, fontSize: 9, color: "#ffffff", fillColor: "#46178f" },
    },
    content,
  };

  try {
    await pdfMake.createPdf(docDefinition).download(filename);
  } catch (err) {
    console.error("PDF download error:", err);
    throw err;
  }
}

export type PdfSection = {
  title: string;
  subtitle?: string;
  columns: PdfColumn[];
  rows: any[][];
};

// PDF grouped into labeled sections (e.g., by department, then by teacher).
export async function generateCategorizedPdf(opts: {
  header: PdfHeader;
  sections: PdfSection[];
  filename: string;
}): Promise<void> {
  const pdfMake = await loadPdfMake();
  const { header, sections, filename } = opts;

  const content: any[] = [];

  if (header.logoUrl) {
    const logo = await fetchAsDataUrl(header.logoUrl);
    if (logo) {
      content.push({ image: logo, width: 52, height: 52, alignment: "center", margin: [0, 0, 0, 8] });
    }
  }
  if (header.schoolName) {
    content.push({ text: header.schoolName, style: "schoolName", alignment: "center" });
  }
  content.push({ text: header.title, style: "title", alignment: "center", margin: [0, 8, 0, 2] });
  if (header.subtitle) {
    content.push({ text: header.subtitle, style: "subtitle", alignment: "center", margin: [0, 0, 0, 6] });
  }
  content.push({
    text: `تاريخ الطباعة: ${new Date().toLocaleDateString("ar-SA")} - الوقت: ${new Date().toLocaleTimeString("ar-SA")}`,
    style: "date",
    alignment: "center",
    margin: [0, 4, 0, 14],
  });

  for (const section of sections) {
    content.push({
      text: section.title,
      style: "sectionTitle",
      margin: [0, 8, 0, 2],
    });
    if (section.subtitle) {
      content.push({ text: section.subtitle, style: "subtitle", margin: [0, 0, 0, 6] });
    }
    content.push({
      table: {
        headerRows: 1,
        widths: section.columns.map((c) => c.width ?? "*"),
        body: [
          section.columns.map((c) => ({ text: c.header, style: "tableHeader", alignment: c.alignment || "center" })),
          ...section.rows.map((row) =>
            row.map((cell, i) => ({
              ...(Array.isArray(cell) ? { stack: cell } : { text: String(cell) }),
              alignment: section.columns[i]?.alignment || "right",
            }))
          ),
        ],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => "#dddddd",
        vLineColor: () => "#dddddd",
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 10],
    });
  }

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [36, 36, 36, 36],
    defaultStyle: { font: "Tajawal", fontSize: 9, alignment: "right" },
    styles: {
      schoolName: { fontSize: 16, bold: true, color: "#333333" },
      title: { fontSize: 13, bold: true, color: "#46178f" },
      subtitle: { fontSize: 10, color: "#666666" },
      date: { fontSize: 8, color: "#999999" },
      sectionTitle: { fontSize: 11, bold: true, color: "#0087ed" },
      tableHeader: { bold: true, fontSize: 9, color: "#ffffff", fillColor: "#46178f" },
    },
    content,
  };

  try {
    await pdfMake.createPdf(docDefinition).download(filename);
  } catch (err) {
    console.error("PDF download error:", err);
    throw err;
  }
}
