import type { GeneratedEmail, LintIssue } from "./types.js";

// Phrases the knowledge base bans outright (§6.3 + hard rules). Lower-cased, matched as substrings.
const BANNED_PHRASES = [
  // generic openers
  "hope you're well", "hope you are well", "hope this finds you well",
  "just checking in", "i wanted to reach out", "i noticed that", "i saw that",
  // overused adjectives
  "impressive", "innovative", "cutting-edge", "industry-leading",
  "best-in-class", "world-class", "revolutionary", "game-changing",
  "game changing", "groundbreaking", "state-of-the-art", "next-generation",
  // tired jargon
  "leverage", "synergy", "value proposition", "best practices",
  "circle back", "touch base", "low-hanging fruit", "move the needle",
  "hit the ground running",
  // desperate follow-ups
  "just following up", "bumping this", "circling back",
  "following up on my last", "friendly reminder",
  // cliché social proof
  "trusted by", "fortune 500",
  // pushy sales language
  "limited time offer", "don't miss out", "act now",
  "limited spots", "once-in-a-lifetime", "special offer",
  "exclusive deal", "time-sensitive",
  // vague claims
  "10x your", "skyrocket your", "transform your business", "guaranteed success",
  // meeting requests
  "jump on a quick call", "grab 15 minutes", "quick sync", "hop on a call",
];

const WORD = /\b[\w'-]+\b/g;

function countWords(s: string): number {
  return (s.match(WORD) ?? []).length;
}

function findBanned(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

/**
 * Deterministic checks — the mechanically verifiable subset of the hard rules.
 * These need no LLM and run instantly, so they're the first gate.
 */
export function lint(email: GeneratedEmail): LintIssue[] {
  const issues: LintIssue[] = [];
  const push = (
    rule: string,
    detail: string,
    location: LintIssue["location"],
  ) => issues.push({ rule, detail, location });

  // ── Subject line ──────────────────────────────────────────────
  const subject = email.subject ?? "";
  if (/^(re:|fwd:)/i.test(subject.trim())) {
    push("no-re-fwd", `Subject starts with "Re:/Fwd:" — instant trust loss.`, "subject");
  }
  if (countWords(subject) > 6) {
    push("subject-length", `Subject is ${countWords(subject)} words (max 6).`, "subject");
  }
  const subjBanned = findBanned(subject);
  if (subjBanned.length) {
    push("banned-phrase", `Subject uses banned phrase(s): ${subjBanned.join(", ")}.`, "subject");
  }

  // ── Body ──────────────────────────────────────────────────────
  const body = email.body ?? "";
  const words = countWords(body);
  if (words > 80) {
    push("word-count", `Body is ${words} words (max 80).`, "body");
  }
  if (body.includes("—") || body.includes("–")) {
    push("no-em-dash", `Body uses an em/en dash. Use a hyphen or short sentences.`, "body");
  }
  if (body.includes("!")) {
    push("no-exclamation", `Body uses an exclamation mark. Never use one.`, "body");
  }
  const questionMarks = (body.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    push("one-question", `Body has ${questionMarks} question marks (max 1).`, "body");
  }
  const bodyBanned = findBanned(body);
  if (bodyBanned.length) {
    push("banned-phrase", `Body uses banned phrase(s): ${bodyBanned.join(", ")}.`, "body");
  }
  // Two-line-max paragraphs (rough heuristic: a paragraph shouldn't exceed ~35 words).
  for (const para of body.split(/\n\s*\n/)) {
    if (countWords(para) > 40) {
      push(
        "paragraph-length",
        `A paragraph runs long (${countWords(para)} words). Keep paragraphs to ~2 lines.`,
        "body",
      );
      break;
    }
  }

  // ── Follow-ups ────────────────────────────────────────────────
  email.follow_ups?.forEach((fu, i) => {
    if (fu.includes("—") || fu.includes("–")) {
      push("no-em-dash", `Follow-up #${i + 1} uses an em/en dash.`, "follow_up");
    }
    if (fu.includes("!")) {
      push("no-exclamation", `Follow-up #${i + 1} uses an exclamation mark.`, "follow_up");
    }
    const fuBanned = findBanned(fu);
    if (fuBanned.length) {
      push("banned-phrase", `Follow-up #${i + 1} uses: ${fuBanned.join(", ")}.`, "follow_up");
    }
  });

  return issues;
}
