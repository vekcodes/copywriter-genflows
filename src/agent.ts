import type Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./client.js";
import { loadKnowledgeBase } from "./knowledgeBase.js";
import { lint } from "./linter.js";
import {
  WRITER_SYSTEM,
  WRITER_TASK,
  CRITIC_SYSTEM,
  CRITIC_TASK,
  REVISE_TASK,
} from "./prompts.js";
import type { Brief, GeneratedEmail, Critique } from "./types.js";

const EMAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    template_used: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    follow_ups: { type: "array", items: { type: "string" } },
    levers_used: { type: "array", items: { type: "string" } },
  },
  required: ["template_used", "subject", "body", "follow_ups", "levers_used"],
} as const;

const CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    passes: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rule: { type: "string" },
          problem: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["rule", "problem", "suggestion"],
      },
    },
  },
  required: ["passes", "issues"],
} as const;

/**
 * One structured-output call, via forced tool use (portable across SDK versions).
 * The KB-bearing system prompt is cached across calls so we don't re-send it each time.
 */
async function structured<T>(
  client: Anthropic,
  system: string,
  userText: string,
  schema: object,
  toolName: string,
): Promise<T> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools: [
      {
        name: toolName,
        description: `Return the result as structured ${toolName} data.`,
        input_schema: schema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
    messages: [{ role: "user", content: userText }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model returned no tool_use block.");
  }
  return block.input as T;
}

export interface RunResult {
  email: GeneratedEmail;
  rounds: number;
  clean: boolean;
}

export interface RunOptions {
  maxRounds?: number;
  /** Called after each round so a CLI can show progress. */
  onProgress?: (msg: string) => void;
}

/**
 * The agentic loop: draft -> lint (deterministic) -> critique (LLM) -> revise.
 * Repeats until both gates pass or maxRounds is hit.
 */
export async function run(
  client: Anthropic,
  brief: Brief,
  opts: RunOptions = {},
): Promise<RunResult> {
  const maxRounds = opts.maxRounds ?? 3;
  const log = opts.onProgress ?? (() => {});
  const kb = loadKnowledgeBase();
  const writerSys = WRITER_SYSTEM(kb);
  const criticSys = CRITIC_SYSTEM(kb);

  log("Drafting…");
  let email = await structured<GeneratedEmail>(
    client,
    writerSys,
    WRITER_TASK(brief),
    EMAIL_SCHEMA,
    "write_email",
  );

  for (let round = 1; round <= maxRounds; round++) {
    const lintIssues = lint(email);
    log(
      `Round ${round}: linting → ${lintIssues.length} mechanical issue(s); asking the critic…`,
    );

    const critique = await structured<Critique>(
      client,
      criticSys,
      CRITIC_TASK(brief, email, lintIssues),
      CRITIQUE_SCHEMA,
      "submit_critique",
    );

    const clean = lintIssues.length === 0 && critique.passes;
    if (clean) {
      log(`Round ${round}: passed both gates.`);
      return { email, rounds: round, clean: true };
    }

    if (round === maxRounds) {
      log(`Round ${round}: still has issues; returning best effort.`);
      return { email, rounds: round, clean: false };
    }

    log(
      `Round ${round}: revising (${lintIssues.length} mechanical + ${critique.issues.length} reviewer issue(s))…`,
    );
    email = await structured<GeneratedEmail>(
      client,
      writerSys,
      REVISE_TASK(email, lintIssues, critique.issues),
      EMAIL_SCHEMA,
      "write_email",
    );
  }

  return { email, rounds: maxRounds, clean: false };
}
