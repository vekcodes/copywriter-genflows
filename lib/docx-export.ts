import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const BRAND_ORANGE = "E67E22";
const BRAND_NAVY = "0A1F35";
const MUTED = "666666";

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** Inline parser mirroring components/terminal/terminal-doc.tsx: **bold**, *italic*, `code`. */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)));
    if (m[2] !== undefined) {
      runs.push(new TextRun({ text: m[2], bold: true }));
    } else if (m[3] !== undefined) {
      runs.push(new TextRun({ text: m[3], font: "Courier New", color: "AE5A0F" }));
    } else if (m[4] !== undefined) {
      runs.push(new TextRun({ text: m[4], italics: true, color: MUTED }));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  if (!runs.length) runs.push(new TextRun(text));
  return runs;
}

/** Parses the same markdown subset as TerminalDoc into docx blocks. */
function markdownToDocxBlocks(markdown: string): (Paragraph | Table)[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: (Paragraph | Table)[] = [];
  let tableBuf: string[] = [];
  let codeBuf: string[] | null = null;

  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf
      .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, ""))
      .map((l) => l.split("|").map((c) => c.trim()));
    const isSep = (cells: string[]) =>
      cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
    const header = rows[0];
    const body = rows.slice(1).filter((r) => !isSep(r));
    blocks.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: header.map(
              (h) =>
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: "FBE3CC" },
                  children: [new Paragraph({ children: parseInline(h) })],
                }),
            ),
          }),
          ...body.map(
            (r) =>
              new TableRow({
                children: r.map(
                  (c) =>
                    new TableCell({ children: [new Paragraph({ children: parseInline(c) })] }),
                ),
              }),
          ),
        ],
      }),
    );
    tableBuf = [];
  };

  for (const raw of lines) {
    if (codeBuf !== null) {
      if (raw.trim().startsWith("```")) {
        blocks.push(
          new Paragraph({
            shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
            spacing: { after: 120 },
            children: [new TextRun({ text: codeBuf.join("\n"), font: "Courier New", size: 18 })],
          }),
        );
        codeBuf = null;
      } else {
        codeBuf.push(raw);
      }
      continue;
    }
    const t = raw.trim();
    if (t.startsWith("```")) {
      flushTable();
      codeBuf = [];
      continue;
    }
    if (t.startsWith("|") && t.length > 1) {
      tableBuf.push(raw);
      continue;
    }
    flushTable();

    if (t === "") {
      blocks.push(new Paragraph({ text: "" }));
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const level = h[1].length;
      blocks.push(
        new Paragraph({
          heading: HEADING_LEVELS[level - 1],
          spacing: { before: 200, after: 100 },
          children: parseInline(h[2]),
        }),
      );
      continue;
    }
    if (/^(---+|\*\*\*+|___+)$/.test(t)) {
      blocks.push(
        new Paragraph({
          spacing: { before: 100, after: 100 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } },
        }),
      );
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(t);
    if (bullet) {
      blocks.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(bullet[1]) }));
      continue;
    }
    const num = /^(\d+)\.\s+(.*)$/.exec(t);
    if (num) {
      blocks.push(
        new Paragraph({
          numbering: { reference: "numbered-list", level: 0 },
          children: parseInline(num[2]),
        }),
      );
      continue;
    }
    if (/^>\s?/.test(t)) {
      blocks.push(
        new Paragraph({
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: BRAND_ORANGE } },
          children: parseInline(t.replace(/^>\s?/, "")),
        }),
      );
      continue;
    }
    blocks.push(new Paragraph({ spacing: { after: 120 }, children: parseInline(t) }));
  }
  flushTable();
  if (codeBuf) {
    blocks.push(
      new Paragraph({
        shading: { type: ShadingType.CLEAR, fill: "F5F5F5" },
        children: [new TextRun({ text: codeBuf.join("\n"), font: "Courier New", size: 18 })],
      }),
    );
  }
  return blocks;
}

export interface CopyDocxInput {
  clientName: string;
  website?: string;
  copywritingOutput: string;
  icpFinalCopy?: string;
  icpFinalScore?: number;
  minIcpScore?: number;
}

/** Builds a single consolidated Word doc with every version of copy for a client. */
export async function buildCopyDocx(input: CopyDocxInput): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: input.clientName, bold: true, size: 56, color: BRAND_NAVY })],
    }),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "Cold Email Copy — GenFlows", size: 24, bold: true, color: BRAND_ORANGE }),
      ],
    }),
  ];
  if (input.website) {
    children.push(
      new Paragraph({
        spacing: { after: 300 },
        children: [new TextRun({ text: input.website, size: 20, color: MUTED })],
      }),
    );
  }

  if (input.icpFinalCopy) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 100, after: 100 },
        children: [new TextRun({ text: "Final Copy (ICP Brutal-Test Passed)", color: BRAND_ORANGE })],
      }),
    );
    if (typeof input.icpFinalScore === "number") {
      children.push(
        new Paragraph({
          spacing: { after: 160 },
          children: [
            new TextRun({
              text: `Scored ${input.icpFinalScore}/10 by the simulated prospect${
                input.minIcpScore ? ` (pass bar: ${input.minIcpScore}+)` : ""
              }.`,
              italics: true,
              color: MUTED,
            }),
          ],
        }),
      );
    }
    children.push(...markdownToDocxBlocks(input.icpFinalCopy));
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 100, after: 100 },
      children: [
        new TextRun({ text: "Full Copywriting Output (All Strategies & Versions)", color: BRAND_ORANGE }),
      ],
    }),
  );
  children.push(...markdownToDocxBlocks(input.copywritingOutput));

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { color: BRAND_ORANGE, bold: true, size: 32 },
          paragraph: { spacing: { before: 240, after: 120 } },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { color: BRAND_NAVY, bold: true, size: 26 },
          paragraph: { spacing: { before: 200, after: 100 } },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { color: BRAND_NAVY, bold: true, size: 24 },
          paragraph: { spacing: { before: 160, after: 80 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "numbered-list",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}
