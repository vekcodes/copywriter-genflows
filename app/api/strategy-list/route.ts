import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { structuredCall } from "@/lib/anthropic";
import { strategyListSystem } from "@/lib/prompts";
import type { StrategyListRequestBody, StrategyListResponseBody } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCHEMA = {
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

export async function POST(req: NextRequest) {
  const body = (await req.json()) as StrategyListRequestBody;
  if (!body.strategyOutput?.trim()) {
    return NextResponse.json({ error: "strategyOutput is required." }, { status: 400 });
  }

  const system = strategyListSystem();
  const result = await structuredCall<StrategyListResponseBody>(
    system,
    [{ role: "user", content: `STRATEGY DOC:\n---\n${body.strategyOutput}` }],
    SCHEMA,
    "strategy_list",
    4096,
  );

  return NextResponse.json(result);
}
