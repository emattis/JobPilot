import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { createElement, type ReactElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";

// ── Types ─────────────────────────────────────────────────────────────────────

type Block =
  | { kind: "header"; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullet"; lines: string[] };

// ── Text parser ───────────────────────────────────────────────────────────────

function isHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60) return false;
  // ALL CAPS line (allow spaces, hyphens, &)
  if (t === t.toUpperCase() && /[A-Z]/.test(t) && !/[@.]/.test(t)) return true;
  // Short line ending with colon that isn't a bullet
  if (t.endsWith(":") && t.length <= 40 && !t.startsWith("-") && !t.startsWith("•")) return true;
  return false;
}

function isBulletLine(line: string): boolean {
  return /^\s*[•\-–—*]\s/.test(line);
}

function parseResumeText(raw: string): Block[] {
  const paragraphChunks = raw.split(/\n{2,}/);
  const blocks: Block[] = [];

  for (const chunk of paragraphChunks) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter(Boolean);
    if (lines.length === 0) continue;

    if (lines.length === 1 && isHeaderLine(lines[0])) {
      blocks.push({ kind: "header", text: lines[0].trim() });
      continue;
    }

    // Mixed: first line may be a header followed by body
    let start = 0;
    if (isHeaderLine(lines[0])) {
      blocks.push({ kind: "header", text: lines[0].trim() });
      start = 1;
    }

    const rest = lines.slice(start);
    if (rest.length === 0) continue;

    if (rest.every(isBulletLine)) {
      blocks.push({ kind: "bullet", lines: rest.map((l) => l.replace(/^\s*[•\-–—*]\s*/, "").trim()) });
    } else {
      blocks.push({ kind: "paragraph", lines: rest });
    }
  }

  return blocks;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a2e",
    backgroundColor: "#ffffff",
  },
  header: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#3b4cca",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    borderBottomWidth: 0.75,
    borderBottomColor: "#d1d5db",
    paddingBottom: 2,
    marginTop: 14,
    marginBottom: 5,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 4,
    color: "#374151",
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 2,
    paddingLeft: 4,
  },
  bullet: {
    width: 12,
    fontSize: 10,
    color: "#6b7280",
    marginTop: 0.5,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
    color: "#374151",
  },
});

// ── Document component ────────────────────────────────────────────────────────

function ResumePDF({ blocks }: { blocks: Block[] }) {
  return createElement(
    Document,
    null,
    createElement(
      Page,
      { size: "LETTER", style: styles.page },
      ...blocks.map((block, i) => {
        if (block.kind === "header") {
          return createElement(Text, { key: i, style: styles.header }, block.text);
        }
        if (block.kind === "bullet") {
          return createElement(
            View,
            { key: i },
            ...block.lines.map((line, j) =>
              createElement(
                View,
                { key: j, style: styles.bulletRow },
                createElement(Text, { style: styles.bullet }, "•"),
                createElement(Text, { style: styles.bulletText }, line)
              )
            )
          );
        }
        // paragraph
        return createElement(
          Text,
          { key: i, style: styles.paragraph },
          block.lines.join("\n")
        );
      })
    )
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateResumePDF(rawText: string): Promise<Buffer> {
  const blocks = parseResumeText(rawText);
  const element = createElement(ResumePDF, { blocks }) as ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}
