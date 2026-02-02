export type KnownModel = { id: string; label: string };

export const KNOWN_MODELS: KnownModel[] = [
  { id: "gpt-5-nano", label: "gpt-5-nano (cheapest, high throughput)" },
  { id: "gpt-5-mini", label: "gpt-5-mini (default, cost optimized reasoning)" },
  { id: "gpt-4o-mini", label: "gpt-4o-mini (cheap, very fast)" },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini (small, big context)" },
  { id: "gpt-5.1", label: "gpt-5.1 (flagship, more expensive)" },
];

// Rough prices per 1M tokens (estimates only)
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.1": { input: 1.25, output: 10.0 },
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};
