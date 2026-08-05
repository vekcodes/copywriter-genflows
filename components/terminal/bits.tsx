"use client";

import * as React from "react";
import { Check, Copy, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { NodeStatus } from "@/lib/types";

export function StatusDot({ status }: { status: NodeStatus }) {
  const map: Record<NodeStatus, string> = {
    idle: "bg-muted-foreground/40",
    running: "bg-term-amber animate-pulse",
    done: "bg-term-green",
    error: "bg-term-red",
  };
  return <span className={cn("inline-block size-2 rounded-full", map[status])} />;
}

export function StatusBadge({ status }: { status: NodeStatus }) {
  const label: Record<NodeStatus, string> = {
    idle: "idle",
    running: "running",
    done: "ready",
    error: "error",
  };
  const color: Record<NodeStatus, string> = {
    idle: "text-muted-foreground",
    running: "text-term-amber",
    done: "text-term-green",
    error: "text-term-red",
  };
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", color[status])}>
      {status === "running" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <StatusDot status={status} />
      )}
      {label[status]}
    </span>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{label}</span>
      <div className="flex items-center rounded-md border border-border">
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(clamp(value - step))}
          className="px-1.5 py-0.5 text-foreground disabled:opacity-30"
        >
          <Minus className="size-3" />
        </button>
        <span className="min-w-8 text-center font-semibold text-foreground tabular-nums">
          {value}
          {suffix}
        </span>
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(clamp(value + step))}
          className="px-1.5 py-0.5 text-foreground disabled:opacity-30"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}

export function CopyButton({
  text,
  label = "copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn("text-muted-foreground hover:text-foreground", className)}
      disabled={!text}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success("Copied to clipboard");
          setTimeout(() => setDone(false), 1200);
        } catch {
          toast.error("Copy failed");
        }
      }}
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      {label}
    </Button>
  );
}
