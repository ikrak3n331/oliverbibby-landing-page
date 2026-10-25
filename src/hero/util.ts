// ============================================================
// HERO STORY — MATH HELPERS
// ============================================================

export const TAU = Math.PI * 2;

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const fract = (v: number): number => v - Math.floor(v);
export const invLerp = (a: number, b: number, v: number): number => clamp((v - a) / (b - a));

export const smoothstep = (a: number, b: number, v: number): number => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};

// ── Easing ───────────────────────────────────────────────────
export type Ease = (t: number) => number;

export const linear: Ease = (t) => t;
export const inCubic: Ease = (t) => t * t * t;
export const outCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const inOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const outExpo: Ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const inOutSine: Ease = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
export const outBack: Ease = (t) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/** Eased 0 → 1 progress through the window [start, start + dur]. */
export const seg = (T: number, start: number, dur: number, ease: Ease = inOutCubic): number =>
  ease(clamp((T - start) / dur));

/** Envelope that rises over [a, a + fadeIn] and falls over [b, b + fadeOut]. */
export const env = (T: number, a: number, b: number, fadeIn = 0.6, fadeOut = 0.6): number =>
  Math.min(seg(T, a, fadeIn, outCubic), 1 - seg(T, b, fadeOut, inCubic));

// ── Randomness ───────────────────────────────────────────────
/** Small seeded PRNG so every visitor sees the same choreography. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cheap smooth pseudo-noise in roughly [-1, 1]. */
export const wobble = (t: number, seed: number): number =>
  Math.sin(t * 1.31 + seed * 12.9898) * 0.5 +
  Math.sin(t * 2.17 + seed * 78.233) * 0.3 +
  Math.sin(t * 0.73 + seed * 37.719) * 0.2;

// ── Curves ───────────────────────────────────────────────────
export const bez = (a: number, b: number, c: number, d: number, t: number): number => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};

export const bezD = (a: number, b: number, c: number, d: number, t: number): number => {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
};
