import {
  DEFAULT_SETTINGS,
  type ClientProject,
  type IcpState,
  type NodeState,
  type NodeStatus,
  type StrategyKind,
  type StrategyUnit,
} from "./types";

export const emptyNode = (): NodeState => ({
  status: "idle",
  output: "",
  turns: [],
});

export const emptyIcp = (): IcpState => ({
  status: "idle",
  rounds: [],
  finalCopy: "",
  finalScore: 0,
});

export function makeStrategyUnit(input: {
  id: string;
  name: string;
  kind: StrategyKind;
  signalSourcing?: string;
}): StrategyUnit {
  return {
    id: input.id,
    name: input.name,
    kind: input.kind,
    signalSourcing: input.signalSourcing,
    copy: emptyNode(),
    icp: emptyIcp(),
  };
}

/** Rolls up per-strategy copy/icp status into one dot for the header/sidebar. */
export function aggregateStrategyStatus(
  units: StrategyUnit[],
  key: "copy" | "icp",
): NodeStatus {
  if (!units.length) return "idle";
  if (units.some((u) => u[key].status === "error")) return "error";
  if (units.some((u) => u[key].status === "running")) return "running";
  if (units.every((u) => u[key].status === "done")) return "done";
  return "idle";
}

export function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function makeProject(input: {
  name: string;
  website: string;
  valueProp?: string;
  offers?: string;
  onboardingDocs: string;
  strategyIdea: string;
}): ClientProject {
  const now = Date.now();
  return {
    id: newId(),
    name: input.name.trim() || "Untitled client",
    website: input.website.trim(),
    valueProp: input.valueProp?.trim() ?? "",
    offers: input.offers?.trim() ?? "",
    onboardingDocs: input.onboardingDocs,
    strategyIdea: input.strategyIdea,
    createdAt: now,
    updatedAt: now,
    research: emptyNode(),
    strategy: emptyNode(),
    strategies: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
