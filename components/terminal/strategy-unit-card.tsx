"use client";

import * as React from "react";
import { Layers, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StrategyUnit } from "@/lib/types";

export function StrategyKindBadge({ kind }: { kind: StrategyUnit["kind"] }) {
  const isSignal = kind === "signal";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        isSignal
          ? "border-term-violet/50 bg-term-violet/10 text-term-violet"
          : "border-term-cyan/50 bg-term-cyan/10 text-term-cyan",
      )}
    >
      {isSignal ? <Radio className="size-2.5" /> : <Layers className="size-2.5" />}
      {isSignal ? "signal" : "fallback"}
    </span>
  );
}

export function StrategyUnitHeader({ unit }: { unit: StrategyUnit }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <span className="font-mono text-sm font-bold text-primary">{unit.id}</span>
      <span className="text-sm font-semibold">{unit.name}</span>
      <StrategyKindBadge kind={unit.kind} />
      {unit.kind === "signal" && unit.signalSourcing && (
        <span className="text-[11px] text-muted-foreground">
          Source: {unit.signalSourcing}
        </span>
      )}
    </div>
  );
}
