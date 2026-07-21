import Anthropic from "@anthropic-ai/sdk";

export const MODEL = process.env.COPYWRITER_MODEL ?? "claude-opus-4-8";

/**
 * Build an Anthropic client from whatever credential is in the environment.
 *
 * Priority:
 *   1. ANTHROPIC_API_KEY            — standard pay-per-token key (uses x-api-key)
 *   2. CLAUDE_CODE_OAUTH_TOKEN /
 *      ANTHROPIC_AUTH_TOKEN         — OAuth bearer token from `claude setup-token`
 *                                     (subscription auth; needs the oauth beta header)
 */
export function makeClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const oauthToken = (
    process.env.CLAUDE_CODE_OAUTH_TOKEN ?? process.env.ANTHROPIC_AUTH_TOKEN
  )?.trim();

  if (apiKey) {
    return new Anthropic({ apiKey });
  }

  if (oauthToken) {
    // OAuth tokens authenticate via `Authorization: Bearer` (the SDK's `authToken`),
    // and the Messages API requires this beta header when using one.
    return new Anthropic({
      authToken: oauthToken,
      defaultHeaders: { "anthropic-beta": "oauth-2025-04-20" },
    });
  }

  throw new Error(
    "No credentials found. Set ANTHROPIC_API_KEY, or run `claude setup-token` " +
      "and put the result in CLAUDE_CODE_OAUTH_TOKEN. See .env.example.",
  );
}
