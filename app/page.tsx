"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/use-projects";
import { streamNdjson } from "@/lib/client-stream";
import type { ChatTurn, ClientProject, IcpRound, NodeId } from "@/lib/types";
import { Sidebar } from "@/components/terminal/sidebar";
import { OnboardPanel } from "@/components/terminal/onboard-panel";
import { NodeCell } from "@/components/terminal/node-cell";
import { IcpCell } from "@/components/terminal/icp-cell";
import { Stepper, StatusDot } from "@/components/terminal/bits";

type FlowNode = "research" | "strategy" | "copywriting";

const WORD_MODES: { v: ClientProject["settings"]["wordLimitMode"]; l: string }[] = [
  { v: "strict", l: "≤80 strict" },
  { v: "auto", l: "auto" },
  { v: "explain", l: "explain" },
];

// ─── Seed builders ─────────────────────────────────────────────────────────

function buildResearchSeed(p: ClientProject, extra: string): string {
  return `Client: ${p.name}
Website: ${p.website || "(none provided)"}

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
Build the full set of outreach strategies now — signal-based (micro) and fallback (macro), aiming for roughly ${p.settings.signalRatio}% signal-based. Include the ranking table, top recommendations, and the strategic guidance for copy.${
    extra ? `\n\nAdditional instruction: ${extra}` : ""
  }`;
}

