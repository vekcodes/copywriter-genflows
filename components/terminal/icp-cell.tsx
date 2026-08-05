"use client";

import * as React from "react";
import { Gavel, Lock, Play, Square, ArrowUpToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { IcpState } from "@/lib/types";
import { TerminalDoc } from "./terminal-doc";
import { CopyButton, StatusBadge, Stepper } from "./bits";

function scoreColor(score: number, min: number) {
  if (score >= min) return "text-term-green border-term-green/50 bg-term-green/10";
  if (score >= 6) return "text-term-amber border-term-amber/50 bg-term-amber/10";
  return "text-term-red border-term-red/50 bg-term-red/10";
}

function ScoreBadge({ score, min }: { score: number; min: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-0.5 rounded-md border px-2 py-0.5 text-sm font-bold tabular-nums",
        scoreColor(score, min),
      )}
    >
      {score}
      <span className="text-[10px] font-normal opacity-70">/10</span>
    </span>
  );
}

export interface IcpCellProps {
  index: number;
  icp: IcpState;
  locked?: boolean;
  lockReason?: string;
  busy?: boolean;
  streaming?: { text: string; status: string } | null;
  minScore: number;
  maxRounds: number;
  onRun: () => void;
  onStop: () => void;
  onApply: (copy: string) => void;
  onChangeSettings: (patch: { minIcpScore?: number; maxIcpRounds?: number }) => void;
}

export function IcpCell({
  index,
  icp,
  locked,
  lockReason,
  busy,
  streaming,
  minScore,
  maxRounds,
  onRun,
  onStop,
  onApply,
  onChangeSettings,
}: IcpCellProps) {
  const isStreaming = !!streaming;
  const running = icp.status === "running";
  const hasRun = icp.rounds.length > 0 || icp.status === "done";
  const passed = icp.status === "done" && icp.finalScore >= minScore;

  return (
    <section
      className={cn(
        "term-surface rounded-lg border border-border",
        locked && "opacity-55",
        running && "border-primary/40",
      )}
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-md border border-border bg-secondary text-primary">
          <Gavel className="size-3.5" />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-wide">
            ICP Brutal Test
          </span>
          <span className="text-[11px] text-muted-foreground">
            Claude becomes the prospect, rates 1-10, and rewrites until it clears {minScore}+.
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Stepper
            label="pass ≥"
            value={minScore}
            min={5}
            max={10}
            disabled={busy}
            onChange={(v) => onChangeSettings({ minIcpScore: v })}
          />
          <Stepper
            label="max rounds"
            value={maxRounds}
            min={1}
            max={5}
            disabled={busy}
            onChange={(v) => onChangeSettings({ maxIcpRounds: v })}
          />
          <StatusBadge status={icp.status} />
        </div>
      </div>

      <div className="px-4 py-3">
        {locked ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Lock className="size-4" />
            {lockReason ?? "Generate copy first."}
          </div>
        ) : (
          <div className="space-y-3">
            {!hasRun && !isStreaming && (
              <div className="py-3 text-xs text-muted-foreground">
                Run the brutal test to pressure-test the copy from the prospect's
                chair. Each round scores the current copy, then rewrites the weak
                spots until it hits your bar.
              </div>
            )}

            {/* Round timeline */}
            {icp.rounds.map((r) => (
              <div
                key={r.round}
                className="rounded-md border border-border/60 bg-background/40 p-3"
              >
                <div className="mb-2 flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Round {r.round}</span>
                  <ScoreBadge score={r.score} min={minScore} />
                  <span
                    className={cn(
                      r.wouldReply ? "text-term-green" : "text-term-red",
                    )}
                  >
                    {r.wouldReply ? "would reply" : "would not reply"}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
                  {r.feedback}
                </div>
              </div>
            ))}

            {/* Live revise stream */}
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
                    working…
                  </div>
                )}
              </div>
            )}

            {icp.status === "error" && icp.error && !isStreaming && (
              <div className="rounded-md border border-term-red/50 bg-term-red/10 p-3 text-xs text-term-red">
                {icp.error}
              </div>
            )}

            {/* Final result */}
            {icp.status === "done" && icp.finalCopy && (
              <div
                className={cn(
                  "rounded-md border p-3",
                  passed
                    ? "border-term-green/50 bg-term-green/5"
                    : "border-term-amber/50 bg-term-amber/5",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">
                    {passed ? "Passed" : "Best effort"} —
                  </span>
                  <ScoreBadge score={icp.finalScore} min={minScore} />
                  {!passed && (
                    <span className="text-muted-foreground">
                      hit the round cap below {minScore}. Raise max rounds or send
                      manual feedback in the copy step.
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    <CopyButton text={icp.finalCopy} label="copy final" />
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => onApply(icp.finalCopy)}
                      disabled={busy}
                    >
                      <ArrowUpToLine className="size-3" /> apply to copy step
                    </Button>
                  </div>
                </div>
                <div className="rounded border border-border/50 bg-background/50 p-3">
                  <TerminalDoc text={icp.finalCopy} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!locked && (
        <div className="border-t border-border px-4 py-3">
          {isStreaming || running ? (
            <Button type="button" size="sm" variant="destructive" onClick={onStop}>
              <Square className="size-3" /> Stop
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={onRun}>
              <Play className="size-3" /> {hasRun ? "Re-run brutal test" : "Run brutal test"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
