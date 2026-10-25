// ============================================================
// HERO STORY — COLOUR RAMP
// One warm → cool → white ramp. Particles carry a float index into
// it, so colour transitions sweep through neighbouring hues.
// ============================================================

import { clamp } from './util';

const STOPS = [
  '#fbbf24', // 0 amber    — friction, bottlenecks, leadership
  '#fb7185', // 1 rose
  '#e879f9', // 2 fuchsia
  '#a78bfa', // 3 violet   — brand secondary
  '#818cf8', // 4 indigo   — brand primary
  '#60a5fa', // 5 blue
  '#38bdf8', // 6 sky
  '#22d3ee', // 7 cyan     — future state, clarity
  '#a5f3fc', // 8 ice
  '#f8fafc', // 9 white
];

export const C = {
  amber: 0,
  rose: 1,
  fuchsia: 2,
  violet: 3,
  indigo: 4,
  blue: 5,
  sky: 6,
  cyan: 7,
  ice: 8,
  white: 9,
} as const;

const STEPS = 4;
const MAX = STOPS.length - 1;

const hex = (h: string): [number, number, number] => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

/** Pre-mixed ramp, STEPS entries between each stop. */
export const RAMP: [number, number, number][] = [];
for (let s = 0; s < MAX; s++) {
  const a = hex(STOPS[s]);
  const b = hex(STOPS[s + 1]);
  for (let k = 0; k < STEPS; k++) {
    const t = k / STEPS;
    RAMP.push([
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t),
    ]);
  }
}
RAMP.push(hex(STOPS[MAX]));

const RGB = RAMP.map(([r, g, b]) => `${r},${g},${b}`);

export const rampIndex = (c: number): number => Math.round(clamp(c, 0, MAX) * STEPS);

export const rgba = (c: number, a: number): string => `rgba(${RGB[rampIndex(c)]},${clamp(a).toFixed(3)})`;
