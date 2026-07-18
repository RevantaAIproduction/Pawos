import type { Viseme } from '../LipSyncTypes';

/**
 * Approximate character -> viseme mapping. This is NOT true phoneme
 * analysis — it's a heuristic used only when a provider gives us
 * character-level timing but not real phoneme/viseme data (e.g. ElevenLabs'
 * alignment response). Providers that return real phoneme timing should
 * bypass this and map directly.
 */
const MAP: Record<string, Viseme> = {
  a: 'aa', e: 'E', i: 'ih', o: 'oh', u: 'ou',
  p: 'PP', b: 'PP', m: 'PP',
  f: 'FF', v: 'FF',
  t: 'DD', d: 'DD', n: 'nn',
  k: 'kk', g: 'kk', c: 'kk', q: 'kk',
  s: 'SS', z: 'SS',
  r: 'RR',
  l: 'DD',
  h: 'sil',
  th: 'TH',
  ch: 'CH', j: 'CH', sh: 'CH',
};

export function graphemeToViseme(char: string): Viseme {
  const lower = char.toLowerCase();
  if (!/[a-z]/.test(lower)) return 'sil';
  return MAP[lower] ?? 'sil';
}
