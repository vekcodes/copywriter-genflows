# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

GenFlows Copywriter Agent — a Next.js (App Router) app with a dark terminal-style UI that runs a 4-stage, Claude-powered pipeline for cold-email agency work: **Research → Strategy → Copywriting → ICP Brutal Test**. Each stage is a "cell" that streams tokens live, keeps a feedback/turn history, and can be re-run with user feedback. The final stage has Claude role-play the actual prospect, score the copy 1–10, and iteratively rewrite until it clears a bar (default 9).

There is no database — client projects persist in the browser's `localStorage` (`hooks/use-projects.ts`).

## Commands

```bash
npm install
cp .env.example .env        # add ONE credential — see below
npm run dev                 # dev server, http://localhost:3000
npm run build                # production build
npm start                    # serve production build
npm run typecheck             # tsc --noEmit (no test suite / lint is not wired to CI)
npm run pipeline              # run the whole 4-stage pipeline headless from the CLI (scripts/run-pipeline.ts)
```

There are no unit tests in this repo. `npm run typecheck` is the closest thing to a correctness gate before committing.

### Credentials (`.env`, required)

- `ANTHROPIC_API_KEY` — pay-per-token key.
- Optional: `COPYWRITER_MODEL` (default `claude-opus-4-8`), `DISABLE_WEB_TOOLS=1` (disables live `web_search`/`web_fetch`).

## Architecture

### The pipeline is prompts, not code branches

The four stages are **not** separate agents/models — they're four different system prompts assembled in `lib/prompts.ts`, all calling the same `streamText`/`structuredCall` helpers in `lib/anthropic.ts`. To change what a stage does, edit its prompt-builder function in `lib/prompts.ts`, not the API route.

Each prompt-builder composes from **three static source-of-truth assets** loaded (and cached) by `lib/knowledge.ts`:
- `research and strategy.txt` — the agency's research + strategy methodology (used by `researchSystem()` and `strategySystem()`).
- `content/copywriting-master.md` — the fused copywriting system prompt (used by `copySystem()` and `icpReviseSystem()`).
- `COLD_EMAIL_KNOWLEDGE_BASE.md` — knowledge base (used by `copySystem()` and `icpJudgeSystem()`).

**Editing any of these three files changes agent behavior on the next run with no code changes required.** They're bundled into the server output via `outputFileTracingIncludes` in `next.config.mjs` — if you add a new source asset, register it there too or the deployed build won't find it.

`copywriting prompt.txt` / `copywriting prompt new.txt` are older/reference drafts, not loaded at runtime — don't confuse them with `content/copywriting-master.md`.

### Request flow

```
components/terminal/*  →  hooks/use-projects.ts (localStorage state)
        │ POST (fetch)
        ▼
app/api/{research,strategy,copywriting,icp}/route.ts   (Node.js runtime, not edge)
        │ builds system prompt via lib/prompts.ts
        ▼
lib/anthropic.ts  →  Anthropic SDK (streamText / structuredCall)
        │ NDJSON frames via lib/stream.ts (ndjsonStream)
        ▼
lib/client-stream.ts (streamNdjson)  →  UI updates token-by-token
```

- Every API route is forced onto the Node.js runtime (`export const runtime = "nodejs"`, `maxDuration = 300`) because they read the prompt/knowledge files from disk at request time.
- Streaming wire format is newline-delimited JSON frames (`StreamFrame` in `lib/types.ts`): `status`, `token`, `icp`, `final`, `done`, `error`. `ndjsonStream()` (server) and `streamNdjson()` (client) are the only places that know this protocol — extend both together if you add a frame type.
- `lib/anthropic.ts` puts an `ephemeral` `cache_control` marker on the system block (since it embeds the large static assets above) and handles 429/529 backoff — but only retries while zero tokens have been emitted, to avoid duplicating partial output.
- The ICP stage (`app/api/icp/route.ts`) is the one route with real control flow: it loops `structuredCall` (forced tool-use, `VERDICT_SCHEMA`) → judge score, then `streamText` → revise, until `score >= minScore` or `maxRounds` is hit. `structuredCall` is otherwise unused elsewhere in the pipeline.
- `scripts/run-pipeline.ts` is a separate headless entry point that re-imports the exact same `lib/prompts.ts` + `lib/anthropic.ts` functions the API routes use, so the CLI and web UI never drift — if you change a node's behavior, both call sites pick it up automatically.

### Client state

`ClientProject` (`lib/types.ts`) is the one object per client: website/onboarding inputs, per-node `NodeState` (status/output/turn history) for research/strategy/copywriting, a separate `IcpState` (rounds + final copy/score) for the ICP stage, and `ProjectSettings` (version count, signal/fallback ratio, min ICP score, max rounds, word-limit posture). `hooks/use-projects.ts` is the only place that reads/writes `localStorage`; `lib/project.ts` has the constructors/defaults.
