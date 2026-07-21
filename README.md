# Copywriter Agent

An **agentic B2B cold-email writer**. It doesn't just prompt-and-print — it **drafts, critiques its own draft against a hard-rules knowledge base, and revises** until the copy passes both a deterministic linter and an LLM reviewer.

Built on [`COLD_EMAIL_KNOWLEDGE_BASE.md`](./COLD_EMAIL_KNOWLEDGE_BASE.md) — the 55 cheat codes, 13 psychology principles, 24+ templates, the GEX swipe file, and the power-words / phrases-to-avoid lists.

## How it works

```
BRIEF ──▶  draft  ──▶  lint (regex)  ──▶  critique (LLM)  ──▶  revise ──┐
             ▲                                                          │
             └──────────────── loop up to 3× until clean ◀─────────────┘
                                     │
                                     ▼
                        subject + body + follow-ups
```

- **Draft** — picks the best-fit template and writes, with the full knowledge base in the system prompt (prompt-cached).
- **Lint** — a deterministic pass (`src/linter.ts`) catches the mechanically checkable rules instantly: ≤80 words, no em dashes, no exclamation marks, ≤1 question mark, ≤6-word subject, no banned phrases, no `Re:/Fwd:`.
- **Critique** — an LLM reviewer judges the subjective rules: is the tone neutral, is it a real pattern interrupt, would the buyer actually reply?
- **Revise** — fixes every issue and loops. Two-layer validation is what makes the output reliably good instead of usually-good.

## Setup

```bash
npm install
cp .env.example .env      # then add your credential
```

### Credentials (`.env`)

Pick **one**:

- **`ANTHROPIC_API_KEY`** — a standard key from the [Anthropic Console](https://console.anthropic.com/settings/keys). Pay-per-token.
- **`CLAUDE_CODE_OAUTH_TOKEN`** — an OAuth token off your Claude Pro/Max subscription. Generate it with:
  ```bash
  claude setup-token
  ```
  Paste the result into `.env` and leave `ANTHROPIC_API_KEY` blank.

The client auto-detects which one is present (`src/client.ts`).

## Usage

```bash
# See the brief format
npm run write -- --example

# Write from a brief
npm run write -- briefs/example.json
```

Progress prints to stderr; the finished email prints to stdout.

### The brief

A brief tells the agent who it's writing to and what's on offer. The agent is only as good as the personalization you feed it — that's the whole thesis of the knowledge base.

```jsonc
{
  "prospect": {
    "first_name": "John",
    "role": "VP of Sales",
    "company": "Acme",
    "industry": "HR tech",
    "personalization_signals": ["hiring 3 SDRs", "just expanded into Europe"],
    "colleagues": ["Sarah (RevOps lead)"]
  },
  "offer": {
    "outcome": "book more qualified meetings without adding headcount",  // what they CARE about, not your service
    "social_proof": ["Personifics (also an HR platform)"],
    "lead_magnet": "a 3-step SDR onboarding framework"                   // optional
  },
  "campaign": {
    "channel": "email",          // or "linkedin"
    "sequence_length": 2,        // number of follow-ups (0-3)
    "template": "Poke the Bear", // optional; omit to let the agent choose
    "tone": "neutral"            // "neutral" | "unhinged" | "playful"
  }
}
```

## Project layout

| File | Role |
|---|---|
| `COLD_EMAIL_KNOWLEDGE_BASE.md` | The rules/templates the agent writes against |
| `src/agent.ts` | The draft → lint → critique → revise loop |
| `src/linter.ts` | Deterministic rule checks (no LLM) |
| `src/prompts.ts` | Writer + critic system prompts |
| `src/client.ts` | Auth detection (API key vs OAuth token) |
| `src/index.ts` | CLI |
| `briefs/` | Example brief(s) |

## Extending

- **Live research** — add a step before `run()` that scrapes a site/LinkedIn and fills `personalization_signals`.
- **Batch mode** — loop `run()` over a CSV/list of prospects.
- **Send integration** — pipe the output into Smartlead / Instantly / a CRM.
- **Tighter linting** — add rules to `BANNED_PHRASES` or new checks in `src/linter.ts`.
