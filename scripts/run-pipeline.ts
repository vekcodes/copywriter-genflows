/**
 * CLI runner for the Research → Strategy → Copywriting → ICP Brutal Test
 * pipeline, with no frontend. Asks the same questions the terminal UI's
 * onboarding panel + settings would, then runs the exact same node prompts
 * (from @/lib/prompts + @/lib/anthropic) that the API routes use.
 *
 * Usage:  npm run pipeline
 * Needs:  ANTHROPIC_API_KEY in .env (loaded via `node --env-file=.env`,
 *         wired into the npm script).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

import { structuredCall, streamText, MODEL } from "@/lib/anthropic";
import { buildCopyDocx, type StrategyDocxInput } from "@/lib/docx-export";
import {
  copySystem,
  icpJudgeSystem,
  icpReviseSystem,
  researchSystem,
  strategyListSystem,
  strategySystem,
} from "@/lib/prompts";
import {
  DEFAULT_SETTINGS,
  type ChatTurn,
  type ProjectSettings,
  type StrategyListResponseBody,
} from "@/lib/types";

const rl = createInterface({ input: process.stdin, output: process.stdout });

async function ask(question: string, fallback = ""): Promise<string> {
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)).trim();
  return answer || fallback;
}

/** Multi-line / file-backed input: "@path/to/file" reads a file; otherwise
 *  paste text and finish with a line containing only "END" (blank = skip). */
async function askLong(question: string): Promise<string> {
  const first = (
    await rl.question(`${question}\n(paste text, end with a line "END"; or "@path/to/file"; blank to skip): `)
  ).trim();
  if (!first) return "";
  if (first.startsWith("@")) {
    const path = first.slice(1).trim();
    try {
      return (await readFile(path, "utf8")).trim();
    } catch (err) {
      console.error(`  Could not read ${path}: ${(err as Error).message}. Treating as empty.`);
      return "";
    }
  }
  const lines = [first];
  for (;;) {
    const line = await rl.question("");
    if (line.trim() === "END") break;
    lines.push(line);
  }
  return lines.join("\n").trim();
}

async function askInt(question: string, fallback: number, min: number, max: number): Promise<number> {
  const raw = await ask(question, String(fallback));
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function askChoice<T extends string>(question: string, choices: T[], fallback: T): Promise<T> {
  const raw = (await ask(`${question} (${choices.join("/")})`, fallback)).toLowerCase();
  return (choices as string[]).includes(raw) ? (raw as T) : fallback;
}

async function askYesNo(question: string, fallback: boolean): Promise<boolean> {
  const raw = (await ask(question, fallback ? "y" : "n")).toLowerCase();
  if (!raw) return fallback;
  return raw.startsWith("y");
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "client"
  );
}

// ─── Seed builders (mirrors app/page.tsx exactly) ──────────────────────────

function buildResearchSeed(input: {
  name: string;
  website: string;
  valueProp?: string;
  offers?: string;
  onboardingDocs: string;
  strategyIdea: string;
}): string {
  return `Client: ${input.name}
Website: ${input.website || "(none provided)"}

Value proposition (from onboarding — authoritative if given):
${input.valueProp || "(not provided — infer from onboarding docs/site if possible)"}

Offers (from onboarding — authoritative if given; the ONLY offers later strategies may use):
${input.offers || "(not provided — extract from onboarding docs/site if possible)"}

Onboarding docs / questionnaire:
${input.onboardingDocs || "(none provided)"}
${input.strategyIdea ? `\nOur initial strategy idea:\n${input.strategyIdea}\n` : ""}
Research this client thoroughly and produce the research brief. If a website is provided, fetch it. Verify any statistics with credible sources.`;
}

function buildStrategySeed(name: string, researchOutput: string, strategyIdea: string, signalRatio: number): string {
  return `RESEARCH BRIEF for ${name}:
---
${researchOutput}
---
${strategyIdea ? `\nOur initial strategy idea to consider:\n${strategyIdea}\n` : ""}
Build the full set of outreach strategies now — signal-based (micro) and fallback (macro), aiming for roughly ${signalRatio}% signal-based. Include the ranking table, top recommendations, and the strategic guidance for copy.`;
}

function buildStrategyCopySeed(
  researchOutput: string,
  strategyOutput: string,
  s: { id: string; name: string; kind: "fallback" | "signal"; signalSourcing?: string },
): string {
  return `RESEARCH BRIEF:
---
${researchOutput}
---

STRATEGY DOC (full, for context — but write for ONLY the one strategy named below):
---
${strategyOutput}
---

Write the full copy set for EXACTLY this one strategy: **${s.id} — ${s.name}** (${
    s.kind === "signal" ? "signal-based" : "fallback"
  }).${s.signalSourcing ? ` Signal sourcing: ${s.signalSourcing}` : ""} Do not write for any other strategy in the doc.`;
}

