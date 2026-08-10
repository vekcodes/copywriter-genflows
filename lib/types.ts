// Shared types for the GenFlows Copywriter Agent.

export type NodeId = "research" | "strategy" | "copywriting" | "icp";

export type NodeStatus = "idle" | "running" | "done" | "error";

/** "fallback" = universal-pain, no trigger needed (labeled S1, S2...). */
export type StrategyKind = "fallback" | "signal";

/** One turn in a node's mini-conversation (initial run + feedback rounds). */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** State for a plain streaming node (research / strategy / copywriting). */
export interface NodeState {
  status: NodeStatus;
  /** The latest assistant output (markdown). */
  output: string;
  /** Full conversation: initial user turn, assistant turns, feedback turns. */
  turns: ChatTurn[];
  error?: string;
}

export interface IcpRound {
  round: number;
  score: number;
  wouldReply: boolean;
  feedback: string;
  /** The copy that was scored this round. */
  copy: string;
}

export interface IcpState {
  status: NodeStatus;
  rounds: IcpRound[];
  finalCopy: string;
  finalScore: number;
  error?: string;
}

/**
 * One strategy extracted from the Strategy doc, with its own copy + ICP
 * brutal-test lifecycle. Labeled S1, S2... (fallback) or SS1, SS2... (signal) —
 * the double-S flags "this one needs a live data source to run."
 */
export interface StrategyUnit {
  id: string;
  name: string;
  kind: StrategyKind;
  /** For signal strategies: concrete instructions for sourcing the trigger data. */
  signalSourcing?: string;
  copy: NodeState;
  icp: IcpState;
}

export interface ProjectSettings {
  /** How many copy versions per strategy (A..). */
  versionCount: number;
  /** Target share of signal-based (micro) strategies, 0-100. */
  signalRatio: number;
  /** ICP test must reach at least this score (1-10). */
  minIcpScore: number;
  /** ICP reiteration cap. */
  maxIcpRounds: number;
  /** Word-limit posture for copy. */
  wordLimitMode: "strict" | "auto" | "explain";
}

export interface ClientProject {
  id: string;
  name: string;
  website: string;
  valueProp: string;
  offers: string;
  onboardingDocs: string;
  strategyIdea: string;
  createdAt: number;
  updatedAt: number;
  research: NodeState;
  strategy: NodeState;
  /** Populated once the Strategy list is extracted; one entry per strategy. */
  strategies: StrategyUnit[];
  settings: ProjectSettings;
}

// ─── Wire protocol (NDJSON frames streamed from the API routes) ────────────

export type StreamFrame =
  | { t: "status"; msg: string }
  | { t: "token"; text: string }
  | { t: "icp"; round: IcpRound }
  | { t: "final"; copy: string; score: number }
  | { t: "done" }
  | { t: "error"; msg: string };

export interface ChatRequestBody {
  messages: ChatTurn[];
  /** Enable live web research tools for this call. */
  web?: boolean;
}

export interface StrategyListRequestBody {
  strategyOutput: string;
}

export interface StrategyListResponseBody {
  strategies: Array<{
    id: string;
    name: string;
    kind: StrategyKind;
    signalSourcing?: string;
  }>;
}

export interface IcpRequestBody {
  copy: string;
  strategyContext: string;
  clientContext: string;
  minScore: number;
  maxRounds: number;
  wordLimitMode: ProjectSettings["wordLimitMode"];
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  versionCount: 8,
  signalRatio: 50,
  minIcpScore: 9,
  maxIcpRounds: 3,
  wordLimitMode: "auto",
};
