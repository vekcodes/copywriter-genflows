#!/usr/bin/env node
import "dotenv/config";
import { readFileSync } from "node:fs";
import { makeClient } from "./client.js";
import { run } from "./agent.js";
import type { Brief } from "./types.js";

function usage(): never {
  console.error(`
Copywriter Agent — agentic B2B cold-email writer

Usage:
  npm run write -- <brief.json>          Write from a brief file
  npm run write -- --example            Print an example brief and exit

The brief is JSON. See briefs/example.json or run with --example.
`);
  process.exit(1);
}

const EXAMPLE: Brief = {
  prospect: {
    first_name: "John",
    role: "VP of Sales",
    company: "Acme",
    industry: "HR tech",
    personalization_signals: ["hiring 3 SDRs", "just expanded into Europe"],
    colleagues: ["Sarah (RevOps lead)"],
  },
  offer: {
    outcome: "book more qualified meetings without adding headcount",
    social_proof: ["Personifics (also an HR platform)"],
    lead_magnet: "a 3-step SDR onboarding framework",
  },
  campaign: { channel: "email", sequence_length: 2, tone: "neutral" },
};

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "-h" || args[0] === "--help") usage();

  if (args[0] === "--example") {
    console.log(JSON.stringify(EXAMPLE, null, 2));
    return;
  }

  const brief: Brief = JSON.parse(readFileSync(args[0], "utf8"));
  const client = makeClient();

  const { email, rounds, clean } = await run(client, brief, {
    onProgress: (m) => console.error(`  · ${m}`),
  });

  console.log("\n" + "─".repeat(60));
  console.log(`Template: ${email.template_used}`);
  console.log(`Levers:   ${email.levers_used.join(", ")}`);
  console.log(`Rounds:   ${rounds}   ${clean ? "✅ clean" : "⚠️  best effort"}`);
  console.log("─".repeat(60));
  console.log(`\nSubject: ${email.subject}\n`);
  console.log(email.body);
  email.follow_ups.forEach((fu, i) => {
    console.log(`\n--- Follow-up ${i + 1} ---\n${fu}`);
  });
  console.log("");
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