function buildCopySeed(p: ClientProject, target: string): string {
  return `RESEARCH BRIEF:
---
${p.research.output}
---

STRATEGY DOC:
---
${p.strategy.output}
---

Write cold-email copy for: ${target || "the top 3 recommended strategies"}.`;
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
    text: string;
    status: string;
  } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const runRef = React.useRef<{ nodeId: FlowNode; acc: string; baseTurns: ChatTurn[] } | null>(
    null,
  );
  const sanitized = React.useRef(false);

  // One-time cleanup of any node left in "running" from a previous session.
  React.useEffect(() => {
    if (!loaded || sanitized.current) return;
    sanitized.current = true;
    projects.forEach((p) => {
      const fix = (s: string, hasOut: boolean) =>
        s === "running" ? (hasOut ? "done" : "idle") : s;
      const patch: Partial<ClientProject> = {};
      let changed = false;
      (["research", "strategy", "copywriting"] as const).forEach((k) => {
        const next = fix(p[k].status, !!p[k].output);
        if (next !== p[k].status) {
          (patch as any)[k] = { ...p[k], status: next };
          changed = true;
        }
      });
      if (p.icp.status === "running") {
        patch.icp = {
          ...p.icp,
          status: p.icp.rounds.length ? "done" : "idle",
        };
        changed = true;
      }
      if (changed) update(p.id, patch);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const busy = live !== null;

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    const r = runRef.current;
    if (r && activeId) {
      update(activeId, (prev) => {
        const finalTurns = [
          ...r.baseTurns,
          { role: "assistant" as const, content: r.acc },
        ];
        return {
          ...prev,
          [r.nodeId]: {
            ...prev[r.nodeId],
            status: r.acc ? "done" : "idle",
            output: r.acc || prev[r.nodeId].output,
            turns: r.acc ? finalTurns : prev[r.nodeId].turns,
          },
        };
      });
    } else if (activeId) {
      // ICP or empty run — just mark not-running.
      update(activeId, (prev) => ({
        ...prev,
        icp:
          prev.icp.status === "running"
            ? { ...prev.icp, status: prev.icp.rounds.length ? "done" : "idle" }
            : prev.icp,
      }));
    }
    runRef.current = null;
    abortRef.current = null;
    setLive(null);
  }, [activeId, update]);

  const handleSelect = (id: string) => {
    if (busy) stop();
    setActiveId(id);
  };

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
        nodeId === "research"
          ? buildResearchSeed(p, feedback.trim())
          : nodeId === "strategy"
            ? buildStrategySeed(p, feedback.trim())
            : buildCopySeed(p, feedback.trim());
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
      { messages: baseTurns, web: nodeId !== "copywriting", settings: p.settings },
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
        }
      },
      ctrl.signal,
    );
    abortRef.current = null;
  };

  const runIcp = async () => {
    if (!active || busy) return;
    const p = active;
    if (!p.copywriting.output) return;

    update(p.id, (prev) => ({
      ...prev,
      icp: { status: "running", rounds: [], finalCopy: "", finalScore: 0 },
    }));
    setLive({ node: "icp", text: "", status: "" });

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    runRef.current = null;

    const rounds: IcpRound[] = [];
    let finalCopy = p.copywriting.output;
    let finalScore = 0;
    let acc = "";

    await streamNdjson(
      "/api/icp",
      {
        copy: p.copywriting.output,
        strategyContext: p.strategy.output,
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
          update(p.id, (prev) => ({
            ...prev,
            icp: { ...prev.icp, status: "running", rounds: [...rounds] },
          }));
          setLive((l) => (l ? { ...l, text: "" } : l));
        } else if (f.t === "final") {
          finalCopy = f.copy;
          finalScore = f.score;
        } else if (f.t === "error") {
          update(p.id, (prev) => ({
            ...prev,
            icp: { ...prev.icp, status: "error", error: f.msg },
          }));
          setLive(null);
        } else if (f.t === "done") {
          update(p.id, (prev) => ({
            ...prev,
            icp: {
              ...prev.icp,
              status: "done",
              rounds: [...rounds],
              finalCopy,
              finalScore,
            },
          }));
          setLive(null);
        }
      },
      ctrl.signal,
    );
    abortRef.current = null;
  };

  const applyIcpCopy = (copy: string) => {
    if (!activeId) return;
    update(activeId, (prev) => ({
      ...prev,
      copywriting: {
        ...prev.copywriting,
        output: copy,
        status: "done",
        turns: [
          ...prev.copywriting.turns,
          { role: "user", content: "[Applied improved copy from the ICP brutal test]" },
          { role: "assistant", content: copy },
        ],
      },
    }));
    toast.success("Improved copy applied to the Copywriting step");
  };

  const streamFor = (n: NodeId) =>
    live && live.node === n ? { text: live.text, status: live.status } : null;

  // ─── Render ──────────────────────────────────────────────────────────────

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
                <div className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground">
                  {(
                    [
                      ["research", "research"],
                      ["strategy", "strategy"],
                      ["copywriting", "copy"],
                      ["icp", "icp test"],
                    ] as const
                  ).map(([k, label], i) => (
                    <React.Fragment key={k}>
                      {i > 0 && <span className="text-border">──</span>}
                      <span className="flex items-center gap-1">
                        <StatusDot status={active[k].status} />
                        {label}
                      </span>
                    </React.Fragment>
                  ))}
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
                hint="Signal-based + fallback strategies, ranked, with copy guidance"
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

              <NodeCell
                index={3}
                title="Copywriting"
                hint="Full version set per strategy, fused prompts + knowledge base"
                node={active.copywriting}
                streaming={streamFor("copywriting")}
                busy={busy}
                locked={!active.strategy.output}
                lockReason="Build Strategy first — copy is written per strategy."
                firstRunLabel='Type which strategies to write (e.g. "strategy 1 and 3", "top 3"), then Run'
                placeholder='Which strategies? e.g. "the top 3 recommended" or "strategy 2 & 5" (Enter to run)…'
                onRun={(fb) => runNode("copywriting", fb)}
                onStop={stop}
                headerExtra={
                  <div className="flex items-center gap-3">
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
                  </div>
                }
              />

              <IcpCell
                index={4}
                icp={active.icp}
                streaming={streamFor("icp")}
                busy={busy}
                locked={!active.copywriting.output}
                lockReason="Generate copy first, then pressure-test it."
                minScore={active.settings.minIcpScore}
                maxRounds={active.settings.maxIcpRounds}
                onRun={runIcp}
                onStop={stop}
                onApply={applyIcpCopy}
                onChangeSettings={(patch) =>
                  update(active.id, (prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      ...(patch.minIcpScore !== undefined
                        ? { minIcpScore: patch.minIcpScore }
                        : {}),
                      ...(patch.maxIcpRounds !== undefined
                        ? { maxIcpRounds: patch.maxIcpRounds }
                        : {}),
                    },
                  }))
                }
              />

              <div className="h-6" />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
