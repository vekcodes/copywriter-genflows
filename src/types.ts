// Shared types for the copywriter agent.

/** Everything the agent needs to know about who it's writing to and what's on offer. */
export interface Brief {
  prospect: {
    first_name: string;
    role?: string;
    company?: string;
    industry?: string;
    /** Research hooks: hiring signals, funding, LinkedIn posts, tech stack, recent wins, etc. */
    personalization_signals?: string[];
    colleagues?: string[];
  };
  offer: {
    /** The outcome the buyer actually cares about (NOT your mechanism/service). */
    outcome: string;
    /** Relevant case studies / social proof (ideally competitors or adjacent companies). */
    social_proof?: string[];
    /** Optional resource you can give first (lead magnet). */
    lead_magnet?: string;
  };
  campaign: {
    channel?: "email" | "linkedin";
    /** How many follow-ups to generate (0-3). */
    sequence_length?: number;
    /** Which template to use; omit to let the agent choose. */
    template?: string;
    /** Tone dial. */
    tone?: "neutral" | "unhinged" | "playful";
  };
}

export interface GeneratedEmail {
  template_used: string;
  subject: string;
  body: string;
  follow_ups: string[];
  /** Which psychology levers (§2) the agent leaned on. */
  levers_used: string[];
}

export interface LintIssue {
  rule: string;
  detail: string;
  location: "subject" | "body" | "follow_up";
}

export interface CritiqueIssue {
  rule: string;
  problem: string;
  suggestion: string;
}

export interface Critique {
  passes: boolean;
  issues: CritiqueIssue[];
}
