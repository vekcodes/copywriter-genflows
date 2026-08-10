import Anthropic from "@anthropic-ai/sdk";
import type { ChatTurn } from "./types";

export const MODEL = process.env.COPYWRITER_MODEL ?? "claude-opus-4-8";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build an Anthropic client from the API key in the environment. */
export function makeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("No credentials found. Set ANTHROPIC_API_KEY in .env. See .env.example.");
  }
  return new Anthropic({ apiKey });
}

const webToolsAllowed = () => process.env.DISABLE_WEB_TOOLS !== "1";

function betaHeader(webFetch: boolean): Record<string, string> | undefined {
  return webFetch ? { "anthropic-beta": "web-fetch-2025-09-10" } : undefined;
}

/**
 * Live web tools. `maxUses` is per-tool-per-turn — the model can chain many
 * search/fetch calls within a single streamed response, so a higher budget
 * here is what turns a shallow one-pass lookup into real deep research.
 */
function webTools(maxUses: number) {
  return [
    { type: "web_search_20250305", name: "web_search", max_uses: maxUses },
    { type: "web_fetch_20250910", name: "web_fetch", max_uses: maxUses },
  ] as unknown as Anthropic.Tool[];
}

export interface StreamArgs {
  system: string;
  messages: ChatTurn[];
  web?: boolean;
  /** Per-tool max_uses budget for web_search/web_fetch when `web` is true. */
  maxWebUses?: number;
  maxTokens?: number;
  onStatus?: (msg: string) => void;
  onToken: (text: string) => void;
}

/**
 * Stream a completion, emitting text tokens as they arrive. Handles:
 *  - prompt-caching the (large) system block,
 *  - live web tools (web_search / web_fetch) when requested and available,
 *  - graceful fallback to a no-tools call if the credential can't use tools,
 *  - 429/529 backoff, but only while no tokens have been emitted yet.
 * Returns the full assembled text.
 */
export async function streamText(args: StreamArgs): Promise<string> {
  const client = makeClient();
  const wantTools = !!args.web && webToolsAllowed();

  let emitted = 0;
  const emit = (t: string) => {
    emitted += t.length;
    args.onToken(t);
  };

  const runOnce = async (useTools: boolean): Promise<string> => {
    const stream = client.messages.stream(
      {
        model: MODEL,
        max_tokens: args.maxTokens ?? 8192,
        system: [
          { type: "text", text: args.system, cache_control: { type: "ephemeral" } },
        ] as unknown as Anthropic.TextBlockParam[],
        messages: args.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(useTools ? { tools: webTools(args.maxWebUses ?? 10) } : {}),
      },
      { headers: betaHeader(useTools) },
    );

    // When tools are on, the model tends to narrate between tool calls
    // ("Let me search for…") even when told not to — buffer text until the
    // first markdown heading shows up and drop everything before it, so the
    // narration never reaches the UI or downstream nodes. Non-tool calls
    // (copywriting, ICP revise) skip this — their output has no such preamble.
    let full = "";
    let preambleBuffer = "";
    let headingFound = !useTools;
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        const cb: any = (event as any).content_block;
        if (cb?.type === "server_tool_use") {
          args.onStatus?.(cb.name === "web_fetch" ? "fetching a page…" : "searching the web…");
        }
      } else if (event.type === "content_block_delta") {
        const delta: any = (event as any).delta;
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          if (headingFound) {
            full += delta.text;
            emit(delta.text);
            continue;
          }
          preambleBuffer += delta.text;
          const match = preambleBuffer.match(/(^|\n)(#{1,6} )/);
          if (match) {
            headingFound = true;
            const visible = preambleBuffer.slice(match.index! + match[1].length);
            full += visible;
            emit(visible);
          } else if (preambleBuffer.length > 4000) {
            // No heading showed up in a reasonable window — give up buffering
            // rather than risk losing content.
            headingFound = true;
            full += preambleBuffer;
            emit(preambleBuffer);
          }
        }
      }
    }
    if (!headingFound && preambleBuffer) {
      full += preambleBuffer;
      emit(preambleBuffer);
    }
    return full;
  };

  let attempt = 0;
  let toolsOn = wantTools;
  for (;;) {
    try {
      return await runOnce(toolsOn);
    } catch (err: any) {
      const status = err?.status;
      // Tools not permitted on this credential → drop them and retry (only if
      // we haven't already streamed anything).
      if (toolsOn && emitted === 0 && (status === 400 || status === 403 || status === 404)) {
        args.onStatus?.("Live web tools unavailable on this credential. Continuing from provided context.");
        toolsOn = false;
        continue;
      }
      const retriable = (status === 429 || status === 529) && emitted === 0;
      if (!retriable || attempt >= 5) throw err;
      const headerWait = Number(err?.headers?.get?.("retry-after")) * 1000;
      const backoff = Math.min(60_000, 2 ** attempt * 1000);
      args.onStatus?.(`Rate limited (${status}). Waiting to retry…`);
      await sleep(Number.isFinite(headerWait) && headerWait > 0 ? headerWait : backoff);
      attempt++;
    }
  }
}

/**
 * One structured-output call via forced tool use (portable across SDK versions).
 * Used by the ICP judge to return a numeric score + critique.
 */
export async function structuredCall<T>(
  system: string,
  messages: ChatTurn[],
  schema: object,
  toolName: string,
  maxTokens = 2048,
): Promise<T> {
  const client = makeClient();
  let attempt = 0;
  for (;;) {
    try {
      const res = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ] as unknown as Anthropic.TextBlockParam[],
        tools: [
          {
            name: toolName,
            description: `Return the result as structured ${toolName} data.`,
            input_schema: schema as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: toolName },
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") {
        throw new Error("Model returned no tool_use block.");
      }
      return block.input as T;
    } catch (err: any) {
      const status = err?.status;
      const retriable = status === 429 || status === 529;
      if (!retriable || attempt >= 5) throw err;
      const headerWait = Number(err?.headers?.get?.("retry-after")) * 1000;
      const backoff = Math.min(60_000, 2 ** attempt * 1000);
      await sleep(Number.isFinite(headerWait) && headerWait > 0 ? headerWait : backoff);
      attempt++;
    }
  }
}
