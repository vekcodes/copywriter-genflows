import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The full cold-email knowledge base. Loaded once and injected into the system
 * prompt (cached) so the model writes against the actual rules, templates, and
 * building blocks rather than generic instincts.
 */
export function loadKnowledgeBase(): string {
  // Repo layout: src/knowledgeBase.ts  →  ../COLD_EMAIL_KNOWLEDGE_BASE.md
  const path = join(here, "..", "COLD_EMAIL_KNOWLEDGE_BASE.md");
  return readFileSync(path, "utf8");
}
