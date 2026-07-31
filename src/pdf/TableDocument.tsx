// Simple single-table report document (department report + honor list).

import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import type { PdfCell, PdfColumn, PdfHeader } from "./types";
import { PdfHeaderBlock, PdfTableBlock, pdfStyles } from "./components";

export function TableDocument({
  header,
  columns,
  rows,
}: {
  header: PdfHeader;
  columns: PdfColumn[];
  rows: PdfCell[][];
}) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeaderBlock header={header} />
        <PdfTableBlock columns={columns} rows={rows} />
      </Page>
    </Document>
  );
}
