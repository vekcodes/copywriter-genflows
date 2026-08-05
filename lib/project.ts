import {
  DEFAULT_SETTINGS,
  type ClientProject,
  type IcpState,
  type NodeState,
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
  onboardingDocs: string;
  strategyIdea: string;
}): ClientProject {
  const now = Date.now();
  return {
    id: newId(),
    name: input.name.trim() || "Untitled client",
    website: input.website.trim(),
    onboardingDocs: input.onboardingDocs,
    strategyIdea: input.strategyIdea,
    createdAt: now,
    updatedAt: now,
    research: emptyNode(),
    strategy: emptyNode(),
    copywriting: emptyNode(),
    icp: emptyIcp(),
    settings: { ...DEFAULT_SETTINGS },
  };
}
