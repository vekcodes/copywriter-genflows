import type { NextRequest } from "next/server";
import { streamText } from "@/lib/anthropic";
import { copySystem } from "@/lib/prompts";
import { ndjsonStream } from "@/lib/stream";
import { DEFAULT_SETTINGS, type ChatRequestBody, type ProjectSettings } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequestBody & {
    settings?: Partial<ProjectSettings>;
  };
  const settings = { ...DEFAULT_SETTINGS, ...body.settings };
  const system = await copySystem(settings);
  return ndjsonStream(async (emit) => {
    await streamText({
      system,
      messages: body.messages,
      // Copy generation works from the brief; no live web needed by default.
      web: body.web ?? false,
      maxTokens: 8192,
      onStatus: (msg) => emit({ t: "status", msg }),
      onToken: (text) => emit({ t: "token", text }),
    });
  });
}
