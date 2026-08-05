import type { NextRequest } from "next/server";
import { streamText, structuredCall } from "@/lib/anthropic";
import { icpJudgeSystem, icpReviseSystem } from "@/lib/prompts";
import { ndjsonStream } from "@/lib/stream";
import { DEFAULT_SETTINGS, type IcpRequestBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as IcpRequestBody;
  const minScore = Math.min(10, Math.max(1, body.minScore || 9));
  const maxRounds = Math.min(5, Math.max(1, body.maxRounds || 3));

  const judgeSystem = await icpJudgeSystem();
  const reviseSystem = await icpReviseSystem({
    ...DEFAULT_SETTINGS,
    minIcpScore: minScore,
    wordLimitMode: body.wordLimitMode ?? "auto",
  });

  const contextBlock = `CLIENT / ICP CONTEXT (this is who you are):
${body.clientContext || "(not provided)"}

STRATEGY CONTEXT (the pain + offer behind this email):
${body.strategyContext || "(not provided)"}`;

  return ndjsonStream(async (emit) => {
    let currentCopy = body.copy;
    let lastScore = 0;
    let round = 0;

    for (;;) {
      round++;
      emit({ t: "status", msg: `ICP prospect reading the copy (round ${round})…` });

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
        (verdict.mustFix.length
          ? `\n\nWhat would have to change:\n- ${verdict.mustFix.join("\n- ")}`
          : "");

      emit({
        t: "icp",
        round: {
          round,
          score: verdict.score,
          wouldReply: verdict.wouldReply,
          feedback,
          copy: currentCopy,
        },
      });

      if (verdict.score >= minScore || round >= maxRounds) break;

      emit({ t: "status", msg: `Score ${verdict.score}/10. Rewriting to reach ${minScore}+…` });

      const revised = await streamText({
        system: reviseSystem,
        messages: [
          {
            role: "user",
            content: `${contextBlock}

A real ICP prospect scored this copy ${verdict.score}/10 and said:
"${feedback}"

Rewrite the copy so that prospect would score it ${minScore}+ and reply. Return the full copy in the same markdown format.

CURRENT COPY:
${currentCopy}`,
          },
        ],
        web: false,
        maxTokens: 8192,
        onStatus: (msg) => emit({ t: "status", msg }),
        onToken: (text) => emit({ t: "token", text }),
      });

      currentCopy = revised.trim() || currentCopy;
    }

    emit({ t: "final", copy: currentCopy, score: lastScore });
  });
}
