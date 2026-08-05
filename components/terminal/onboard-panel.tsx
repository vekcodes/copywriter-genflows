"use client";

import * as React from "react";
import { Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function OnboardPanel({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    website: string;
    onboardingDocs: string;
    strategyIdea: string;
  }) => void;
}) {
  const [name, setName] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [onboardingDocs, setOnboardingDocs] = React.useState("");
  const [strategyIdea, setStrategyIdea] = React.useState("");

  const canSubmit = name.trim() && (website.trim() || onboardingDocs.trim());

  return (
    <div className="mx-auto max-w-2xl py-10">
      <div className="term-surface rounded-lg border border-border p-6">
        <div className="mb-1 flex items-center gap-2 text-primary">
          <Rocket className="size-4" />
          <h2 className="text-sm font-bold tracking-wide">Onboard a client</h2>
        </div>
        <p className="mb-5 text-xs text-muted-foreground">
          Drop in what you have. The agent researches, builds signal + fallback
          strategies, writes the copy, then role-plays the prospect to
          pressure-test it. Everything below is stored locally in your browser.
        </p>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">
              Client name
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Safety Systems"
              className="bg-background/60 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="website" className="text-xs">
              Website URL
            </Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://acmesafety.com"
              className="bg-background/60 font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="docs" className="text-xs">
              Onboarding docs / questionnaire
              <span className="ml-1 text-muted-foreground">
                (offers, ICP, differentiators, proof, competitors)
              </span>
            </Label>
            <Textarea
              id="docs"
              value={onboardingDocs}
              onChange={(e) => setOnboardingDocs(e.target.value)}
              placeholder="Paste the client's onboarding questionnaire, offer list, value prop, case studies, competitor notes…"
              rows={8}
              className="resize-y bg-background/60 font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idea" className="text-xs">
              Strategy idea{" "}
              <span className="text-muted-foreground">
                (optional — leave blank to let Claude propose)
              </span>
            </Label>
            <Textarea
              id="idea"
              value={strategyIdea}
              onChange={(e) => setStrategyIdea(e.target.value)}
              placeholder="e.g. Target ops leaders at mid-size school districts after a safety incident makes local news…"
              rows={3}
              className="resize-y bg-background/60 font-mono text-sm"
            />
          </div>

          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onCreate({ name, website, onboardingDocs, strategyIdea })
            }
            className="w-full"
          >
            <Rocket className="size-3.5" /> Create client & start pipeline
          </Button>
          {!canSubmit && (
            <p className="text-center text-[11px] text-muted-foreground">
              Add a client name and at least a website or onboarding docs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
