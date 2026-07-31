// @react-pdf/renderer font registration for the Noto Naskh Arabic fonts.
// `src` accepts a URL in the browser (e.g. "/fonts/...") and a filesystem
// path in Node.js (used by tests / server-side rendering).

import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerArabicFonts(
  regularSrc: string = "/fonts/NotoNaskhArabic-Regular.ttf",
  boldSrc: string = "/fonts/NotoNaskhArabic-Bold.ttf"
): void {
  if (registered) return;
  registered = true;
  Font.register({
    family: "NotoNaskh",
    fonts: [
      { src: regularSrc, fontWeight: "normal" },
      { src: boldSrc, fontWeight: "bold" },
    ],
  });
}
