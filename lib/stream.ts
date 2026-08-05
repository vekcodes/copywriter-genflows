import type { StreamFrame } from "./types";

/** Turn an API error into a human-friendly message for the UI. */
export function humanError(err: any): string {
  const status = err?.status;
  if (status === 401 || status === 403) {
    return "Authentication failed (401/403). Check CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY in .env — the OAuth token may have expired (regenerate with `claude setup-token`).";
  }
  if (status === 429) {
    return "Rate limited (429). The subscription OAuth token shares one quota pool with other Claude usage. Try again shortly, or set a dedicated ANTHROPIC_API_KEY for independent quota.";
  }
  if (status === 529) {
    return "The API is temporarily overloaded (529). Try again in a moment.";
  }
  return err?.message ?? String(err);
}

/**
 * Build a streaming Response that emits newline-delimited JSON frames
 * (`StreamFrame`). The `run` callback drives the work and calls `emit` for each
 * frame; a trailing `done` frame is added automatically, and any thrown error
 * is converted into an `error` frame.
 */
export function ndjsonStream(
  run: (emit: (frame: StreamFrame) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (frame: StreamFrame) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(frame) + "\n"));
      };
      try {
        await run(emit);
        emit({ t: "done" });
      } catch (err) {
        emit({ t: "error", msg: humanError(err) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
