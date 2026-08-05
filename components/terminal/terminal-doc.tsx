"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/** Inline parser: **bold**, *italic*, `code`. */
function renderInline(text: string, kp: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\n]+)\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      nodes.push(
        <strong key={`${kp}-${i}`} className="font-semibold text-foreground">
          {m[2]}
        </strong>,
      );
    } else if (m[3] !== undefined) {
      nodes.push(
        <code
          key={`${kp}-${i}`}
          className="rounded bg-secondary px-1 py-0.5 text-[0.85em] text-term-cyan"
        >
          {m[3]}
        </code>,
      );
    } else if (m[4] !== undefined) {
      nodes.push(
        <em key={`${kp}-${i}`} className="italic text-muted-foreground">
          {m[4]}
        </em>,
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function TableBlock({ lines, kp }: { lines: string[]; kp: string }) {
  const rows = lines
    .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, ""))
    .map((l) => l.split("|").map((c) => c.trim()));
  const isSep = (cells: string[]) =>
    cells.every((c) => /^:?-{2,}:?$/.test(c.replace(/\s/g, "")));
  const header = rows[0];
  const bodyRows = rows.slice(1).filter((r) => !isSep(r));
  return (
    <div className="my-2 overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-secondary/60">
            {header?.map((c, i) => (
              <th
                key={i}
                className="border-b border-border px-2 py-1.5 text-left font-semibold text-term-amber"
              >
                {renderInline(c, `${kp}-h-${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((r, ri) => (
            <tr key={ri} className="odd:bg-background even:bg-secondary/20">
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className="border-b border-border/50 px-2 py-1.5 align-top"
                >
                  {renderInline(c, `${kp}-${ri}-${ci}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders markdown-ish text with a terminal-document aesthetic. */
export function TerminalDoc({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let key = 0;
  let tableBuf: string[] = [];
  let codeBuf: string[] | null = null;

  const flushTable = () => {
    if (tableBuf.length) {
      blocks.push(<TableBlock key={key++} kp={`t${key}`} lines={tableBuf} />);
      tableBuf = [];
    }
  };

  for (const raw of lines) {
    if (codeBuf !== null) {
      if (raw.trim().startsWith("```")) {
        blocks.push(
          <pre
            key={key++}
            className="my-2 overflow-x-auto rounded-md border border-border bg-secondary/40 p-3 text-xs text-term-green"
          >
            {codeBuf.join("\n")}
          </pre>,
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
      blocks.push(<div key={key++} className="h-2.5" />);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      const level = h[1].length;
      const content = h[2];
      if (level === 1) {
        blocks.push(
          <div
            key={key++}
            className="mt-3 mb-1 border-b border-border pb-1 text-base font-bold tracking-wide text-primary"
          >
            {renderInline(content, `h${key}`)}
          </div>,
        );
      } else if (level === 2) {
        blocks.push(
          <div key={key++} className="mt-3 mb-1 text-sm font-semibold text-term-amber">
            <span className="text-term-dim">## </span>
            {renderInline(content, `h${key}`)}
          </div>,
        );
      } else {
        blocks.push(
          <div
            key={key++}
            className="mt-2 mb-0.5 text-sm font-semibold text-foreground/90"
          >
            {renderInline(content, `h${key}`)}
          </div>,
        );
      }
      continue;
    }
    if (/^(---+|\*\*\*+|___+)$/.test(t)) {
      blocks.push(<hr key={key++} className="my-3 border-border/70" />);
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(t);
    if (bullet) {
      blocks.push(
        <div key={key++} className="flex gap-2 pl-1">
          <span className="select-none text-primary">▸</span>
          <span className="flex-1">{renderInline(bullet[1], `b${key}`)}</span>
        </div>,
      );
      continue;
    }
    const num = /^(\d+)\.\s+(.*)$/.exec(t);
    if (num) {
      blocks.push(
        <div key={key++} className="flex gap-2 pl-1">
          <span className="select-none text-term-cyan">{num[1]}.</span>
          <span className="flex-1">{renderInline(num[2], `n${key}`)}</span>
        </div>,
      );
      continue;
    }
    if (/^>\s?/.test(t)) {
      blocks.push(
        <div
          key={key++}
          className="border-l-2 border-primary/60 pl-3 text-muted-foreground italic"
        >
          {renderInline(t.replace(/^>\s?/, ""), `q${key}`)}
        </div>,
      );
      continue;
    }
    blocks.push(
      <p key={key++} className="text-foreground/90">
        {renderInline(t, `p${key}`)}
      </p>,
    );
  }
  flushTable();
  if (codeBuf) {
    blocks.push(
      <pre
        key={key++}
        className="my-2 overflow-x-auto rounded-md border border-border bg-secondary/40 p-3 text-xs text-term-green"
      >
        {codeBuf.join("\n")}
      </pre>,
    );
  }

  return (
    <div className={cn("text-sm leading-relaxed", className)}>{blocks}</div>
  );
}
