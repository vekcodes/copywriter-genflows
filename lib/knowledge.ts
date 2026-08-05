import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Loads the static knowledge assets from disk (once, cached). These are large
 * and reused across every call, so the API routes place a cache_control marker
 * on the system block that contains them.
 *
 * Files live at the repo root / content dir and are bundled into the server
 * output via `outputFileTracingIncludes` in next.config.mjs.
 */

const cache = new Map<string, string>();

async function load(relPath: string): Promise<string> {
  const cached = cache.get(relPath);
  if (cached !== undefined) return cached;
  try {
    const text = await readFile(join(process.cwd(), relPath), "utf8");
    cache.set(relPath, text);
    return text;
  } catch {
    // Missing asset should not crash a route; return an empty string and let
    // the prompt degrade gracefully.
    cache.set(relPath, "");
    return "";
  }
}

export const loadKnowledgeBase = () => load("COLD_EMAIL_KNOWLEDGE_BASE.md");
export const loadResearchStrategySource = () => load("research and strategy.txt");
export const loadCopywritingMaster = () => load("content/copywriting-master.md");
