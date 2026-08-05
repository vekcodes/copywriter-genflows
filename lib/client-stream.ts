"use client";

import type { StreamFrame } from "./types";

/**
 * POST `body` to `url` and parse the newline-delimited JSON stream, invoking
 * `onFrame` for every frame. Browser-only (uses fetch streaming).
 */
export async function streamNdjson(
  url: string,
  body: unknown,
  onFrame: (frame: StreamFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    onFrame({ t: "error", msg: err?.message ?? "Network error" });
    return;
  }

  if (!res.ok || !res.body) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      msg = j?.error ?? j?.message ?? msg;
    } catch {
      /* ignore */
    }
    onFrame({ t: "error", msg });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          try {
            onFrame(JSON.parse(line) as StreamFrame);
          } catch {
            /* skip malformed line */
          }
        }
      }
    }
    const last = buffer.trim();
    if (last) {
      try {
        onFrame(JSON.parse(last) as StreamFrame);
      } catch {
        /* ignore */
      }
    }
  } catch (err: any) {
    if (err?.name === "AbortError") return;
    onFrame({ t: "error", msg: err?.message ?? "Stream error" });
  }
}
