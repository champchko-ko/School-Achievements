// Categorized report document (reports page individual record + full record
// page): sections grouped by department/teacher, each with its own RTL table.

import React from "react";
import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import type { PdfHeader, PdfSection } from "./types";
import { PdfHeaderBlock, PdfTableBlock, pdfStyles } from "./components";

const styles = StyleSheet.create({
  section: { marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: "bold", color: "#0087ed", textAlign: "right", marginBottom: 2 },
  sectionSubtitle: { fontSize: 9, color: "#666666", textAlign: "right", marginBottom: 6 },
});

export function ReportDocument({
  header,
  sections,
}: {
  header: PdfHeader;
  sections: PdfSection[];
}) {
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <PdfHeaderBlock header={header} />
        {sections.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            {s.subtitle ? <Text style={styles.sectionSubtitle}>{s.subtitle}</Text> : null}
            <PdfTableBlock columns={s.columns} rows={s.rows} />
          </View>
        ))}
      </Page>
    </Document>
  );
}