function clientContextFor(name: string, researchOutput: string): string {
  return `Client: ${name}\n\nResearch brief:\n${researchOutput}`;
}

// ─── Streaming helper — prints tokens live, returns the full text ─────────

async function runStreamingNode(opts: {
  label: string;
  system: string;
  messages: ChatTurn[];
  web: boolean;
  maxWebUses?: number;
  maxTokens?: number;
}): Promise<string> {
  console.log(`\n\x1b[1m▸ ${opts.label}\x1b[0m`);
  const text = await streamText({
    system: opts.system,
    messages: opts.messages,
    web: opts.web,
    maxWebUses: opts.maxWebUses,
    maxTokens: opts.maxTokens ?? 8192,
    onStatus: (msg) => console.log(`  \x1b[2m… ${msg}\x1b[0m`),
    onToken: (t) => process.stdout.write(t),
  });
  process.stdout.write("\n");
  return text;
}

// ─── ICP loop (mirrors app/api/icp/route.ts exactly) ───────────────────────

interface Verdict {
  score: number;
  wouldReply: boolean;
  reason: string;
  mustFix: string[];
}

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", minimum: 1, maximum: 10 },
    wouldReply: { type: "boolean" },
    reason: { type: "string" },
    mustFix: { type: "array", items: { type: "string" } },
  },
  required: ["score", "wouldReply", "reason", "mustFix"],
} as const;

const STRATEGY_LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    strategies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          kind: { type: "string", enum: ["fallback", "signal"] },
          signalSourcing: { type: "string" },
        },
        required: ["id", "name", "kind"],
      },
    },
  },
  required: ["strategies"],
} as const;

interface IcpRoundResult {
  round: number;
  score: number;
  wouldReply: boolean;
  feedback: string;
  copy: string;
}

async function runIcpBrutalTest(opts: {
  copy: string;
  strategyContext: string;
  clientContext: string;
  minScore: number;
  maxRounds: number;
  wordLimitMode: ProjectSettings["wordLimitMode"];
}): Promise<{ rounds: IcpRoundResult[]; finalCopy: string; finalScore: number }> {
  const judgeSystem = await icpJudgeSystem();
  const reviseSystem = await icpReviseSystem({
    ...DEFAULT_SETTINGS,
    minIcpScore: opts.minScore,
    wordLimitMode: opts.wordLimitMode,
  });

  const contextBlock = `CLIENT / ICP CONTEXT (this is who you are):
${opts.clientContext || "(not provided)"}

STRATEGY CONTEXT (the pain + offer behind this email):
${opts.strategyContext || "(not provided)"}`;

  console.log(`\n\x1b[1m▸ ICP Brutal Test\x1b[0m`);

  const rounds: IcpRoundResult[] = [];
  let currentCopy = opts.copy;
  let lastScore = 0;
  let round = 0;

  for (;;) {
    round++;
    console.log(`  \x1b[2m… ICP prospect reading the copy (round ${round})…\x1b[0m`);

    const verdict = await structuredCall<Verdict>(
      judgeSystem,
      [
        {
          role: "user",
          content: `${contextBlock}

The following cold email(s) just landed in your inbox. Read as the prospect and score honestly.

EMAIL COPY:
${currentCopy}`,
        },
      ],
      VERDICT_SCHEMA,
      "icp_verdict",
    );

    lastScore = verdict.score;
    const feedback =
      `${verdict.wouldReply ? "I would reply." : "I would NOT reply."} ${verdict.reason}` +
      (verdict.mustFix.length ? `\n\nWhat would have to change:\n- ${verdict.mustFix.join("\n- ")}` : "");

    rounds.push({ round, score: verdict.score, wouldReply: verdict.wouldReply, feedback, copy: currentCopy });
    console.log(`  Round ${round}: \x1b[1m${verdict.score}/10\x1b[0m — ${verdict.wouldReply ? "would reply" : "would NOT reply"}`);
    console.log(`  ${feedback.replace(/\n/g, "\n  ")}`);

    if (verdict.score >= opts.minScore || round >= opts.maxRounds) break;

    console.log(`  \x1b[2m… Score ${verdict.score}/10. Rewriting to reach ${opts.minScore}+…\x1b[0m`);

    const revised = await streamText({
      system: reviseSystem,
      messages: [
        {
          role: "user",
          content: `${contextBlock}

A real ICP prospect scored this copy ${verdict.score}/10 and said:
"${feedback}"

Rewrite the copy so that prospect would score it ${opts.minScore}+ and reply. Return the full copy in the same markdown format.

CURRENT COPY:
${currentCopy}`,
        },
      ],
      web: false,
      maxTokens: 8192,
      onStatus: (msg) => console.log(`    \x1b[2m… ${msg}\x1b[0m`),
      onToken: (t) => process.stdout.write(t),
    });
    process.stdout.write("\n");

    currentCopy = revised.trim() || currentCopy;
  }

  return { rounds, finalCopy: currentCopy, finalScore: lastScore };
}

