import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  console.warn(
    "[study-logos] ANTHROPIC_API_KEY is not set; POST /api/breakdown will fail until configured.",
  );
}

export const anthropic = apiKey ? new Anthropic({ apiKey }) : null;
