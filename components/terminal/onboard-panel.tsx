"use client";

import * as React from "react";
import { Rocket, UploadCloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const ACCEPTED_EXTENSIONS = ["pdf", "docx", "txt", "md", "markdown"];

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i === -1 ? "" : filename.slice(i + 1).toLowerCase();
}

export function OnboardPanel({
  onCreate,
}: {
  onCreate: (input: {
    name: string;
    website: string;
    valueProp: string;
    offers: string;
    onboardingDocs: string;
    strategyIdea: string;
  }) => void;
}) {
  const [name, setName] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [valueProp, setValueProp] = React.useState("");
  const [offers, setOffers] = React.useState("");
  const [onboardingDocs, setOnboardingDocs] = React.useState("");
  const [strategyIdea, setStrategyIdea] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const canSubmit = name.trim() && (website.trim() || onboardingDocs.trim());

  const uploadFiles = async (files: File[]) => {
    const valid = files.filter((f) => ACCEPTED_EXTENSIONS.includes(extOf(f.name)));
    const rejected = files.filter((f) => !ACCEPTED_EXTENSIONS.includes(extOf(f.name)));
    rejected.forEach((f) => toast.error(`Skipped ${f.name} — use PDF, DOCX, TXT, or MD.`));
    if (!valid.length) return;

    setUploading(true);
    const chunks: string[] = [];
    for (const file of valid) {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/parse-doc", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed to read ${file.name}`);
        chunks.push(`--- ${file.name} ---\n${data.text}`);
      } catch (err: any) {
        toast.error(err?.message ?? `Failed to read ${file.name}`);
      }
    }
    setUploading(false);
    if (chunks.length) {
      setOnboardingDocs((prev) => (prev ? `${prev}\n\n${chunks.join("\n\n")}` : chunks.join("\n\n")));
      toast.success(`Added ${chunks.length} file${chunks.length > 1 ? "s" : ""} to onboarding docs`);
    }
  };

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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="value-prop" className="text-xs">
                Value prop{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="value-prop"
                value={valueProp}
                onChange={(e) => setValueProp(e.target.value)}
                placeholder="What they sell and why it's genuinely different…"
                rows={3}
                className="resize-y bg-background/60 font-mono text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offers" className="text-xs">
                Offers{" "}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Textarea
                id="offers"
                value={offers}
                onChange={(e) => setOffers(e.target.value)}
                placeholder="Lead magnets / offers, one per line — e.g. free audit, ROI calculator…"
                rows={3}
                className="resize-y bg-background/60 font-mono text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="docs" className="text-xs">
              Onboarding docs / questionnaire
              <span className="ml-1 text-muted-foreground">
                (ICP, differentiators, proof, competitors — value prop/offers can live here too)
              </span>
            </Label>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                uploadFiles(Array.from(e.dataTransfer.files));
              }}
              className={`rounded-md border transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-transparent"
              }`}
            >
              <Textarea
                id="docs"
                value={onboardingDocs}
                onChange={(e) => setOnboardingDocs(e.target.value)}
                placeholder="Paste the client's onboarding questionnaire, case studies, competitor notes… or drop / upload PDF, DOCX, TXT, or MD files below."
                rows={8}
                className="resize-y bg-background/60 font-mono text-sm"
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(Array.from(e.target.files));
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full font-mono text-xs"
            >
              {uploading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Reading files…
                </>
              ) : (
                <>
                  <UploadCloud className="size-3.5" /> Upload or drop PDF / DOCX / TXT / MD
                </>
              )}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="idea" className="text-xs">
              Strategy idea{" "}
              <span className="text-muted-foreground">
                (optional — a starting point Claude will still fully strategize
                around, not use as-is; leave blank to let it propose from scratch)
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
              onCreate({ name, website, valueProp, offers, onboardingDocs, strategyIdea })
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
