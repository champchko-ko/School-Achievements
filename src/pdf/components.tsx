// Shared building blocks for the react-pdf report documents: header block,
// RTL table, and per-cell renderers.
//
// react-pdf's textkit bidi reordering is buggy for Arabic (crashes / drops
// ligatures), so every Arabic string is pre-shaped and pre-reordered to visual
// order with rtlText() (same pipeline as the old pdfmake export) and text is
// laid out LTR. Table columns use flexDirection: 'row-reverse' so the first
// column in the array appears on the right, like a real RTL table.

import React from "react";
import { View, Text, Image, Link, StyleSheet } from "@react-pdf/renderer";
import { rtlText } from "../lib/pdf";
import type { PdfAttachment, PdfCell, PdfHeader, PdfTable } from "./types";

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoNaskh",
    fontSize: 9,
    padding: 36,
    color: "#222222",
  },
  headerBlock: {
    marginBottom: 14,
  },
  logo: {
    width: 52,
    height: 52,
    alignSelf: "center",
    marginBottom: 6,
    objectFit: "contain",
  },
  schoolName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
    textAlign: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#46178f",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 10,
    color: "#666666",
    textAlign: "center",
    marginBottom: 6,
  },
  printedAt: {
    fontSize: 8,
    color: "#999999",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#0087ed",
    textAlign: "right",
    marginBottom: 2,
  },
  sectionSubtitle: {
    fontSize: 9,
    color: "#666666",
    textAlign: "right",
    marginBottom: 6,
  },
  table: {
    width: "100%",
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#dddddd",
  },
  tableRow: {
    flexDirection: "row-reverse",
  },
  tableCell: {
    padding: 6,
    borderStyle: "solid",
    borderWidth: 0.5,
    borderColor: "#dddddd",
    textAlign: "right",
  },
  headerCell: {
    backgroundColor: "#46178f",
  },
  headerText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 9,
    textAlign: "center",
  },
  cellText: {
    fontSize: 9,
    textAlign: "right",
  },
  bold: {
    fontWeight: "bold",
  },
  richTitle: {
    fontSize: 9,
    fontWeight: "bold",
    textAlign: "right",
  },
  richDesc: {
    fontSize: 8,
    color: "#555555",
    textAlign: "right",
    marginTop: 2,
  },
  attachment: {
    marginBottom: 2,
  },
  imageThumb: {
    width: 55,
    height: 55,
    objectFit: "contain",
    alignSelf: "center",
  },
  videoThumb: {
    width: 70,
    height: 45,
    objectFit: "contain",
    alignSelf: "center",
  },
  attachmentLabel: {
    fontSize: 7,
    color: "#0087ed",
    textAlign: "center",
    textDecoration: "underline",
    marginTop: 1,
  },
  link: {
    textDecoration: "underline",
  },
  linkText: {
    fontSize: 8,
    color: "#0087ed",
    textAlign: "center",
  },
  emptyCell: {
    color: "#999999",
    textAlign: "center",
  },
});

function AttachmentList({ items }: { items: PdfAttachment[] }) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={styles.attachment}>
          {item.kind === "document" || !item.dataUrl ? (
            <Link src={item.appUrl} style={styles.link}>
              <Text style={styles.linkText}>{rtlText(item.label)}</Text>
            </Link>
          ) : (
            <Link src={item.appUrl}>
              <Image
                src={item.dataUrl}
                style={item.kind === "video" ? styles.videoThumb : styles.imageThumb}
              />
              <Text style={styles.attachmentLabel}>{rtlText(item.label)}</Text>
            </Link>
          )}
        </View>
      ))}
      {items.length === 0 && <Text style={styles.emptyCell}>—</Text>}
    </View>
  );
}

function renderCell(cell: PdfCell) {
  switch (cell.type) {
    case "attachments":
      return <AttachmentList items={cell.items} />;
    case "rich":
      return (
        <View>
          <Text style={styles.richTitle}>{rtlText(cell.title)}</Text>
          {cell.desc ? <Text style={styles.richDesc}>{rtlText(cell.desc)}</Text> : null}
        </View>
      );
    default:
      return (
        <Text
          style={[
            styles.cellText,
            ...(cell.bold ? [styles.bold] : []),
            ...(cell.color ? [{ color: cell.color }] : []),
          ]}
        >
          {rtlText(cell.text)}
        </Text>
      );
  }
}

export function PdfHeaderBlock({ header }: { header: PdfHeader }) {
  return (
    <View style={styles.headerBlock}>
      {header.logoDataUrl ? <Image src={header.logoDataUrl} style={styles.logo} /> : null}
      {header.schoolName ? <Text style={styles.schoolName}>{rtlText(header.schoolName)}</Text> : null}
      <Text style={styles.title}>{rtlText(header.title)}</Text>
      {header.subtitle ? <Text style={styles.subtitle}>{rtlText(header.subtitle)}</Text> : null}
      {header.printedAt ? <Text style={styles.printedAt}>{rtlText(header.printedAt)}</Text> : null}
    </View>
  );
}

export function PdfTableBlock({ columns, rows }: PdfTable) {
  const widths = columns.map((c) => `${c.width ?? 100 / columns.length}%`);
  return (
    <View style={styles.table}>
      <View style={styles.tableRow}>
        {columns.map((c, i) => (
          <View key={i} style={[styles.tableCell, styles.headerCell, { width: widths[i] }]}>
            <Text style={styles.headerText}>{rtlText(c.header)}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.tableRow}>
          {row.map((cell, ci) => (
            <View key={ci} style={[styles.tableCell, { width: widths[ci] }]}>
              {renderCell(cell)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export const pdfStyles = styles;
