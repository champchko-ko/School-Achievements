// Minimal type declarations for the Arabic shaping + BiDi packages used by the
// PDF exporter (src/lib/pdf.ts). Neither package ships TypeScript types.
declare module "arabic-reshaper" {
  const ArabicReshaper: {
    convertArabic(text: string): string;
    convertArabicBack(text: string): string;
  };
  export default ArabicReshaper;
}

declare module "bidi-js" {
  interface EmbeddingLevelsResult {
    levels: number[];
    paragraphs: { start: number; end: number; level: number }[];
  }
  const bidiFactory: () => {
    getEmbeddingLevels(text: string, baseDirection?: "ltr" | "rtl"): EmbeddingLevelsResult;
    getReorderedString(text: string, levels: EmbeddingLevelsResult, start?: number, end?: number): string;
    getMirroredCharactersMap(
      text: string,
      levels: EmbeddingLevelsResult,
      start?: number,
      end?: number
    ): string[] | null;
  };
  export default bidiFactory;
}
