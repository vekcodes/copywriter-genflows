"use client";

import * as React from "react";
import { CornerDownLeft, Lock, Play, RotateCcw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { NodeState } from "@/lib/types";
import { TerminalDoc } from "./terminal-doc";
import { CopyButton, StatusBadge } from "./bits";

export interface NodeCellProps {
  index: number;
  title: string;
  hint: string;
  node: NodeState;
  /** Non-null while THIS node is streaming. */
  streaming?: { text: string; status: string } | null;
  locked?: boolean;
  lockReason?: string;
  /** Some node (anywhere) is running — disable inputs. */
  busy?: boolean;
  firstRunLabel: string;
  placeholder: string;
  onRun: (feedback: string) => void;
  onStop: () => void;
  headerExtra?: React.ReactNode;
  footerExtra?: React.ReactNode;
}

export function NodeCell({
  index,
  title,
  hint,
  node,
  streaming,
  locked,
  lockReason,
  busy,
  firstRunLabel,
  placeholder,
  onRun,
  onStop,
  headerExtra,
  footerExtra,
}: NodeCellProps) {
  const [input, setInput] = React.useState("");
  const isStreaming = !!streaming;
  const hasOutput = node.turns.some((t) => t.role === "assistant") || !!node.output;

  const feedbackTurns = node.turns
    .map((t, i) => ({ t, i }))
    .filter(({ t, i }) => !(i === 0 && t.role === "user"));

  const submit = () => {
    if (busy || locked) return;
    onRun(input.trim());
    setInput("");
  };

  return (
    <section
      className={cn(
        "term-surface rounded-lg border border-border",
        locked && "opacity-55",
        node.status === "running" && "border-primary/40",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md border border-border bg-secondary text-xs font-bold text-primary">
          {index}
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-wide">{title}</span>
          <span className="text-[11px] text-muted-foreground">{hint}</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {headerExtra}
          <StatusBadge status={node.status} />
          {hasOutput && !isStreaming && (
            <CopyButton text={node.output} />
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        {locked ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Lock className="size-4" />
            {lockReason ?? "Complete the previous step first."}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Prior turns */}
            {feedbackTurns.map(({ t, i }) =>
              t.role === "assistant" ? (
                <div
                  key={i}
                  className="rounded-md border border-border/60 bg-background/40 p-3"
                >
                  <TerminalDoc text={t.content} />
                </div>
              ) : (
                <div
                  key={i}
                  className="flex gap-2 text-xs text-term-cyan/90"
                >
                  <span className="select-none text-primary">❯</span>
                  <span className="whitespace-pre-wrap">{t.content}</span>
                </div>
              ),
            )}

            {/* Live stream */}
            {isStreaming && (
              <div className="rounded-md border border-primary/40 bg-background/40 p-3">
                {streaming!.status && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-term-amber">
                    <span className="size-1.5 animate-pulse rounded-full bg-term-amber" />
                    {streaming!.status}
                  </div>
                )}
                {streaming!.text ? (
                  <div className="term-cursor">
                    <TerminalDoc text={streaming!.text} />
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground term-cursor">
                    thinking…
                  </div>
                )}
              </div>
            )}

            {/* Error */}
            {node.status === "error" && node.error && !isStreaming && (
              <div className="rounded-md border border-term-red/50 bg-term-red/10 p-3 text-xs text-term-red">
                {node.error}
              </div>
            )}

            {/* Empty hint */}
            {!hasOutput && !isStreaming && node.status !== "error" && (
              <div className="py-4 text-xs text-muted-foreground">
                Nothing generated yet. Run this step below.
              </div>
            )}

            {footerExtra && !isStreaming && <div>{footerExtra}</div>}
          </div>
        )}
      </div>

      {/* Command input */}
      {!locked && (
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-start gap-2">
            <span className="mt-2.5 select-none text-primary">❯</span>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={hasOutput ? "Send feedback to refine (Enter to send, Shift+Enter for newline)…" : placeholder}
              rows={2}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="min-h-0 resize-none border-border/70 bg-background/60 font-mono text-sm"
            />
            <div className="flex flex-col gap-1.5">
              {isStreaming ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={onStop}
                >
                  <Square className="size-3" /> Stop
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={busy}
                  onClick={submit}
                  title={hasOutput ? "Send feedback" : firstRunLabel}
                >
                  {hasOutput ? (
                    <>
                      <CornerDownLeft className="size-3" /> Send
                    </>
                  ) : (
                    <>
                      <Play className="size-3" /> Run
                    </>
                  )}
                </Button>
              )}
              {hasOutput && !isStreaming && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onRun("")}
                  title="Regenerate from scratch"
                >
                  <RotateCcw className="size-3" /> Redo
                </Button>
              )}
            </div>
          </div>
          {!hasOutput && (
            <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
              {firstRunLabel}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
