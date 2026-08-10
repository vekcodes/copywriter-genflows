# Onboarding: GenFlows Copywriter Agent

Welcome! This doc gets you from "just cloned this" to "running the pipeline against a real client" in a few minutes, and orients you in the codebase so you're not hunting for where things live.

## What you're looking at

A terminal-styled Next.js app that runs a client through a 4-stage, Claude-powered pipeline:

**Research → Strategy → Copywriting → ICP Brutal Test**

1. **Research** — analyzes the client's website + onboarding docs (fetches live if web tools are available), extracts ICP, differentiators, offers, verified pain points (with sources), competitors, and judges whether the offer is simple or "needs explaining."
2. **Strategy** — builds signal-based (micro, trigger-driven) and fallback (macro, universal-pain) outreach strategies from the research, in a ratio you control (default ~50/50).
3. **Copywriting** — writes the full set of email versions per strategy, following the agency's master copywriting prompt + knowledge base. Defaults to an 80-word first email, but breaks that rule when Research flagged the offer as needing explanation.
4. **ICP Brutal Test** — Claude becomes the actual prospect, reads the copy cold, scores it 1–10 with no politeness inflation, and rewrites/re-scores in a loop until it clears your bar (default 9) or hits the round cap.

Every stage streams live, remembers its feedback history, and can be nudged ("send feedback") or fully redone. There's no backend database — each client project lives in your browser's `localStorage`, so it's per-browser, not shared across teammates.

## Get it running

Requires Node 18+ (built/tested on Node 24).

```bash
npm install
cp .env.example .env
```

Open `.env` and add your credential:

- `ANTHROPIC_API_KEY` — a normal pay-per-token API key from [console.anthropic.com](https://console.anthropic.com/settings/keys).

Then:

```bash
npm run dev
```

Open **http://localhost:3000** — you should see the terminal UI. Create a client (name + website + paste any onboarding docs), and run Research.

If you'd rather drive the whole pipeline from the terminal without the UI (e.g. batch-processing a client):

```bash
npm run pipeline
```

This asks the same questions the UI's onboarding panel does and writes numbered markdown files (`00-inputs.md` … `05-final-copy.md`) to `output/<client-slug>/`.

## Where things actually live

The pipeline's real "brain" is **not** code — it's three plain-text/markdown files that get woven into the system prompts at request time:

| File | Used for |
| --- | --- |
| `research and strategy.txt` | Research + Strategy stage methodology |
| `content/copywriting-master.md` | Copywriting stage + ICP-revise stage |
| `COLD_EMAIL_KNOWLEDGE_BASE.md` | Copywriting stage + ICP-judge stage |

**If you're asked to change how the agent researches, strategizes, writes, or judges copy, start by editing one of these three files** — it takes effect on the next run, no redeploy of prompt logic needed. `lib/prompts.ts` is where they get assembled into each stage's actual system prompt (rules like the 80-word posture, version count, signal/fallback ratio live here, as small wrapper text around the big source files).

Everything else, briefly:

- `app/api/{research,strategy,copywriting,icp}/route.ts` — one Next.js API route per pipeline stage. They stream newline-delimited JSON (NDJSON) frames back to the browser.
- `lib/anthropic.ts` — the Anthropic client, streaming, prompt-caching, and 429/529 retry logic. This is the one place credential handling and model selection happens.
- `lib/stream.ts` / `lib/client-stream.ts` — the NDJSON streaming protocol, server and client sides.
- `lib/types.ts` — every shared type; `ClientProject` is the shape of one client's full pipeline state.
- `hooks/use-projects.ts` — the `localStorage` persistence layer for client projects (this is your "database").
- `components/terminal/*` + `app/page.tsx` — the terminal UI itself.
- `scripts/run-pipeline.ts` — the headless CLI runner (`npm run pipeline`), reusing the exact same prompt/streaming code the web UI uses.
- `output/` — where the CLI pipeline writes its markdown output per client.
- `copywriting prompt.txt` / `copywriting prompt new.txt` — older reference drafts, kept for history. **Not** loaded at runtime — don't edit these expecting it to change behavior; that's `content/copywriting-master.md`.

There's a `CLAUDE.md` at the repo root with more architecture detail if you're working with Claude Code in this repo — it covers the request-flow diagram and the streaming wire protocol in more depth.

## Common gotchas

- **`401`** from the API = bad/expired `ANTHROPIC_API_KEY` → check the console.
- **`429`** = valid key, but rate-limited → wait and retry.
- Live web research (fetching the client site, searching for verified stats) needs a credential that supports the web tools; if it doesn't, the app falls back gracefully to whatever content you pasted in. Set `DISABLE_WEB_TOOLS=1` to turn this off deliberately.
- Client projects don't sync across browsers/devices — they're local to whichever browser you created them in.
- Adding a new static prompt asset? Register it in `next.config.mjs`'s `outputFileTracingIncludes` too, or a production build won't bundle it.

## A good first task

Open the app, create a test client with a real website URL, and run it through all four stages once. Skim the streamed Research output against `research and strategy.txt` to see how the methodology maps into the prompt — that's the fastest way to understand how this whole thing actually works.