// ─── Main ───────────────────────────────────────────────────────────────

interface PipelineInput {
  name: string;
  website?: string;
  valueProp?: string;
  offers?: string;
  onboardingDocs?: string;
  strategyIdea?: string;
  settings?: Partial<ProjectSettings>;
  useWebTools?: boolean;
}

async function gatherInteractive(): Promise<PipelineInput> {
  console.log("=== GenFlows Copywriter Agent — headless pipeline test ===\n");
  console.log("Every strategy Strategy recommends gets its own copy + brutal test — no target to pick.\n");

  const name = await ask("Client name");
  if (!name) {
    console.error("Client name is required.");
    process.exit(1);
  }
  const website = await ask("Website URL", "");
  const valueProp = await askLong("Value prop (optional)");
  const offers = await askLong("Offers, one per line (optional)");
  const onboardingDocs = await askLong("Onboarding docs / questionnaire notes");
  const strategyIdea = await askLong("Initial strategy idea (optional — Claude will still fully strategize around it)");

  console.log("\n--- Settings (Enter to accept defaults) ---");
  const versionCount = await askInt("Copy versions per strategy (3-8)", DEFAULT_SETTINGS.versionCount, 3, 8);
  const signalRatio = await askInt("Signal-based (micro) mix target %", DEFAULT_SETTINGS.signalRatio, 0, 100);
  const minIcpScore = await askInt("ICP minimum passing score (1-10)", DEFAULT_SETTINGS.minIcpScore, 1, 10);
  const maxIcpRounds = await askInt("ICP max rewrite rounds", DEFAULT_SETTINGS.maxIcpRounds, 1, 5);
  const wordLimitMode = await askChoice(
    "Word-limit posture",
    ["strict", "auto", "explain"] as const,
    DEFAULT_SETTINGS.wordLimitMode,
  );
  const useWebTools = await askYesNo("Enable live web search/fetch for Research & Strategy?", true);

  rl.close();
  return {
    name,
    website,
    valueProp,
    offers,
    onboardingDocs,
    strategyIdea,
    settings: { versionCount, signalRatio, minIcpScore, maxIcpRounds, wordLimitMode },
    useWebTools,
  };
}

