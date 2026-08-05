# GenFlows Copywriter Agent

A terminal-style, **Claude-powered pipeline** that takes a client from **Research → Strategy → Copywriting → ICP Brutal Test**, with your feedback and re-runs at every step.

It feels like talking to Claude Code: a dark terminal UI (Next.js + shadcn/ui) where each stage is a "cell" that streams live, accepts feedback, and re-runs. The last stage role-plays the actual prospect and grades the copy 1–10, rewriting until it clears your bar.

---

## The pipeline

1. **Research** — Deep client analysis from the website + onboarding docs. Fetches the site and searches for **verified** industry stats (with sources) when live web tools are available; falls back to your pasted content otherwise. Produces ICP, differentiators, extracted offers, verified pains, competitors, psychographics, and an **offer-complexity read** (does this offer need explaining?).
2. **Strategy** — Builds **signal-based (micro)** and **fallback / non-signal (macro)** strategies, targeting a mix you control (default ~50/50), with a ranking table, top recommendations, and copy guidance. Only uses offers extracted in research.
3. **Copywriting** — Writes the full version set per strategy (A–H + follow-ups), fusing the master copywriting prompt with `COLD_EMAIL_KNOWLEDGE_BASE.md`. The 80-word rule is a **default, not a law** — it breaks it when the research says the offer genuinely needs explaining (e.g. a niche SaaS). Controls: versions (3–8) and word-limit posture (`strict` / `auto` / `explain`).
4. **ICP Brutal Test** — Claude becomes the exact ICP prospect, reads the copy cold, and scores it **1–10** with brutally honest reasoning. If it's below your bar (default **9**), it rewrites the weak spots and re-scores — looping until it passes or hits the round cap. One click applies the improved copy back to the Copywriting step.

Every step streams token-by-token, keeps its feedback history, and can be refined ("send feedback") or regenerated ("redo"). Clients are saved locally in your browser — no database.

---

## Setup

Requires Node 18+ (built on Node 24).

```bash
npm install
cp .env.example .env   # then add a credential (see below)
npm run dev            # http://localhost:3000
```

### Authentication (choose one, in `.env`)

The credential stays server-side (Next.js API routes) and is never sent to the browser.

- **`CLAUDE_CODE_OAUTH_TOKEN`** — from a Claude Pro/Max subscription. Generate with `claude setup-token` and paste the whole token.
- **`ANTHROPIC_API_KEY`** — a standard pay-per-token key. If set, it takes priority.

> **Rate limits:** the subscription OAuth token shares **one quota pool** with your other Claude usage (including a live Claude Code session). Under load you'll see `429` and the app will back off and retry. For heavy or concurrent use, set a dedicated `ANTHROPIC_API_KEY` — it has independent quota. A `429` means the token is valid but throttled; `401` means the token is wrong/expired (regenerate it).

### Optional env

- `COPYWRITER_MODEL` — override the model (default `claude-opus-4-8`).
- `DISABLE_WEB_TOOLS=1` — turn off live web research (agent works only from pasted content).

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |

---

## How it's built

- **Next.js 15 (App Router) + Tailwind v4 + shadcn/ui.** Dark terminal theme in `app/globals.css`.
- **API routes** (`app/api/{research,strategy,copywriting,icp}`) run on the Node.js runtime, build the Anthropic client from env, and **stream NDJSON frames** (`status`, `token`, `icp`, `final`, `done`, `error`).
- **`lib/anthropic.ts`** — client + streaming with prompt-caching of the (large) system block, live `web_search` / `web_fetch` server tools with graceful fallback if the credential can't use them, and `429/529` backoff.
- **`lib/prompts.ts`** — composes each node's system prompt from your source assets:
  - `research and strategy.txt` — the agency research + strategy methodology.
  - `content/copywriting-master.md` — the fused v1 + v2 copywriting system.
  - `COLD_EMAIL_KNOWLEDGE_BASE.md` — the knowledge base.
- **Client state** lives in `localStorage` (`hooks/use-projects.ts`); the terminal UI is in `components/terminal/*` and `app/page.tsx`.

Editing any of the three source assets above changes the agent's behavior on the next run — they're the single source of truth for prompts.
# copywriter-genflows
