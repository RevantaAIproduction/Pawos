export type NarrationLine = { text: string; durationMs: number };

/**
 * Scripted, deterministic self-introduction — not AI-generated. Honest
 * about what this preview is (a visual demo, no reasoning behind it) and
 * where the real, AI-powered companion actually lives (the desktop app,
 * gated by tier).
 */
export const NARRATION_LINES: NarrationLine[] = [
  { text: "Hi, I'm Paw.", durationMs: 2200 },
  {
    text: 'On your desktop, I plan and execute real work — files, terminals, browsers, deployments, and more.',
    durationMs: 4200,
  },
  {
    text: "Here on the website, I'm just a visual preview — there's no AI running behind me right now.",
    durationMs: 4200,
  },
  {
    text: 'Paw Go is free and gives you a real companion with local features — no AI models included.',
    durationMs: 4000,
  },
  {
    text: 'Pro, Pro Max, Team, and Enterprise unlock real AI conversations, memory, and autonomous engineering.',
    durationMs: 4400,
  },
  { text: 'Download PawOS to meet the real me.', durationMs: 2600 },
];
