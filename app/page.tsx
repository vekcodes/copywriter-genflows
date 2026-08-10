"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { streamNdjson } from "@/lib/client-stream";
import { aggregateStrategyStatus, makeStrategyUnit } from "@/lib/project";
import type {
  ChatTurn,
  ClientProject,
  IcpRound,
  NodeId,
  NodeStatus,
  StrategyListResponseBody,
  StrategyUnit,
} from "@/lib/types";
import { Sidebar } from "@/components/terminal/sidebar";
import { OnboardPanel } from "@/components/terminal/onboard-panel";
import { NodeCell } from "@/components/terminal/node-cell";
import { IcpCell } from "@/components/terminal/icp-cell";
import { StrategyUnitHeader } from "@/components/terminal/strategy-unit-card";
import { Stepper, StatusDot } from "@/components/terminal/bits";
import { Button } from "@/components/ui/button";
import { FileDown, ListRestart, Play } from "lucide-react";

type FlowNode = "research" | "strategy";

const WORD_MODES: { v: ClientProject["settings"]["wordLimitMode"]; l: string }[] = [
  { v: "strict", l: "≤80 strict" },
  { v: "auto", l: "auto" },
  { v: "explain", l: "explain" },
];

// ─── Seed builders ─────────────────────────────────────────────────────────

function buildResearchSeed(p: ClientProject, extra: string): string {
  return `Client: ${p.name}
Website: ${p.website || "(none provided)"}

Value proposition (from onboarding — authoritative if given):
${p.valueProp || "(not provided — infer from onboarding docs/site if possible)"}

Offers (from onboarding — authoritative if given; the ONLY offers later strategies may use):
${p.offers || "(not provided — extract from onboarding docs/site if possible)"}

Onboarding docs / questionnaire:
${p.onboardingDocs || "(none provided)"}
${p.strategyIdea ? `\nOur initial strategy idea:\n${p.strategyIdea}\n` : ""}
Research this client thoroughly and produce the research brief. If a website is provided, fetch it. Verify any statistics with credible sources.${
    extra ? `\n\nAdditional instruction: ${extra}` : ""
  }`;
}

function buildStrategySeed(p: ClientProject, extra: string): string {
  return `RESEARCH BRIEF for ${p.name}:
---
${p.research.output}
---
${p.strategyIdea ? `\nOur initial strategy idea to consider:\n${p.strategyIdea}\n` : ""}
Build the full set of outreach strategies now — signal-based (micro) and fallback (macro), aiming for roughly ${p.settings.signalRatio}% signal-based. Include the ranking table, top recommendations, and the strategic guidance for copy. Label every strategy S1, S2... (fallback) or SS1, SS2... (signal) per your instructions.${
    extra ? `\n\nAdditional instruction: ${extra}` : ""
  }`;
}

function buildStrategyCopySeed(p: ClientProject, unit: StrategyUnit, extra: string): string {
  return `RESEARCH BRIEF:
---
${p.research.output}
---

STRATEGY DOC (full, for context — but write for ONLY the one strategy named below):
---
${p.strategy.output}
---

Write the full copy set for EXACTLY this one strategy: **${unit.id} — ${unit.name}** (${
    unit.kind === "signal" ? "signal-based" : "fallback"
  }).${unit.signalSourcing ? ` Signal sourcing: ${unit.signalSourcing}` : ""} Do not write for any other strategy in the doc.${
    extra ? `\n\nAdditional instruction: ${extra}` : ""
  }`;
}

