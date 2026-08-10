"use client";

import * as React from "react";
import { Plus, Trash2, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ClientProject } from "@/lib/types";
import { aggregateStrategyStatus } from "@/lib/project";
import { StatusDot } from "./bits";

function relTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function Sidebar({
  projects,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  projects: ClientProject[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-card/40">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Terminal className="size-4 text-primary" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-bold tracking-tight">GenFlows</span>
          <span className="text-[10px] text-muted-foreground">
            copywriter-agent
          </span>
        </div>
      </div>

      <div className="p-3">
        <Button
          type="button"
          size="sm"
          className="w-full justify-start"
          onClick={onNew}
        >
          <Plus className="size-3.5" /> New client
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Clients ({projects.length})
        </div>
        {projects.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            No clients yet. Onboard one to start the pipeline.
          </p>
        )}
        <ul className="space-y-0.5">
          {projects.map((p) => {
            const statuses = [
              p.research.status,
              p.strategy.status,
              aggregateStrategyStatus(p.strategies, "copy"),
              aggregateStrategyStatus(p.strategies, "icp"),
            ];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                    p.id === activeId
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{p.name}</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {statuses.map((s, i) => (
                        <StatusDot key={i} status={s} />
                      ))}
                      <span className="ml-1">{relTime(p.updatedAt)}</span>
                    </span>
                  </div>
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                        onDelete(p.id);
                      }
                    }}
                    className="opacity-0 transition-opacity hover:text-term-red group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        Research → Strategy → Copy → ICP test
      </div>
    </aside>
  );
}