async function main() {
  const inputFlagIdx = process.argv.indexOf("--input");
  const inputPath = inputFlagIdx >= 0 ? process.argv[inputFlagIdx + 1] : undefined;

  const raw: PipelineInput = inputPath
    ? (JSON.parse(await readFile(inputPath, "utf8")) as PipelineInput)
    : await gatherInteractive();

  if (!raw.name) {
    console.error("Client name is required.");
    process.exit(1);
  }

  const name = raw.name;
  const website = raw.website ?? "";
  const valueProp = raw.valueProp ?? "";
  const offers = raw.offers ?? "";
  const onboardingDocs = raw.onboardingDocs ?? "";
  const strategyIdea = raw.strategyIdea ?? "";
  const settings: ProjectSettings = { ...DEFAULT_SETTINGS, ...raw.settings };
  const useWebTools = raw.useWebTools ?? true;
  const { versionCount, signalRatio, minIcpScore, maxIcpRounds, wordLimitMode } = settings;

  const outDir = join(process.cwd(), "output", `${slug(name)}-${Date.now()}`);
  await mkdir(outDir, { recursive: true });

  const manifest = `# Run inputs

- **Client:** ${name}
- **Website:** ${website || "(none)"}
- **Model:** ${MODEL}
- **Web tools:** ${useWebTools ? "enabled" : "disabled"}
- **Settings:** ${JSON.stringify(settings, null, 2)}

## Value prop
${valueProp || "(none)"}

## Offers
${offers || "(none)"}

## Strategy idea
${strategyIdea || "(none)"}

## Onboarding docs
${onboardingDocs || "(none)"}
`;
  await writeFile(join(outDir, "00-inputs.md"), manifest, "utf8");
  console.log(`\nOutput folder: ${outDir}`);

  try {
    // 1. Research
    const researchOutput = await runStreamingNode({
      label: "1. Research",
      system: await researchSystem(),
      messages: [{ role: "user", content: buildResearchSeed({ name, website, valueProp, offers, onboardingDocs, strategyIdea }) }],
      web: useWebTools,
      maxWebUses: 25,
      maxTokens: 16000,
    });
    await writeFile(join(outDir, "01-research.md"), researchOutput, "utf8");

    // 2. Strategy
    const strategyOutput = await runStreamingNode({
      label: "2. Strategy",
      system: await strategySystem(settings),
      messages: [
        { role: "user", content: buildStrategySeed(name, researchOutput, strategyIdea, signalRatio) },
      ],
      web: useWebTools,
    });
    await writeFile(join(outDir, "02-strategy.md"), strategyOutput, "utf8");

    // 3. Extract the strategy list — every one of these gets its own copy + brutal test.
    console.log(`\n\x1b[1m▸ 3. Reading strategy list\x1b[0m`);
    const listResult = await structuredCall<StrategyListResponseBody>(
      strategyListSystem(),
      [{ role: "user", content: `STRATEGY DOC:\n---\n${strategyOutput}` }],
      STRATEGY_LIST_SCHEMA,
      "strategy_list",
      4096,
    );
    const strategyList = listResult.strategies;
    console.log(`  Found ${strategyList.length} strategies.`);
    await writeFile(join(outDir, "03-strategy-list.json"), JSON.stringify(strategyList, null, 2), "utf8");

    // 4. Per-strategy Copywriting + ICP Brutal Test loop. Isolated per strategy —
    // one transient failure (network blip, timeout) shouldn't lose every other
    // strategy's completed work, since a full run can be dozens of sequential calls.
    const results: StrategyDocxInput[] = [];
    const failed: string[] = [];
    for (const [i, s] of strategyList.entries()) {
      console.log(`\n\x1b[1m▸ 4.${i + 1} ${s.id} — ${s.name} (${s.kind})\x1b[0m`);
      try {
        const copyOutput = await runStreamingNode({
          label: `  Copywriting ${s.id}`,
          system: await copySystem(settings),
          messages: [{ role: "user", content: buildStrategyCopySeed(researchOutput, strategyOutput, s) }],
          web: false,
        });

        const icpResult = await runIcpBrutalTest({
          copy: copyOutput,
          strategyContext: `This copy is for strategy ${s.id} — ${s.name} (${s.kind}).\n\n${strategyOutput}`,
          clientContext: clientContextFor(name, researchOutput),
          minScore: minIcpScore,
          maxRounds: maxIcpRounds,
          wordLimitMode,
        });

        results.push({
          id: s.id,
          name: s.name,
          kind: s.kind,
          signalSourcing: s.signalSourcing,
          copy: copyOutput,
          icpFinalCopy: icpResult.finalCopy,
          icpFinalScore: icpResult.finalScore,
        });
      } catch (err) {
        console.error(`  ⚠ ${s.id} failed: ${(err as Error).message}. Skipping — continuing with the rest.`);
        failed.push(`${s.id} — ${s.name}: ${(err as Error).message}`);
      }
    }
    if (failed.length) {
      console.log(`\n\x1b[1mSkipped ${failed.length} strategy(ies) after a failure:\x1b[0m`);
      failed.forEach((f) => console.log(`  - ${f}`));
      await writeFile(join(outDir, "03b-failed-strategies.txt"), failed.join("\n"), "utf8");
    }

    const allCopyMd = results
      .map((r) => `## ${r.id} — ${r.name} (${r.kind})\n\n${r.copy}`)
      .join("\n\n---\n\n");
    await writeFile(join(outDir, "04-all-copy.md"), allCopyMd, "utf8");

    const allIcpMd = results
      .map(
        (r) =>
          `## ${r.id} — ${r.name} — Final ${r.icpFinalScore}/10\n\n\`\`\`\n${r.icpFinalCopy}\n\`\`\`\n`,
      )
      .join("\n---\n\n");
    await writeFile(join(outDir, "05-all-icp-brutal-test.md"), allIcpMd, "utf8");

    // 5. Consolidated Word doc — the actual client-deliverable artifact.
    const docxBuffer = await buildCopyDocx({
      clientName: name,
      website,
      strategies: results,
      minIcpScore,
    });
    await writeFile(join(outDir, "06-consolidated-copy.docx"), docxBuffer);

    const avgScore =
      results.reduce((sum, r) => sum + (r.icpFinalScore ?? 0), 0) / (results.length || 1);
    console.log(
      `\n\x1b[1mDone.\x1b[0m ${results.length}/${strategyList.length} strategies written + brutal-tested${
        failed.length ? ` (${failed.length} skipped — see 03b-failed-strategies.txt)` : ""
      }. Avg final score: ${avgScore.toFixed(1)}/10. Files written to:\n  ${outDir}`,
    );
  } catch (err) {
    console.error("\nPipeline failed:", err);
    process.exitCode = 1;
  }
}

main();