function clientContextFor(p: ClientProject): string {
  return `Client: ${p.name}\n\nResearch brief:\n${p.research.output}`;
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const { projects, active, activeId, setActiveId, create, remove, update, loaded } =
    useProjects();

  const [live, setLive] = React.useState<{
    node: NodeId;
    strategyId?: string;
    text: string;
    status: string;
  } | null>(null);
  const [runningAll, setRunningAll] = React.useState(false);
  const [extracting, setExtracting] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const runRef = React.useRef<{
    nodeId: FlowNode | "copywriting";
    strategyId?: string;
    acc: string;
    baseTurns: ChatTurn[];
  } | null>(null);
  const sanitized = React.useRef(false);

  // One-time cleanup of anything left in "running" from a previous session.
  React.useEffect(() => {
    if (!loaded || sanitized.current) return;
    sanitized.current = true;
    projects.forEach((p) => {
      const fix = (s: string, hasOut: boolean) =>
        s === "running" ? (hasOut ? "done" : "idle") : s;
      const patch: Partial<ClientProject> = {};
      let changed = false;
      (["research", "strategy"] as const).forEach((k) => {
        const next = fix(p[k].status, !!p[k].output);
        if (next !== p[k].status) {
          (patch as any)[k] = { ...p[k], status: next };
          changed = true;
        }
      });
      const fixStatus = (s: NodeStatus, hasOut: boolean): NodeStatus =>
        s === "running" ? (hasOut ? "done" : "idle") : s;
      const fixedStrategies = p.strategies?.map((u) => ({
        ...u,
        copy: { ...u.copy, status: fixStatus(u.copy.status, !!u.copy.output) },
        icp: { ...u.icp, status: fixStatus(u.icp.status, u.icp.rounds.length > 0) },
      }));
      if (fixedStrategies && JSON.stringify(fixedStrategies) !== JSON.stringify(p.strategies)) {
        patch.strategies = fixedStrategies;
        changed = true;
      }
      if (changed) update(p.id, patch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const busy = live !== null || runningAll;

  const updateStrategy = React.useCallback(
    (projectId: string, strategyId: string, patch: (u: StrategyUnit) => StrategyUnit) => {
      update(projectId, (prev) => ({
        ...prev,
        strategies: prev.strategies.map((u) => (u.id === strategyId ? patch(u) : u)),
      }));
    },
    [update],
  );

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    const r = runRef.current;
    if (r && activeId) {
      const finalTurns = [...r.baseTurns, { role: "assistant" as const, content: r.acc }];
      if (r.strategyId) {
        updateStrategy(activeId, r.strategyId, (u) => ({
          ...u,
          copy: {
            ...u.copy,
            status: r.acc ? "done" : "idle",
            output: r.acc || u.copy.output,
            turns: r.acc ? finalTurns : u.copy.turns,
          },
        }));
      } else {
        update(activeId, (prev) => ({
          ...prev,
          [r.nodeId as FlowNode]: {
            ...prev[r.nodeId as FlowNode],
            status: r.acc ? "done" : "idle",
            output: r.acc || prev[r.nodeId as FlowNode].output,
            turns: r.acc ? finalTurns : prev[r.nodeId as FlowNode].turns,
          },
        }));
      }
    } else if (activeId && live?.node === "icp" && live.strategyId) {
      updateStrategy(activeId, live.strategyId, (u) => ({
        ...u,
        icp:
          u.icp.status === "running"
            ? { ...u.icp, status: u.icp.rounds.length ? "done" : "idle" }
            : u.icp,
      }));
    }
    runRef.current = null;
    abortRef.current = null;
    setLive(null);
  }, [activeId, update, updateStrategy, live]);

  const handleSelect = (id: string) => {
    if (busy) stop();
    setActiveId(id);
  };

  const extractStrategies = React.useCallback(
    async (projectId: string, strategyOutput: string) => {
      setExtracting(true);
      try {
        const res = await fetch("/api/strategy-list", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ strategyOutput }),
        });
        if (!res.ok) throw new Error(`Failed to read the strategy list (${res.status})`);
        const data = (await res.json()) as StrategyListResponseBody;
        update(projectId, (prev) => ({
          ...prev,
          strategies: data.strategies.map((s) => makeStrategyUnit(s)),
        }));
        toast.success(`Found ${data.strategies.length} strategies — ready to write + brutal-test`);
      } catch (err: any) {
        toast.error(err?.message ?? "Could not read the strategy list");
      } finally {
        setExtracting(false);
      }
    },
    [update],
  );

  const runNode = async (nodeId: FlowNode, feedback: string) => {
    if (!active || busy) return;
    const p = active;
    const node = p[nodeId];
    const hasAssistant = node.turns.some((t) => t.role === "assistant");
    const refine = hasAssistant && feedback.trim() !== "";

    let baseTurns: ChatTurn[];
    if (refine) {
      baseTurns = [...node.turns, { role: "user", content: feedback.trim() }];
    } else {
      const seed =
        nodeId === "research" ? buildResearchSeed(p, feedback.trim()) : buildStrategySeed(p, feedback.trim());
      baseTurns = [{ role: "user", content: seed }];
    }

    update(p.id, (prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], status: "running", error: undefined, turns: baseTurns },
    }));
    setLive({ node: nodeId, text: "", status: "" });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    runRef.current = { nodeId, acc: "", baseTurns };

    await streamNdjson(
      `/api/${nodeId}`,
      { messages: baseTurns, web: true, settings: p.settings },
      (f) => {
        if (f.t === "token") {
          if (runRef.current) runRef.current.acc += f.text;
          setLive((l) => (l ? { ...l, text: runRef.current?.acc ?? l.text } : l));
        } else if (f.t === "status") {
          setLive((l) => (l ? { ...l, status: f.msg } : l));
        } else if (f.t === "error") {
          update(p.id, (prev) => ({
            ...prev,
            [nodeId]: { ...prev[nodeId], status: "error", error: f.msg },
          }));
          runRef.current = null;
          setLive(null);
        } else if (f.t === "done") {
          const acc = runRef.current?.acc ?? "";
          update(p.id, (prev) => ({
            ...prev,
            [nodeId]: {
              ...prev[nodeId],
              status: "done",
              output: acc,
              turns: [...baseTurns, { role: "assistant", content: acc }],
              error: undefined,
            },
          }));
          runRef.current = null;
          setLive(null);
          if (nodeId === "strategy" && acc.trim()) {
            extractStrategies(p.id, acc);
          }
        }
      },
      ctrl.signal,
    );
    abortRef.current = null;
  };

  /** Writes copy for exactly one strategy. Returns the written text (for chaining in runAllStrategies). */
  const runStrategyCopy = React.useCallback(
    async (unit: StrategyUnit, feedback: string): Promise<string> => {
      if (!active || (busy && !runningAll)) return "";
      const p = active;
      const hasAssistant = unit.copy.turns.some((t) => t.role === "assistant");
      const refine = hasAssistant && feedback.trim() !== "";
      const baseTurns: ChatTurn[] = refine
        ? [...unit.copy.turns, { role: "user", content: feedback.trim() }]
        : [{ role: "user", content: buildStrategyCopySeed(p, unit, feedback.trim()) }];

      updateStrategy(p.id, unit.id, (u) => ({
        ...u,
        copy: { ...u.copy, status: "running", error: undefined, turns: baseTurns },
      }));
      setLive({ node: "copywriting", strategyId: unit.id, text: "", status: "" });

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      runRef.current = { nodeId: "copywriting", strategyId: unit.id, acc: "", baseTurns };

      let result = "";
      await streamNdjson(
        "/api/copywriting",
        { messages: baseTurns, web: false, settings: p.settings },
        (f) => {
          if (f.t === "token") {
            if (runRef.current) runRef.current.acc += f.text;
            setLive((l) => (l ? { ...l, text: runRef.current?.acc ?? l.text } : l));
          } else if (f.t === "status") {
            setLive((l) => (l ? { ...l, status: f.msg } : l));
          } else if (f.t === "error") {
            updateStrategy(p.id, unit.id, (u) => ({
              ...u,
              copy: { ...u.copy, status: "error", error: f.msg },
            }));
            runRef.current = null;
            setLive(null);
          } else if (f.t === "done") {
            result = runRef.current?.acc ?? "";
            updateStrategy(p.id, unit.id, (u) => ({
              ...u,
              copy: {
                ...u.copy,
                status: "done",
                output: result,
                turns: [...baseTurns, { role: "assistant", content: result }],
                error: undefined,
              },
            }));
            runRef.current = null;
            setLive(null);
          }
        },
        ctrl.signal,
      );
      abortRef.current = null;
      return result;
    },
    [active, busy, runningAll, updateStrategy],
  );

  /** Runs the ICP brutal test for exactly one strategy's copy. */
  const runStrategyIcp = React.useCallback(
    async (unit: StrategyUnit, copyOverride?: string): Promise<void> => {
      if (!active || (busy && !runningAll)) return;
      const p = active;
      const copyText = copyOverride ?? unit.copy.output;
      if (!copyText) return;

      updateStrategy(p.id, unit.id, (u) => ({
        ...u,
        icp: { status: "running", rounds: [], finalCopy: "", finalScore: 0 },
      }));
      setLive({ node: "icp", strategyId: unit.id, text: "", status: "" });

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      runRef.current = null;

      const rounds: IcpRound[] = [];
      let finalCopy = copyText;
      let finalScore = 0;
      let acc = "";

      await streamNdjson(
        "/api/icp",
        {
          copy: copyText,
          strategyContext: `This copy is for strategy ${unit.id} — ${unit.name} (${
            unit.kind === "signal" ? "signal-based" : "fallback"
          }).\n\n${p.strategy.output}`,
          clientContext: clientContextFor(p),
          minScore: p.settings.minIcpScore,
          maxRounds: p.settings.maxIcpRounds,
          wordLimitMode: p.settings.wordLimitMode,
        },
        (f) => {
          if (f.t === "status") {
            setLive((l) => (l ? { ...l, status: f.msg } : l));
          } else if (f.t === "token") {
            acc += f.text;
            setLive((l) => (l ? { ...l, text: acc } : l));
          } else if (f.t === "icp") {
            rounds.push(f.round);
            acc = "";
            updateStrategy(p.id, unit.id, (u) => ({
              ...u,
              icp: { ...u.icp, status: "running", rounds: [...rounds] },
            }));
            setLive((l) => (l ? { ...l, text: "" } : l));
          } else if (f.t === "final") {
            finalCopy = f.copy;
            finalScore = f.score;
          } else if (f.t === "error") {
            updateStrategy(p.id, unit.id, (u) => ({
              ...u,
              icp: { ...u.icp, status: "error", error: f.msg },
            }));
            setLive(null);
          } else if (f.t === "done") {
            updateStrategy(p.id, unit.id, (u) => ({
              ...u,
              icp: { ...u.icp, status: "done", rounds: [...rounds], finalCopy, finalScore },
            }));
            setLive(null);
          }
        },
        ctrl.signal,
      );
      abortRef.current = null;
    },
    [active, busy, runningAll, updateStrategy],
  );

  /** Writes + brutal-tests every strategy Strategy recommended, one at a time. */
  const runAllStrategies = React.useCallback(async () => {
    if (!active || busy || !active.strategies.length) return;
    setRunningAll(true);
    try {
      for (const unit of active.strategies) {
        let copyText = unit.copy.output;
        if (!copyText) {
          copyText = await runStrategyCopy(unit, "");
        }
        if (copyText && !unit.icp.finalCopy) {
          await runStrategyIcp(unit, copyText);
        }
      }
      toast.success("Finished writing + brutal-testing every strategy");
    } finally {
      setRunningAll(false);
    }
  }, [active, busy, runStrategyCopy, runStrategyIcp]);

  const applyIcpCopyToStrategy = (strategyId: string, copy: string) => {
    if (!activeId) return;
    updateStrategy(activeId, strategyId, (u) => ({
      ...u,
      copy: {
        ...u.copy,
        output: copy,
        status: "done",
        turns: [
          ...u.copy.turns,
          { role: "user", content: "[Applied improved copy from the ICP brutal test]" },
          { role: "assistant", content: copy },
        ],
      },
    }));
    toast.success("Improved copy applied");
  };

  const streamFor = (n: NodeId, strategyId?: string) =>
    live && live.node === n && live.strategyId === strategyId ? { text: live.text, status: live.status } : null;

  const downloadDocx = async () => {
    if (!active) return;
    const withCopy = active.strategies.filter((u) => u.copy.output);
    if (!withCopy.length) return;
    try {
      const res = await fetch("/api/export-docx", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientName: active.name,
          website: active.website,
          minIcpScore: active.settings.minIcpScore,
          strategies: withCopy.map((u) => ({
            id: u.id,
            name: u.name,
            kind: u.kind,
            signalSourcing: u.signalSourcing,
            copy: u.copy.output,
            icpFinalCopy: u.icp.finalCopy || undefined,
            icpFinalScore: u.icp.finalScore || undefined,
          })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const slug =
        active.name
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "") || "client";
      a.href = url;
      a.download = `${slug}-copy.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.message ?? "Export failed");
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const fallbackUnits = active?.strategies.filter((u) => u.kind === "fallback") ?? [];
  const signalUnits = active?.strategies.filter((u) => u.kind === "signal") ?? [];
  const hasAnyCopy = (active?.strategies ?? []).some((u) => u.copy.output);
  const copyStatus = active ? aggregateStrategyStatus(active.strategies, "copy") : "idle";
  const icpStatus = active ? aggregateStrategyStatus(active.strategies, "icp") : "idle";

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <Sidebar
        projects={projects}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={() => setActiveId(null)}
        onDelete={remove}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {!loaded ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            loading…
          </div>
        ) : !active ? (
          <div className="flex-1 overflow-y-auto px-6">
            <OnboardPanel onCreate={create} />
          </div>
        ) : (
          <>
            {/* Workspace header + pipeline rail */}
            <header className="border-b border-border px-6 py-3">
              <div className="flex items-center gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-base font-bold">{active.name}</h1>
                  {active.website && (
                    <a
                      href={active.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                    >
                      {active.website}
                    </a>
                  )}
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {(
                      [
                        ["research", active.research.status],
                        ["strategy", active.strategy.status],
                        ["copy", copyStatus],
                        ["icp test", icpStatus],
                      ] as const
                    ).map(([label, status], i) => (
                      <React.Fragment key={label}>
                        {i > 0 && <span className="text-border">──</span>}
                        <span className="flex items-center gap-1">
                          <StatusDot status={status} />
                          {label}
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasAnyCopy}
                    onClick={downloadDocx}
                    title={
                      hasAnyCopy
                        ? "Download every strategy's copy as one consolidated Word doc"
                        : "Write copy for at least one strategy first"
                    }
                  >
                    <FileDown className="size-3.5" /> Download DOCX
                  </Button>
                </div>
              </div>
            </header>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <NodeCell
                index={1}
                title="Research"
                hint="Deep client analysis, ICP, offers, verified pains, competitors, psychographics"
                node={active.research}
                streaming={streamFor("research")}
                busy={busy}
                firstRunLabel="Run research from the website + onboarding docs"
                placeholder="Run research, or add a specific instruction (Enter to run)…"
                onRun={(fb) => runNode("research", fb)}
                onStop={stop}
              />

              <NodeCell
                index={2}
                title="Strategy"
                hint="Signal-based (SS) + fallback (S) strategies, ranked, with copy guidance"
                node={active.strategy}
                streaming={streamFor("strategy")}
                busy={busy}
                locked={!active.research.output}
                lockReason="Run Research first — strategies are built from the brief."
                firstRunLabel="Build strategies from the research brief"
                placeholder="Build strategies, or steer the mix / focus (Enter to run)…"
                onRun={(fb) => runNode("strategy", fb)}
                onStop={stop}
                headerExtra={
                  <Stepper
                    label="signal mix"
                    value={active.settings.signalRatio}
                    min={0}
                    max={100}
                    step={10}
                    suffix="%"
                    disabled={busy}
                    onChange={(v) =>
                      update(active.id, (prev) => ({
                        ...prev,
                        settings: { ...prev.settings, signalRatio: v },
                      }))
                    }
                  />
                }
              />

              {active.strategy.output && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card/40 px-4 py-2.5">
                    <span className="text-sm font-semibold">
                      Strategies ({active.strategies.length})
                    </span>
                    <Stepper
                      label="versions"
                      value={active.settings.versionCount}
                      min={3}
                      max={8}
                      disabled={busy}
                      onChange={(v) =>
                        update(active.id, (prev) => ({
                          ...prev,
                          settings: { ...prev.settings, versionCount: v },
                        }))
                      }
                    />
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>words</span>
                      <div className="flex overflow-hidden rounded-md border border-border">
                        {WORD_MODES.map((m) => (
                          <button
                            key={m.v}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              update(active.id, (prev) => ({
                                ...prev,
                                settings: { ...prev.settings, wordLimitMode: m.v },
                              }))
                            }
                            className={cn(
                              "px-2 py-0.5 text-[11px] transition-colors",
                              active.settings.wordLimitMode === m.v
                                ? "bg-primary text-primary-foreground"
                                : "text-foreground hover:bg-secondary",
                            )}
                          >
                            {m.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || extracting}
                        onClick={() => extractStrategies(active.id, active.strategy.output)}
                      >
                        <ListRestart className="size-3.5" />
                        {extracting ? "Reading…" : "Re-scan strategies"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !active.strategies.length}
                        onClick={runAllStrategies}
                      >
                        <Play className="size-3.5" />
                        {runningAll ? "Running…" : "Write + brutal-test all"}
                      </Button>
                    </div>
                  </div>

                  {extracting && !active.strategies.length && (
                    <p className="px-1 text-xs text-muted-foreground">
                      Reading the strategy list…
                    </p>
                  )}

                  {!extracting && active.strategy.output && !active.strategies.length && (
                    <p className="px-1 text-xs text-muted-foreground">
                      No strategies extracted yet — click "Re-scan strategies" above.
                    </p>
                  )}

                  {fallbackUnits.length > 0 && (
                    <div className="space-y-3">
                      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-term-cyan">
                        Fallback (S) — no signal needed
                      </div>
                      {fallbackUnits.map((unit) => (
                        <StrategyBlock
                          key={unit.id}
                          unit={unit}
                          busy={busy}
                          streamFor={streamFor}
                          minScore={active.settings.minIcpScore}
                          maxRounds={active.settings.maxIcpRounds}
                          onRunCopy={(fb) => runStrategyCopy(unit, fb)}
                          onRunIcp={() => runStrategyIcp(unit)}
                          onStop={stop}
                          onApplyIcp={(copy) => applyIcpCopyToStrategy(unit.id, copy)}
                          onChangeIcpSettings={(patch) =>
                            update(active.id, (prev) => ({
                              ...prev,
                              settings: { ...prev.settings, ...patch },
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}

                  {signalUnits.length > 0 && (
                    <div className="space-y-3">
                      <div className="px-1 text-[11px] font-semibold uppercase tracking-wide text-term-violet">
                        Signal-Based (SS) — needs live trigger data
                      </div>
                      {signalUnits.map((unit) => (
                        <StrategyBlock
                          key={unit.id}
                          unit={unit}
                          busy={busy}
                          streamFor={streamFor}
                          minScore={active.settings.minIcpScore}
                          maxRounds={active.settings.maxIcpRounds}
                          onRunCopy={(fb) => runStrategyCopy(unit, fb)}
                          onRunIcp={() => runStrategyIcp(unit)}
                          onStop={stop}
                          onApplyIcp={(copy) => applyIcpCopyToStrategy(unit.id, copy)}
                          onChangeIcpSettings={(patch) =>
                            update(active.id, (prev) => ({
                              ...prev,
                              settings: { ...prev.settings, ...patch },
                            }))
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="h-6" />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ─── Per-strategy block: copy cell + brutal-test cell, labeled S#/SS# ──────

function StrategyBlock({
  unit,
  busy,
  streamFor,
  minScore,
  maxRounds,
  onRunCopy,
  onRunIcp,
  onStop,
  onApplyIcp,
  onChangeIcpSettings,
}: {
  unit: StrategyUnit;
  busy: boolean;
  streamFor: (n: NodeId, strategyId?: string) => { text: string; status: string } | null;
  minScore: number;
  maxRounds: number;
  onRunCopy: (feedback: string) => void;
  onRunIcp: () => void;
  onStop: () => void;
  onApplyIcp: (copy: string) => void;
  onChangeIcpSettings: (patch: { minIcpScore?: number; maxIcpRounds?: number }) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-card/20 p-3">
      <StrategyUnitHeader unit={unit} />
      <NodeCell
        index={1}
        title="Copywriting"
        hint={`Full version set for ${unit.id}`}
        node={unit.copy}
        streaming={streamFor("copywriting", unit.id)}
        busy={busy}
        firstRunLabel={`Write copy for ${unit.id} — ${unit.name}`}
        placeholder="Add a specific instruction, or leave blank to write (Enter to run)…"
        onRun={onRunCopy}
        onStop={onStop}
      />
      <IcpCell
        index={2}
        title={`${unit.id} Brutal Test`}
        icp={unit.icp}
        streaming={streamFor("icp", unit.id)}
        busy={busy}
        locked={!unit.copy.output}
        lockReason="Write copy for this strategy first."
        minScore={minScore}
        maxRounds={maxRounds}
        onRun={onRunIcp}
        onStop={onStop}
        onApply={onApplyIcp}
        onChangeSettings={onChangeIcpSettings}
      />
    </div>
  );
}
