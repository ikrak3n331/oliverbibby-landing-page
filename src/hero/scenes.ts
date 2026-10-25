// ============================================================
// HERO STORY — CHOREOGRAPHY
// Five chapters played out by a single particle field. The copy
// moves between the left, right and centre of the hero chapter by
// chapter; each chapter composes its visual in the space the copy
// leaves free (its stage), and the particles sweep across between
// stages. Every position is a pure function of story time T (so
// any moment can be seeked) and ambient time A (which keeps the
// field breathing while paused or idle).
// ============================================================

import { IDENTITY } from './engine';
import type { Renderer, Stage, Vec3 } from './engine';
import { C, rgba } from './palette';
import {
  TAU, bez, bezD, clamp, env, fract, inOutCubic, lerp, mulberry32, outBack, outCubic, seg, smoothstep, wobble,
} from './util';

// ── Timeline ─────────────────────────────────────────────────
export type Align = 'left' | 'right' | 'center';

export interface Chapter {
  label: string;
  start: number;
  align: Align; // where the copy sits; the visual takes the rest
}

export const CHAPTERS: Chapter[] = [
  { label: 'Direction', start: 0, align: 'left' },
  { label: 'Partnership', start: 9, align: 'right' },
  { label: 'Blueprint', start: 19, align: 'center' },
  { label: 'People', start: 30.4, align: 'right' },
  { label: 'Hello', start: 40.4, align: 'left' },
];

/** The story hands over to the real hero copy. */
export const FINAL = 40.4;
/** Story complete; everything after this is ambient motion. */
export const END = 44.4;
/** The soundtrack's beat: the final frame lands on the downbeat of bar 19. */
export const BEAT = FINAL / 76;

export interface Caption {
  t: number; // starts revealing
  out: number; // starts leaving; finishes before the next chapter moves the copy
  text: string;
  stagger?: number; // seconds between words
}

/** On-screen copy. *Asterisks* mark the serif-italic accent words. */
export const CAPTIONS: Caption[] = [
  { t: 0.5, out: 4.0, text: 'Great digital systems don’t happen in a *vacuum.*' },
  { t: 4.4, out: 8.3, text: 'They happen when clear *direction* and empowered *people* move together.' },
  { t: 9.3, out: 12.3, text: 'As an Experience Lead, my role goes far *beyond the screen.*' },
  { t: 12.7, out: 15.4, text: 'I partner with leadership, product managers, project managers and developers…' },
  { t: 15.8, out: 18.35, text: '…turning competing priorities into a *single, connected vision.*' },
  { t: 19.3, out: 22.6, text: 'I map where we are *today*, and forecast where we need to be *tomorrow.*' },
  { t: 23.0, out: 26.2, text: 'Untangling current-state bottlenecks. Architecting future-state *blueprints.*' },
  { t: 26.6, out: 29.7, text: 'Governance, frameworks and best practices that let enterprise platforms *scale seamlessly.*' },
  { t: 30.8, out: 33.7, text: 'True UX leadership isn’t just about designing *systems.*' },
  { t: 34.1, out: 37.3, text: 'It’s about empowering and elevating the *people* who build them.' },
  { t: BEAT * 71, out: 40.2, text: '*Clarity.* *Capability.* *Confidence.*', stagger: BEAT * 2 },
];

// Beats the visuals land on, shared with the soundtrack
const DROP = BEAT * 28; // bar 7: competing threads become one ring
const SCALE = BEAT * 52; // bar 13: the system tiles out
const CLARITY = BEAT * 71;
const CAPABILITY = BEAT * 73;
const CONFIDENCE = BEAT * 75;

// ── Particle model ───────────────────────────────────────────
interface Out {
  x: number;
  y: number;
  z: number;
  s: number; // radius, CSS px
  a: number; // alpha
  c: number; // palette index
}

type Formation = (i: number, A: number, T: number, o: Out) => void;
type StageName = 'world' | 'right' | 'left' | 'bottom';

interface Step {
  f: Formation;
  stage: StageName; // the formation's coordinates are local to this stage
  t: number; // transition into this formation starts
  dur: number; // per-particle transition length
  stagger: number; // spread of per-particle start times
}

const blank = (): Out => ({ x: 0, y: 0, z: 0, s: 0, a: 0, c: 0 });

type Curve = (t: number, out: Vec3) => void;

/** Point at fraction t along a rounded rectangle's perimeter. */
function roundRectAt(cx: number, cy: number, w: number, h: number, r: number, t: number, out: Vec3): void {
  const hw = w / 2;
  const hh = h / 2;
  const ew = w - 2 * r;
  const eh = h - 2 * r;
  const ar = (Math.PI / 2) * r;
  let d = fract(t) * (2 * ew + 2 * eh + 4 * ar);
  out.z = 0;
  const arc = (ox: number, oy: number, from: number) => {
    const a = from + (Math.min(d, ar) / ar) * (Math.PI / 2);
    out.x = ox + Math.cos(a) * r;
    out.y = oy + Math.sin(a) * r;
  };
  if (d < ew) { out.x = cx - hw + r + d; out.y = cy - hh; return; }
  d -= ew;
  if (d < ar) { arc(cx + hw - r, cy - hh + r, -Math.PI / 2); return; }
  d -= ar;
  if (d < eh) { out.x = cx + hw; out.y = cy - hh + r + d; return; }
  d -= eh;
  if (d < ar) { arc(cx + hw - r, cy + hh - r, 0); return; }
  d -= ar;
  if (d < ew) { out.x = cx + hw - r - d; out.y = cy + hh; return; }
  d -= ew;
  if (d < ar) { arc(cx - hw + r, cy + hh - r, Math.PI / 2); return; }
  d -= ar;
  if (d < eh) { out.x = cx - hw; out.y = cy + hh - r - d; return; }
  d -= eh;
  arc(cx - hw + r, cy - hh + r, Math.PI);
}

export interface Story {
  render(T: number, A: number): void;
}

export function createStory(R: Renderer, N: number): Story {
  const rnd = mulberry32(0x0b1bb7);
  const r1 = new Float32Array(N);
  const r2 = new Float32Array(N);
  const r3 = new Float32Array(N);
  const r4 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    r1[i] = rnd();
    r2[i] = rnd();
    r3[i] = rnd();
    r4[i] = rnd();
  }
  const v3: Vec3 = { x: 0, y: 0, z: 0 };

  // ── Stages ─────────────────────────────────────────────────
  // Where each chapter's visual lives, derived from where the copy
  // sits: beside it on wide screens, above it on narrow ones.
  const ST: Record<StageName, Stage> = { world: IDENTITY, right: IDENTITY, left: IDENTITY, bottom: IDENTITY };
  const stageFs = (st: Stage) => clamp((st.s * R.view.S) / 300, 0.78, 1.12);
  let fsRight = 1;
  let fsLeft = 1;
  let fsBottom = 1;

  // Text edges in CSS px, per chapter, for dimming particles behind copy
  const edge = [0, 0, 0, 0, 0];

  let geo = -1;
  function sync(): void {
    if (R.version === geo) return;
    geo = R.version;
    const v = R.view;
    const L = v.layout;
    if (L.stacked) {
      const top = R.stageFor(L.top);
      ST.right = ST.left = ST.bottom = top;
      edge.fill(L.top.y + L.top.h);
    } else {
      const gap = 40;
      const bleed = clamp(v.w - (L.copy.x + L.copy.w) - 40, 0, 240);
      const rx0 = L.copy.x + L.col + gap;
      ST.right = R.stageFor({ x: rx0, y: L.copy.y, w: L.copy.x + L.copy.w + bleed - rx0, h: L.copy.h });
      const lx1 = L.copy.x + L.copy.w - L.col - gap;
      ST.left = R.stageFor({ x: L.copy.x - bleed, y: L.copy.y, w: lx1 - (L.copy.x - bleed), h: L.copy.h });
      const by0 = L.centerBottom + 24;
      ST.bottom = R.stageFor({ x: 0, y: by0, w: v.w, h: Math.max(180, v.h - 96 - by0) });
      edge[0] = L.copy.x + L.col + 10;
      edge[1] = L.copy.x + L.copy.w - L.col - 10;
      edge[2] = L.centerBottom + 10;
      edge[3] = edge[1];
      edge[4] = L.finalRight + 10;
    }
    fsRight = stageFs(ST.right);
    fsLeft = stageFs(ST.left);
    fsBottom = stageFs(ST.bottom);
    R.fs = fsRight;
  }

  /** How visible a particle at (px, py) is, given where chapter k's copy sits. */
  function legible(k: number, px: number, py: number): number {
    const e = edge[k];
    if (R.view.layout.stacked) return 0.2 + 0.8 * (1 - smoothstep(e - 60, e + 20, py));
    switch (CHAPTERS[k].align) {
      case 'left':
        return 0.2 + 0.8 * smoothstep(e - 40, e + 110, px);
      case 'right':
        return 0.2 + 0.8 * (1 - smoothstep(e - 110, e + 40, px));
      default:
        return 0.2 + 0.8 * smoothstep(e - 40, e + 80, py);
    }
  }

  /** A bright packet at u along a curve, trailing a fading tail. */
  function trail(fn: Curve, u: number, len: number, a: number, c: number, fs: number, size = 2.2, wrap = false): void {
    if (a <= 0.01) return;
    for (let k = 5; k >= 0; k--) {
      const t = u - (len * k) / 5;
      if (t < 0 && !wrap) continue;
      fn(t, v3);
      R.project(v3.x, v3.y, v3.z);
      const f = 1 - k / 6;
      R.dot(R.px, R.py, size * fs * (0.45 + 0.55 * f) * R.pk, a * f * f, c);
    }
  }

  const rrPath = (cx: number, cy: number, w: number, h: number, r: number) =>
    R.curve((t, out) => roundRectAt(cx, cy, w, h, r, t, out), 0, 1, 56);

  // ── 01 · Direction (copy left, visual right) ───────────────
  // Particles drift in a void until a line of direction is drawn;
  // then they fall in behind it as one stream.

  const fVoid: Formation = (i, A, _T, o) => {
    const v = R.view;
    o.x = lerp(v.left - 0.1, v.right + 0.1, r1[i]) + Math.sin(A * 0.07 + r3[i] * TAU) * 0.12;
    o.y = lerp(v.top - 0.1, v.bottom + 0.1, r2[i]) + Math.cos(A * 0.06 + r4[i] * TAU) * 0.1;
    o.z = (r3[i] * 2 - 1) * 0.8;
    o.s = 0.6 + r4[i] * 1.2;
    o.a = (0.22 + r3[i] * 0.5) * (0.65 + 0.35 * Math.sin(A * 1.3 + r2[i] * 40));
    o.c = C.violet + r1[i] * 1.8;
  };

  const sp = { x: 0, y: 0, nx: 0, ny: 0 };
  /** Point and normal on the direction path in the right stage, u ∈ [0, 1]. */
  function streamAt(u: number): void {
    const st = ST.right;
    const narrow = R.view.layout.stacked;
    const left = (R.view.left - st.cx) / st.s; // canvas edge, local units
    const x0 = left - 0.25;
    const y0 = narrow ? 0.72 : 0.62;
    const x1 = narrow ? -0.7 : Math.max(left * 0.45, -1.5);
    const y1 = 0.92;
    const x2 = -0.2;
    const y2 = -0.62;
    const x3 = 0.74;
    const y3 = -0.14;
    sp.x = bez(x0, x1, x2, x3, u);
    sp.y = bez(y0, y1, y2, y3, u);
    const tx = bezD(x0, x1, x2, x3, u);
    const ty = bezD(y0, y1, y2, y3, u);
    const len = Math.hypot(tx, ty) || 1;
    sp.nx = -ty / len;
    sp.ny = tx / len;
  }
  const streamCurve: Curve = (t, out) => {
    streamAt(t);
    out.x = sp.x;
    out.y = sp.y;
    out.z = 0;
  };

  const fStream: Formation = (i, A, _T, o) => {
    const u = fract(r1[i] + A * 0.05 * (0.75 + r2[i] * 0.5));
    streamAt(u);
    const w = 0.34 * Math.pow(1 - u, 1.3) + 0.012;
    const lat = (r3[i] * 2 - 1) * w + Math.sin(u * 16 + A * 1.4 + r4[i] * TAU) * 0.01;
    o.x = sp.x + sp.nx * lat;
    o.y = sp.y + sp.ny * lat;
    o.z = (r4[i] * 2 - 1) * w * 0.9;
    o.s = 0.7 + u * 1.4;
    o.a = smoothstep(0, 0.12, u) * (1 - smoothstep(0.92, 1, u)) * (0.45 + 0.55 * u);
    o.c = C.violet + u * 3.8;
  };

  function drawDirection(T: number, A: number): void {
    const vis = env(T, 3.3, 8.7, 0.25, 0.9);
    if (vis <= 0) return;
    R.setStage(ST.right);
    const { ctx } = R;
    const fs = fsRight;
    const drawn = seg(T, 3.3, 1.5, inOutCubic);

    ctx.beginPath();
    R.curve(streamCurve, 0, drawn, 110);
    if (R.view.layout.stacked) {
      R.glowStroke(C.indigo, 0.5 * vis, 1.2 * fs, 0.14);
    } else {
      // fade the line out behind the copy
      const grad = ctx.createLinearGradient(edge[0] - 40, 0, edge[0] + 160, 0);
      grad.addColorStop(0, rgba(C.indigo, 0.1 * vis));
      grad.addColorStop(1, rgba(C.indigo, 0.55 * vis));
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.2 * fs;
      ctx.stroke();
    }

    if (drawn < 1) {
      streamAt(drawn);
      R.project(sp.x, sp.y, 0);
      R.dot(R.px, R.py, 4 * fs, vis, C.white);
    }

    const pk = seg(T, 4.6, 0.6, outCubic) * vis;
    for (let k = 0; k < 3; k++) {
      const u = fract(A * 0.16 + k / 3);
      trail(streamCurve, u, 0.035, pk * smoothstep(0.15, 0.3, u) * (1 - smoothstep(0.9, 1, u)), C.ice, fs);
    }

    const b = seg(T, 4.5, 0.8, outCubic) * vis;
    if (b > 0) {
      streamAt(1);
      R.project(sp.x, sp.y, 0);
      const x = R.px;
      const y = R.py;
      R.dot(x, y, 5 * fs, b, C.ice);
      R.dot(x, y, 15 * fs, b * 0.25, C.sky);
      for (let k = 0; k < 2; k++) {
        const ph = fract(A * 0.5 + k * 0.5);
        R.ring(x, y, (6 + ph * 36) * fs, b * (1 - ph) * 0.45, C.sky);
      }
    }
  }

  // ── 02 · Partnership (copy right, visual left) ─────────────
  // The stream assembles into a screen. The screen shrinks to the
  // centre as four stakeholder groups appear around it, pulling in
  // different directions until their threads resolve into one ring.

  const scrX = new Float32Array(N);
  const scrY = new Float32Array(N);
  const scrS = new Float32Array(N);
  const scrA = new Float32Array(N);
  const scrC = new Float32Array(N);
  {
    let n = 0;
    const put = (x: number, y: number, s: number, a: number, c: number) => {
      if (n >= N) return;
      scrX[n] = x;
      scrY[n] = y;
      scrS[n] = s;
      scrA[n] = a;
      scrC[n] = c;
      n++;
    };
    const count = (f: number) => Math.max(3, Math.round(N * f));
    const line = (x1: number, y1: number, x2: number, y2: number, m: number, s: number, a: number, c: number) => {
      for (let k = 0; k < m; k++) {
        const t = k / (m - 1);
        put(lerp(x1, x2, t), lerp(y1, y2, t), s, a, c);
      }
    };
    const rr = (cx: number, cy: number, w: number, h: number, r: number, m: number, s: number, a: number, c: number) => {
      for (let k = 0; k < m; k++) {
        roundRectAt(cx, cy, w, h, r, k / m, v3);
        put(v3.x, v3.y, s, a, c);
      }
    };

    rr(0, 0, 1.5, 1.0, 0.07, count(0.22), 1.1, 0.95, C.indigo + 0.5); // window
    line(-0.75, -0.37, 0.75, -0.37, count(0.05), 0.85, 0.6, C.indigo); // title bar
    [C.rose, C.amber, C.cyan].forEach((c, k) => {
      for (let j = 0; j < 4; j++) put(-0.67 + k * 0.055 + (rnd() - 0.5) * 0.008, -0.435 + (rnd() - 0.5) * 0.008, 1.2, 0.9, c);
    });
    rr(0.1, -0.435, 0.56, 0.05, 0.025, count(0.035), 0.8, 0.55, C.violet); // address bar
    line(-0.64, -0.25, -0.06, -0.25, count(0.05), 1.35, 1, C.ice); // headline
    line(-0.64, -0.17, -0.2, -0.17, count(0.04), 1.35, 1, C.ice);
    line(-0.64, -0.08, -0.36, -0.08, count(0.025), 1, 0.75, C.violet); // body copy
    rr(-0.535, 0.03, 0.21, 0.064, 0.032, count(0.035), 1.05, 0.95, C.fuchsia); // call to action
    rr(0.36, -0.13, 0.6, 0.34, 0.035, count(0.05), 0.95, 0.85, C.sky); // image
    for (let k = count(0.07); k > 0; k--) put(lerp(0.09, 0.63, rnd()), lerp(-0.28, 0.02, rnd()), 0.7, 0.3, C.sky);
    for (const cx of [-0.48, 0, 0.48]) {
      rr(cx, 0.3, 0.42, 0.25, 0.03, count(0.045), 0.95, 0.85, C.indigo + 0.3); // cards
      line(cx - 0.16, 0.255, cx + 0.08, 0.255, count(0.012), 1, 0.85, C.ice);
      line(cx - 0.16, 0.315, cx + 0.02, 0.315, count(0.01), 0.9, 0.6, C.violet);
    }
    while (n < N) put(lerp(-0.7, 0.7, rnd()), lerp(-0.32, 0.45, rnd()), 0.55, 0.16, C.indigo);
  }
  const scrPerm = Array.from({ length: N }, (_, k) => k);
  for (let k = N - 1; k > 0; k--) {
    const j = Math.floor(rnd() * (k + 1));
    [scrPerm[k], scrPerm[j]] = [scrPerm[j], scrPerm[k]];
  }

  const screenScale = (T: number) => lerp(1, 0.13, seg(T, 11.2, 1.0, inOutCubic));

  const fScreen: Formation = (i, A, T, o) => {
    const k = scrPerm[i];
    const sc = screenScale(T);
    o.x = scrX[k] * sc + Math.sin(A * 0.9 + r1[i] * TAU) * 0.003;
    o.y = scrY[k] * sc + Math.cos(A * 0.8 + r2[i] * TAU) * 0.003;
    o.z = 0;
    o.s = scrS[k];
    o.a = scrA[k];
    o.c = scrC[k];
  };

  function drawScreen(T: number): void {
    const vis = env(T, 8.9, 18.4, 0.9, 0.6);
    if (vis <= 0) return;
    R.setStage(ST.left);
    const { ctx } = R;
    const fs = fsLeft;
    const sc = screenScale(T);
    ctx.beginPath();
    rrPath(0, 0, 1.5 * sc, 1.0 * sc, 0.07 * sc);
    R.glowStroke(C.indigo + 0.5, vis * lerp(0.34, 0.6, seg(T, 11.2, 1.0)), 1 * fs, 0.1);

    const detail = vis * (1 - seg(T, 10.9, 0.6)) * 0.3;
    if (detail <= 0.01) return;
    ctx.beginPath();
    R.segment(-0.75 * sc, -0.37 * sc, 0, 0.75 * sc, -0.37 * sc, 0);
    rrPath(0.36 * sc, -0.13 * sc, 0.6 * sc, 0.34 * sc, 0.035 * sc);
    for (const cx of [-0.48, 0, 0.48]) rrPath(cx * sc, 0.3 * sc, 0.42 * sc, 0.25 * sc, 0.03 * sc);
    R.glowStroke(C.violet, detail, 1 * fs, 0);
    // image glyph: mountains and a sun
    ctx.beginPath();
    const m = [0.12, 0.0, 0.27, -0.14, 0.37, -0.05, 0.46, -0.12, 0.6, 0.0];
    for (let k = 0; k < m.length; k += 2) {
      R.project(m[k] * sc, m[k + 1] * sc, 0);
      if (k) ctx.lineTo(R.px, R.py);
      else ctx.moveTo(R.px, R.py);
    }
    R.curve((t, out) => {
      out.x = (0.53 + Math.cos(t * TAU) * 0.028) * sc;
      out.y = (-0.22 + Math.sin(t * TAU) * 0.028) * sc;
      out.z = 0;
    }, 0, 1, 20);
    R.glowStroke(C.sky, detail * 1.6, 1 * fs, 0);
  }

  const HUB_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
  const HUB_COLOR = [C.amber, C.fuchsia, C.cyan, C.blue];
  const HUB_LABEL = ['LEADERSHIP', 'PRODUCT', 'PROJECT', 'DEVELOPERS'];
  const HUB_R = 0.68;
  const UNITY = C.indigo + 0.7;

  const tension = (T: number) => env(T, 12.6, DROP - 0.5, 0.9, 0.9);
  const unity = (T: number) => seg(T, DROP, 1.9, inOutCubic);

  const hub = { x: 0, y: 0 };
  function hubAt(k: number, A: number, T: number): void {
    const t = tension(T);
    const r = HUB_R + t * (0.05 + 0.035 * wobble(A * 0.9, k));
    const ang = HUB_ANGLE[k] + t * 0.07 * wobble(A * 0.7, k + 4);
    hub.x = Math.cos(ang) * r;
    hub.y = Math.sin(ang) * r;
  }

  // Competing threads between the groups; each later becomes a ring arc
  const NSTR = 10;
  const STR_A = [0, 1, 0, 2, 3, 1, 0, 3, 2, 1];
  const STR_B = [2, 3, 1, 3, 0, 2, 2, 1, 0, 0];
  const strC = new Float32Array(NSTR * 4);
  for (let j = 0; j < strC.length; j++) strC[j] = (rnd() * 2 - 1) * 0.9;

  const str = { x: 0, y: 0 };
  /** Point on thread j at u, morphing from tangle (m = 0) to ring arc (m = 1). */
  function strandAt(j: number, u: number, A: number, T: number, m: number): void {
    hubAt(STR_A[j], A, T);
    const ax = hub.x;
    const ay = hub.y;
    hubAt(STR_B[j], A, T);
    const bx = hub.x;
    const by = hub.y;
    const c1x = strC[j * 4] + wobble(A * 0.45, j) * 0.14;
    const c1y = strC[j * 4 + 1] + wobble(A * 0.5, j + 9) * 0.14;
    const c2x = strC[j * 4 + 2] + wobble(A * 0.4, j + 3) * 0.14;
    const c2y = strC[j * 4 + 3] + wobble(A * 0.55, j + 13) * 0.14;
    const k = j % 4;
    const rr0 = HUB_R * (1 + (Math.floor(j / 4) - 0.5) * 0.04 * (1 - m));
    const t0 = HUB_ANGLE[k];
    const t1 = t0 + Math.PI / 2;
    const kk = 0.5523 * rr0;
    const p0x = Math.cos(t0) * rr0;
    const p0y = Math.sin(t0) * rr0;
    const p3x = Math.cos(t1) * rr0;
    const p3y = Math.sin(t1) * rr0;
    const q1x = p0x - Math.sin(t0) * kk;
    const q1y = p0y + Math.cos(t0) * kk;
    const q2x = p3x + Math.sin(t1) * kk;
    const q2y = p3y - Math.cos(t1) * kk;
    str.x = bez(lerp(ax, p0x, m), lerp(c1x, q1x, m), lerp(c2x, q2x, m), lerp(bx, p3x, m), u);
    str.y = bez(lerp(ay, p0y, m), lerp(c1y, q1y, m), lerp(c2y, q2y, m), lerp(by, p3y, m), u);
  }

  const ringCurve: Curve = (t, out) => {
    out.x = Math.cos(t * TAU - Math.PI / 2) * HUB_R;
    out.y = Math.sin(t * TAU - Math.PI / 2) * HUB_R;
    out.z = 0;
  };

  const fHubs: Formation = (i, A, T, o) => {
    const m = unity(T);
    if (i === 0) {
      // the screen, now one node in a wider system
      o.x = 0;
      o.y = 0;
      o.z = 0;
      o.s = lerp(2.0, 3.6, m);
      o.a = lerp(0.6, 1, m);
      o.c = lerp(C.indigo, C.white, m);
      return;
    }
    if (i <= 4) {
      const k = i - 1;
      hubAt(k, A, T);
      o.x = hub.x;
      o.y = hub.y;
      o.z = 0;
      o.s = 2.7;
      o.a = 1;
      o.c = lerp(HUB_COLOR[k], UNITY, m);
      return;
    }
    if (r1[i] < 0.58) {
      // each group's team, orbiting it; misaligned orbits fall into line
      const k = i % 4;
      hubAt(k, A, T);
      const rho = 0.07 + r2[i] * 0.1;
      const ang = r3[i] * TAU + A * (0.4 + r4[i] * 0.5) * (k % 2 ? 1 : -1);
      const tilt = lerp(0.8 + k * 0.4, 1.15, m);
      const roll = lerp(k * 0.9 - 1.3, 0, m);
      const ex = Math.cos(ang) * rho;
      const ey = Math.sin(ang) * rho * Math.cos(tilt);
      o.x = hub.x + ex * Math.cos(roll) - ey * Math.sin(roll);
      o.y = hub.y + ex * Math.sin(roll) + ey * Math.cos(roll);
      o.z = Math.sin(ang) * rho * Math.sin(tilt);
      o.s = 0.7 + r4[i] * 0.7;
      o.a = 0.55 + r3[i] * 0.35;
      o.c = lerp(HUB_COLOR[k] + (r2[i] - 0.5) * 0.6, UNITY + (r2[i] - 0.5), m);
      return;
    }
    // priorities travelling the threads between groups
    const j = i % NSTR;
    const u = fract(r2[i] + A * (0.1 + r3[i] * 0.06));
    strandAt(j, u, A, T, m);
    const jit = (1 - m * 0.75) * 0.05;
    o.x = str.x + (r4[i] - 0.5) * jit;
    o.y = str.y + (r3[i] - 0.5) * jit;
    o.z = (r1[i] - 0.5) * 0.1 * (1 - m);
    o.s = 0.75 + r3[i] * 0.6;
    o.a = 0.6 + r4[i] * 0.3;
    o.c = lerp(HUB_COLOR[STR_A[j]], C.ice - r4[i] * 1.5, m);
  };

  function drawHubsUnder(T: number, A: number): void {
    const vis = env(T, 12.3, 18.5, 0.8, 0.7);
    if (vis <= 0) return;
    R.setStage(ST.left);
    const { ctx } = R;
    const fs = fsLeft;
    const m = unity(T);
    for (let j = 0; j < NSTR; j++) {
      ctx.beginPath();
      R.curve((u, out) => {
        strandAt(j, u, A, T, m);
        out.x = str.x;
        out.y = str.y;
        out.z = 0;
      }, 0, 1, 40);
      R.glowStroke(lerp(HUB_COLOR[STR_A[j]], UNITY, m), vis * lerp(0.3, 0.18, m), 1 * fs, 0.08);
    }
    for (let k = 0; k < 4; k++) {
      const p = seg(T, DROP + 0.4 + k * 0.12, 0.8, inOutCubic);
      if (p <= 0) continue;
      hubAt(k, A, T);
      ctx.beginPath();
      R.segment(0, 0, 0, hub.x * p, hub.y * p, 0);
      R.glowStroke(UNITY, vis * 0.3, 1 * fs, 0.1);
    }
    const ra = vis * smoothstep(0.3, 1, m);
    if (ra > 0) {
      ctx.beginPath();
      R.curve(ringCurve, 0, 1, 120);
      R.glowStroke(C.ice - 1, ra * 0.5, 1.4 * fs, 0.18);
    }
  }

  function drawHubsOver(T: number, A: number): void {
    const vis = env(T, 12.2, 18.5, 0.7, 0.6);
    if (vis <= 0) return;
    R.setStage(ST.left);
    const fs = fsLeft;
    const m = unity(T);
    for (let k = 0; k < 4; k++) {
      hubAt(k, A, T);
      R.project(hub.x, hub.y, 0);
      R.dot(R.px, R.py, 13 * fs, 0.22 * vis, lerp(HUB_COLOR[k], UNITY, m));
    }
    R.project(0, 0, 0);
    R.dot(R.px, R.py, 16 * fs, 0.25 * vis * (0.4 + 0.6 * m), C.ice);

    const pa = vis * smoothstep(0.55, 1, m);
    for (let k = 0; k < 5; k++) trail(ringCurve, fract(A * 0.09 + k / 5), 0.04, pa, C.white, fs, 2, true);

    // labels sit above the top group and below the others, clear of the copy
    const la = env(T, 12.6, 18.3, 0.6, 0.5);
    const off = 26 * fs;
    for (let k = 0; k < 4; k++) {
      hubAt(k, A, T);
      R.project(hub.x, hub.y, 0);
      R.chip(HUB_LABEL[k], R.px, R.py + (k === 0 ? -off : off), la, lerp(HUB_COLOR[k], UNITY, m));
    }
  }

  // ── 03 · Blueprint (copy centred, visual below) ────────────
  // A blueprint floor opens beneath the words: a tangled current
  // state on the left is untangled into lanes that feed a modular
  // future-state system on the right, which then tiles out across
  // the whole floor.

  const plane = { c: 1, s: 0, ku: 1, kv: 1, oy: 0 };
  let planeT = Number.NaN;
  let planeG = -1;
  function planeAt(T: number): void {
    if (T === planeT && planeG === geo) return;
    planeT = T;
    planeG = geo;
    const st = ST.bottom;
    const tilt = seg(T, 18.8, 1.7, inOutCubic);
    const zoom = seg(T, SCALE, 2.4, inOutCubic);
    const phi = lerp(0.5, 1.1, tilt) - 0.16 * zoom;
    plane.c = Math.cos(phi);
    plane.s = Math.sin(phi);
    plane.ku = lerp((st.hx - 0.1) / 1.65, (st.hx - 0.1) / 1.3, zoom);
    // fit the lane band inside the stage, allowing for perspective
    const edgeY = st.hy - 0.04;
    let kv = clamp(st.hy * 1.3, 0.4, 1.9);
    let oy = 0;
    for (let n = 0; n < 8; n++) {
      const band = 0.62 * kv;
      const kFar = R.D / (R.D + band * plane.s * st.s);
      const kNear = R.D / (R.D - band * plane.s * st.s);
      const lo = -edgeY / kFar + band * plane.c;
      const hi = edgeY / kNear - band * plane.c;
      oy = (lo + hi) / 2;
      if (lo <= hi) break;
      kv *= 0.85;
    }
    plane.kv = lerp(kv, kv * 1.9, zoom);
    plane.oy = lerp(oy, -st.hy * 0.7, zoom);
  }
  function onPlane(u: number, v: number, out: Vec3): void {
    const vv = v * plane.kv;
    out.x = u * plane.ku;
    out.y = plane.oy + vv * plane.c;
    out.z = -vv * plane.s;
  }

  const LANE_V = [-0.5, -0.25, 0, 0.25, 0.5];
  const LANE_ROW = [0, 0, 1, 2, 2];
  const LANE_OFF = [-0.04, 0.04, 0, -0.04, 0.04];
  const ROW_V = [-0.3, 0, 0.3];
  const ROW_LABEL = ['GOVERNANCE', 'FRAMEWORKS', 'BEST PRACTICE'];
  const BOT_S = [0.24, 0.52, 0.8];
  const BOT_V = [-0.18, 0.22, -0.05];
  const U0 = -1.55;
  const U_JAM = -0.15;
  const U1 = 1.55;

  const laneMorph = (k: number, T: number) => seg(T, 22.9 + k * 0.17, 1.6, inOutCubic);
  const lp = { u: 0, v: 0, jam: 0 };
  function laneAt(k: number, s: number, A: number, m: number): void {
    // current state: wandering, crossing, pinched at bottlenecks
    const tu = lerp(U0, U_JAM, s);
    let tv = LANE_V[k] * 0.85 + 0.15 * Math.sin(s * 6.3 + k * 1.9 + A * 0.25) + 0.08 * Math.sin(s * 13 + k * 3.7);
    let jam = 0;
    let jv = 0;
    for (let b = 0; b < 3; b++) {
      const d = (s - BOT_S[b]) / 0.075;
      const w = Math.exp(-d * d);
      if (w > jam) {
        jam = w;
        jv = BOT_V[b] + LANE_V[k] * 0.07;
      }
    }
    tv = lerp(tv, jv, jam);
    // future state: straight lanes merging into the system's rows
    const cu = lerp(U0, U1, s);
    const cv = lerp(LANE_V[k], ROW_V[LANE_ROW[k]] + LANE_OFF[k], smoothstep(0.5, 0.6, s));
    lp.u = lerp(tu, cu, m);
    lp.v = lerp(tv, cv, m);
    lp.jam = jam * (1 - m);
  }

  // Tile grid in plane units; the first system is columns 1–4, rows -1–1
  const PITCH = 0.3;
  const TILE_U = 0.22;
  const TILE_V = 0.2;
  const GC0 = -6;
  const GCOLS = 12;
  const GR0 = -6;
  const GROWS = 9;
  const GTILES = GCOLS * GROWS;
  const tileU = (c: number) => 0.15 + c * PITCH;
  const tileV = (r: number) => r * PITCH;
  const SYS_U = tileU(2.5);
  const tileDist = (c: number, r: number) =>
    Math.hypot((tileU(c) - SYS_U) / (SYS_U - tileU(GC0)), tileV(r) / -tileV(GR0)) / Math.SQRT2;
  const sysIn = (c: number, r: number, T: number) => seg(T, 24.9 + (c - 1) * 0.13 + (r + 1) * 0.2, 0.75, outCubic);
  const gridIn = (d: number, T: number) => seg(T, SCALE + 0.1 + d * 1.6, 0.9, outCubic);
  const gridWave = (d: number, A: number) => 0.5 + 0.5 * Math.sin(d * 7 - A * 2.2);

  const fBlueprint: Formation = (i, A, T, o) => {
    planeAt(T);
    const k = i % 5;
    const m = laneMorph(k, T);
    // flow along the lane; bottlenecks hold particles up until resolved
    const x = fract(r2[i] + A * 0.045 * (0.85 + r3[i] * 0.3));
    const amp = 0.3 * (1 - m);
    let s = x;
    for (let b = 0; b < 3; b++) s -= (amp / TAU) * Math.sin(TAU * (x - BOT_S[b]));
    s = fract(s);
    laneAt(k, s, A, m);
    let u = lp.u;
    let v = lp.v + (r4[i] - 0.5) * 0.04;
    let size = 0.8 + r3[i] * 0.55;
    let alpha = smoothstep(0, 0.06, s) * (1 - smoothstep(0.94, 1, s)) * 0.9;
    let col = lerp(lerp(C.violet, C.indigo + 0.5, r4[i]), C.sky + r4[i], m);
    col = lerp(col, C.amber + 0.5, lp.jam * 0.9);

    // some settle into the first modular system...
    if (r1[i] < 0.42) {
      const t = i % 12;
      const tc = 1 + (t % 4);
      const tr = Math.floor(t / 4) - 1;
      const q = Math.floor(i / 12) % 4;
      const p = seg(T, 25.0 + (tc - 1) * 0.13 + (tr + 1) * 0.2 + r3[i] * 0.35, 0.9, inOutCubic);
      if (p > 0) {
        u = lerp(u, tileU(tc) + ((q % 2) - 0.5) * 0.09, p);
        v = lerp(v, tileV(tr) + (Math.floor(q / 2) - 0.5) * 0.08, p);
        size = lerp(size, 1.1, p);
        alpha = lerp(alpha, 0.95, p);
        col = lerp(col, C.cyan, p);
      }
    }
    // ...then everything tiles out to platform scale
    const g = i % GTILES;
    const gc = GC0 + (g % GCOLS);
    const gr = GR0 + Math.floor(g / GCOLS);
    const d = tileDist(gc, gr);
    const pg = seg(T, SCALE + 0.1 + d * 1.6 + r4[i] * 0.25, 1.0, inOutCubic);
    if (pg > 0) {
      const q = Math.floor(i / GTILES) % 6;
      const wave = gridWave(d, A);
      u = lerp(u, tileU(gc) + ((q % 3) - 1) * 0.06 + (r3[i] - 0.5) * 0.014, pg);
      v = lerp(v, tileV(gr) + (Math.floor(q / 3) - 0.5) * 0.07, pg);
      size = lerp(size, 0.85 + wave * 0.5, pg);
      alpha = lerp(alpha, (0.35 + 0.6 * wave) * (1 - smoothstep(0.75, 1.05, d)), pg);
      col = lerp(col, lerp(C.indigo, C.cyan, wave), pg);
    }
    onPlane(u, v, v3);
    o.x = v3.x;
    o.y = v3.y;
    o.z = v3.z;
    o.s = size;
    o.a = alpha;
    o.c = col;
  };

  const tileOutline = (cu: number, cv: number, scale: number) =>
    R.curve((t, out) => {
      roundRectAt(cu, cv, TILE_U * scale, TILE_V * scale, 0.03 * scale, t, out);
      onPlane(out.x, out.y, out);
    }, 0, 1, 20);

  function drawBlueprint(T: number, A: number): void {
    const vis = env(T, 19.0, 30.1, 1.0, 0.8);
    if (vis <= 0) return;
    planeAt(T);
    R.setStage(ST.bottom);
    const { ctx } = R;
    const fs = fsBottom;

    // blueprint grid, vignetted around the floor's centre
    const reveal = seg(T, 19.1, 1.4, outCubic) * vis;
    onPlane(0, 0, v3);
    R.project(v3.x, v3.y, v3.z);
    const gx = R.px;
    const gy = R.py;
    const radius = Math.max(R.view.w, R.view.h) * 0.55;
    const grad = (a: number) => {
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      g.addColorStop(0, rgba(C.indigo + 0.5, a));
      g.addColorStop(0.55, rgba(C.indigo + 0.5, a * 0.55));
      g.addColorStop(1, rgba(C.indigo + 0.5, 0));
      return g;
    };
    for (const major of [false, true]) {
      ctx.beginPath();
      for (let n = -14; n <= 14; n++) {
        if ((n % 5 === 0) !== major) continue;
        const g = n * 0.2;
        onPlane(g, -2.6, v3);
        R.project(v3.x, v3.y, v3.z);
        ctx.moveTo(R.px, R.py);
        onPlane(g, 1.1, v3);
        R.project(v3.x, v3.y, v3.z);
        ctx.lineTo(R.px, R.py);
      }
      for (let n = -13; n <= 5; n++) {
        if ((n % 5 === 0) !== major) continue;
        const g = n * 0.2;
        onPlane(-2.8, g, v3);
        R.project(v3.x, v3.y, v3.z);
        ctx.moveTo(R.px, R.py);
        onPlane(2.8, g, v3);
        R.project(v3.x, v3.y, v3.z);
        ctx.lineTo(R.px, R.py);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad(reveal * (major ? 0.26 : 0.12));
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // timeline axis: today → tomorrow
    const ax = env(T, 19.7, 27.3, 0.8, 0.7) * vis;
    if (ax > 0) {
      const drawn = lerp(U0, U1, seg(T, 19.7, 1.2, inOutCubic));
      ctx.beginPath();
      onPlane(U0, 0.62, v3);
      R.project(v3.x, v3.y, v3.z);
      ctx.moveTo(R.px, R.py);
      onPlane(drawn, 0.62, v3);
      R.project(v3.x, v3.y, v3.z);
      ctx.lineTo(R.px, R.py);
      for (let n = 0; n <= 24; n++) {
        const u = U0 + n * 0.125;
        if (u > drawn) break;
        const h = n % 4 === 0 ? 0.05 : 0.025;
        onPlane(u, 0.62 - h, v3);
        R.project(v3.x, v3.y, v3.z);
        ctx.moveTo(R.px, R.py);
        onPlane(u, 0.62 + h, v3);
        R.project(v3.x, v3.y, v3.z);
        ctx.lineTo(R.px, R.py);
      }
      R.glowStroke(C.indigo + 0.6, ax * 0.45, 1 * fs, 0.06);
    }

    // lanes
    const la = vis * (1 - seg(T, SCALE - 0.2, 1.4)) * seg(T, 19.4, 1.0);
    if (la > 0) {
      for (let k = 0; k < 5; k++) {
        const m = laneMorph(k, T);
        ctx.beginPath();
        R.curve((s, out) => {
          laneAt(k, s, A, m);
          onPlane(lp.u, lp.v, out);
        }, 0, 1, 72);
        R.glowStroke(lerp(C.violet, C.sky, m), la * 0.26, 1 * fs, 0.1);
      }
    }

    // the first system: governance, frameworks, best practices
    for (let r = -1; r <= 1; r++) {
      for (let c = 1; c <= 4; c++) {
        const p = sysIn(c, r, T) * vis;
        if (p <= 0) continue;
        ctx.beginPath();
        tileOutline(tileU(c), tileV(r), lerp(0.4, 1, outBack(p)));
        ctx.globalAlpha = 1;
        ctx.fillStyle = rgba(C.cyan, 0.06 * p);
        ctx.fill();
        R.glowStroke(C.cyan, 0.5 * p, 1 * fs, 0.12);
      }
    }

    // platform scale: the system repeats across the floor
    if (T > SCALE) {
      for (let r = GR0; r < GR0 + GROWS; r++) {
        for (let c = GC0; c < GC0 + GCOLS; c++) {
          if (c >= 1 && c <= 4 && r >= -1 && r <= 1) continue;
          const d = tileDist(c, r);
          const p = gridIn(d, T) * vis * (1 - smoothstep(0.78, 1.05, d));
          if (p <= 0.01) continue;
          const wave = gridWave(d, A);
          ctx.beginPath();
          tileOutline(tileU(c), tileV(r), lerp(0.5, 1, p));
          R.glowStroke(lerp(C.indigo, C.cyan, wave), p * (0.18 + 0.32 * wave), 1 * fs, 0);
        }
      }
    }
  }

  function drawBlueprintOver(T: number, A: number): void {
    const vis = env(T, 19.0, 30.1, 1.0, 0.8);
    if (vis <= 0) return;
    planeAt(T);
    R.setStage(ST.bottom);
    const fs = fsBottom;

    // bottlenecks: amber until each is resolved
    const bv = env(T, 20.0, 24.2, 0.6, 0.8) * vis;
    if (bv > 0) {
      for (let b = 0; b < 3; b++) {
        const fixed = seg(T, 23.1 + b * 0.25, 0.8);
        onPlane(lerp(U0, U_JAM, BOT_S[b]), BOT_V[b], v3);
        R.project(v3.x, v3.y, v3.z);
        const c = lerp(C.amber, C.cyan, fixed);
        const ph = fract(A * 0.9 + b * 0.33);
        R.dot(R.px, R.py, 3.2 * fs, bv * (1 - fixed * 0.5), c);
        R.ring(R.px, R.py, (5 + ph * 16) * fs, bv * (1 - ph) * 0.6, c);
      }
    }

    const ca = env(T, 19.9, 27.3, 0.7, 0.6) * vis;
    if (ca > 0) {
      onPlane(-1.15, -0.74, v3);
      R.project(v3.x, v3.y, v3.z);
      R.chip('TODAY', R.px, R.py, ca, C.amber);
      onPlane(1.15, -0.74, v3);
      R.project(v3.x, v3.y, v3.z);
      R.chip('TOMORROW', R.px, R.py, ca * seg(T, 20.6, 0.6), C.cyan);
    }

    const rl = env(T, 26.3, SCALE + 0.4, 0.6, 0.6) * vis;
    if (rl > 0) {
      for (let r = 0; r < 3; r++) {
        onPlane(tileU(1) - TILE_U / 2 - 0.05, ROW_V[r], v3);
        R.project(v3.x, v3.y, v3.z);
        R.chip(ROW_LABEL[r], R.px, R.py, rl * seg(T, 26.3 + r * 0.15, 0.5), C.cyan, 'right');
      }
    }
  }

  // ── 04 · People (copy right, visual left) ──────────────────
  // Systems give way to people: a lead mentors six designers, who
  // grow in capability and go on to build systems of their own.

  const LEAD_X = -0.04;
  const LEAD_Y = 0.04;
  const DES_X = [-0.56, 0.1, 0.66, 0.6, 0.0, -0.62];
  const DES_Y = [-0.4, -0.64, -0.28, 0.4, 0.66, 0.34];
  const mentorAt = (k: number) => 33.9 + k * 0.3;
  const growth = (k: number, T: number) => seg(T, mentorAt(k) + 0.7, 1.1, outBack);
  const build = (k: number, T: number) => seg(T, 35.8 + k * 0.15, 1.1, inOutCubic);
  const clarity = (T: number) => seg(T, CLARITY, 0.7, inOutCubic);
  const lift = (T: number) => seg(T, CONFIDENCE, 1.0, inOutCubic);

  const dp = { x: 0, y: 0 };
  function designerAt(k: number, A: number, T: number): void {
    const l = lift(T);
    const n = 0.4 + (1 - clarity(T));
    dp.x = DES_X[k] * (1 + 0.05 * l) + wobble(A * 0.5, k) * 0.015 * n;
    dp.y = DES_Y[k] * (1 + 0.05 * l) - 0.05 * l + wobble(A * 0.45, k + 7) * 0.015 * n;
  }
  const leadY = (T: number) => LEAD_Y - 0.03 * lift(T);

  // each designer's own system fans outward, away from the lead
  const ch = { x: 0, y: 0 };
  function childAt(k: number, j: number): void {
    const base = Math.atan2(DES_Y[k] - LEAD_Y, DES_X[k] - LEAD_X);
    const ang = base + (j - 1.5) * 0.52;
    const r = 0.19 + (j % 2) * 0.05;
    ch.x = dp.x + Math.cos(ang) * r;
    ch.y = dp.y + Math.sin(ang) * r;
  }

  const fTeam: Formation = (i, A, T, o) => {
    const l = lift(T);
    if (i === 0) {
      o.x = LEAD_X;
      o.y = leadY(T);
      o.z = 0;
      o.s = 3.4;
      o.a = 1;
      o.c = C.ice;
      return;
    }
    if (i <= 6) {
      const k = i - 1;
      const g = growth(k, T);
      designerAt(k, A, T);
      o.x = dp.x;
      o.y = dp.y;
      o.z = 0;
      o.s = lerp(1.8, 2.9, g) * (1 + 0.15 * l);
      o.a = lerp(0.65, 1, Math.min(1, g));
      o.c = lerp(C.violet, C.ice, Math.min(1, g));
      return;
    }
    const k = i % 6;
    const gr = growth(k, T);
    const g = Math.min(1, gr);
    designerAt(k, A, T);
    const ang = r3[i] * TAU + A * (0.55 + r4[i] * 0.6) * (k % 2 ? 1 : -1);
    const rho = (0.045 + r2[i] * 0.05) * (1 + 0.85 * gr);
    let x = dp.x + Math.cos(ang) * rho;
    let y = dp.y + Math.sin(ang) * rho * 0.78;
    let z = Math.sin(ang) * rho * 0.62;
    let s = 0.65 + r4[i] * 0.6;
    let a = 0.35 + 0.45 * g;
    let c = lerp(C.violet, C.sky + r2[i], g);
    if (r1[i] >= 0.6) {
      // builders leave the orbit to form the designer's own system
      const b = clamp((build(k, T) - r3[i] * 0.3) / 0.7);
      if (b > 0) {
        childAt(k, Math.floor(r2[i] * 4));
        const e = inOutCubic(b);
        x = lerp(x, ch.x + (r3[i] - 0.5) * 0.045, e);
        y = lerp(y, ch.y + (r4[i] - 0.5) * 0.045, e);
        z = lerp(z, 0, e);
        s = lerp(s, 0.95, e);
        a = lerp(a, 0.85, e);
        c = lerp(c, C.cyan, e);
      }
    }
    const noise = (1 - clarity(T)) * 0.012;
    o.x = x + wobble(A * 0.8, i) * noise;
    o.y = y + wobble(A * 0.7, i + 3) * noise;
    o.z = z;
    o.s = s;
    o.a = a * (1 + 0.25 * l);
    o.c = c;
  };

  const teamX = new Float32Array(6);
  const teamY = new Float32Array(6);
  function drawTeamUnder(T: number, A: number): void {
    const vis = env(T, 31.0, 40.0, 0.8, 0.45);
    if (vis <= 0) return;
    R.setStage(ST.left);
    const { ctx } = R;
    const fs = fsLeft;
    const ly = leadY(T);
    for (let k = 0; k < 6; k++) {
      designerAt(k, A, T);
      teamX[k] = dp.x;
      teamY[k] = dp.y;
    }
    // the team reads as a network from the moment it forms
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      R.project(teamX[k], teamY[k], 0);
      if (k) ctx.lineTo(R.px, R.py);
      else ctx.moveTo(R.px, R.py);
    }
    ctx.closePath();
    for (let k = 0; k < 6; k++) R.segment(LEAD_X, ly, 0, teamX[k], teamY[k], 0);
    R.glowStroke(C.violet, vis * 0.12, 1 * fs, 0);

    for (let k = 0; k < 6; k++) {
      dp.x = teamX[k];
      dp.y = teamY[k];
      const dx = dp.x;
      const dy = dp.y;

      const p = seg(T, mentorAt(k), 0.55, inOutCubic);
      if (p > 0) {
        ctx.beginPath();
        R.segment(LEAD_X, ly, 0, lerp(LEAD_X, dx, p), lerp(ly, dy, p), 0);
        R.glowStroke(C.indigo + 0.6, vis * lerp(0.42, 0.16, seg(T, 36.6, 1.0)), 1 * fs, 0.12);
      }

      const g = growth(k, T);
      if (g > 0) {
        R.project(dx, dy, 0);
        R.ring(R.px, R.py, 0.085 * (1 + 0.85 * g) * R.unit * R.pk, vis * 0.24 * Math.min(1, g), C.sky);
      }

      const b = build(k, T);
      if (b > 0) {
        ctx.beginPath();
        for (let j = 0; j < 4; j++) {
          childAt(k, j);
          R.segment(dx, dy, 0, lerp(dx, ch.x, b), lerp(dy, ch.y, b), 0);
        }
        const sib = clamp((b - 0.55) / 0.45);
        if (sib > 0) {
          for (let j = 0; j < 3; j++) {
            childAt(k, j);
            const x1 = ch.x;
            const y1 = ch.y;
            childAt(k, j + 1);
            R.segment(x1, y1, 0, lerp(x1, ch.x, sib), lerp(y1, ch.y, sib), 0);
          }
        }
        R.glowStroke(C.cyan, vis * 0.32 * b, 0.9 * fs, 0.1);
      }
    }
    // clarity: one clean ripple through the whole team
    const cr = clamp((T - CLARITY) / 1.5);
    if (cr > 0 && cr < 1) {
      R.project(LEAD_X, ly, 0);
      R.ring(R.px, R.py, outCubic(cr) * 1.35 * R.unit, vis * (1 - cr) * 0.45, C.ice, 1.2 * fs);
    }
  }

  /** Uses the designer positions cached by drawTeamUnder this frame. */
  function drawTeamOver(T: number): void {
    const vis = env(T, 31.0, 40.0, 0.8, 0.45);
    if (vis <= 0) return;
    R.setStage(ST.left);
    const fs = fsLeft;
    const ly = leadY(T);
    const flare = env(T, CONFIDENCE, CONFIDENCE + 0.4, 0.3, 0.6);
    for (let k = 0; k < 6; k++) {
      dp.x = teamX[k];
      dp.y = teamY[k];
      // mentoring packet, lead → designer
      const t0 = mentorAt(k) + 0.15;
      const p = clamp((T - t0) / 0.6);
      if (p > 0 && p < 1) {
        const e = inOutCubic(p);
        R.project(lerp(LEAD_X, dp.x, e), lerp(ly, dp.y, e), 0);
        R.dot(R.px, R.py, 2.6 * fs, vis, C.white);
      }
      R.project(dp.x, dp.y, 0);
      const x = R.px;
      const y = R.py;
      const f = clamp((T - (t0 + 0.6)) / 0.8);
      if (f > 0 && f < 1) R.ring(x, y, (4 + f * 26) * fs, vis * (1 - f) * 0.6, C.ice);
      // capability: rings pulse outward
      const cap = clamp((T - (CAPABILITY + k * 0.06)) / 1.0);
      if (cap > 0 && cap < 1) R.ring(x, y, (10 + cap * 40) * fs, vis * (1 - cap) * 0.5, C.sky);
      R.dot(x, y, (12 + 10 * flare) * fs, vis * (0.12 + 0.25 * Math.min(1, growth(k, T)) + 0.3 * flare), C.sky);
    }
    R.project(LEAD_X, ly, 0);
    R.dot(R.px, R.py, 16 * fs, vis * 0.28, C.ice);
  }

  // ── 05 · Hello (copy left, visual right) ───────────────────
  // Everything flows into one continuous, endlessly moving loop:
  // complex, yet a single connected line.

  const KNOT = 0.31;
  let knotA = Number.NaN;
  let kcs = 1;
  let kss = 0;
  let kcy = 1;
  let ksy = 0;
  let kcp = 1;
  let ksp = 0;
  function knotFrame(A: number): void {
    if (A === knotA) return;
    knotA = A;
    const spin = A * 0.07;
    const yaw = Math.sin(A * 0.11) * 0.55;
    const pitch = 0.3 + Math.sin(A * 0.083) * 0.2;
    kcs = Math.cos(spin);
    kss = Math.sin(spin);
    kcy = Math.cos(yaw);
    ksy = Math.sin(yaw);
    kcp = Math.cos(pitch);
    ksp = Math.sin(pitch);
  }
  /** Trefoil knot at t, offset across a twisting ribbon (lat ∈ [-1, 1]). */
  function knotAt(t: number, lat: number, twist: number, out: Vec3): void {
    const st = Math.sin(t);
    const ct = Math.cos(t);
    const s2 = Math.sin(2 * t);
    const c2 = Math.cos(2 * t);
    let x = st + 2 * s2;
    let y = ct - 2 * c2 + 0.47;
    let z = -Math.sin(3 * t);
    if (lat !== 0) {
      const tx = ct + 4 * c2;
      const ty = -st + 4 * s2;
      const tz = -3 * Math.cos(3 * t);
      // normal = T × Z, binormal = T × normal
      const nl = Math.hypot(ty, tx) || 1;
      const nx = ty / nl;
      const ny = -tx / nl;
      let bx = -tz * ny;
      let by = tz * nx;
      let bz = tx * ny - ty * nx;
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl;
      by /= bl;
      bz /= bl;
      const cw = Math.cos(twist) * lat * 0.24;
      const sw = Math.sin(twist) * lat * 0.24;
      x += nx * cw + bx * sw;
      y += ny * cw + by * sw;
      z += bz * sw;
    }
    const sx = (x * kcs + y * kss) * KNOT;
    y = (-x * kss + y * kcs) * -KNOT;
    x = sx;
    z *= KNOT;
    const x1 = x * kcy + z * ksy;
    const z1 = -x * ksy + z * kcy;
    out.x = x1;
    out.y = y * kcp - z1 * ksp;
    out.z = y * ksp + z1 * kcp;
  }
  const knotCurve: Curve = (t, out) => knotAt(t * TAU, 0, 0, out);

  const fKnot: Formation = (i, A, _T, o) => {
    knotFrame(A);
    const t = (r1[i] + A * 0.022 * (0.9 + r2[i] * 0.2)) * TAU;
    const lat = (Math.floor(r3[i] * 4) / 3) * 2 - 1 + (r4[i] - 0.5) * 0.1;
    knotAt(t, lat, t * 1.5 + A * 0.35, v3);
    o.x = v3.x;
    o.y = v3.y;
    o.z = v3.z;
    const band = 0.5 + 0.5 * Math.sin(t * 2 - A * 0.6);
    o.s = 0.8 + r4[i] * 0.7 + band * 0.45;
    o.a = 0.5 + 0.45 * band;
    o.c = lerp(C.violet, C.cyan, band) + (r4[i] - 0.5) * 0.8;
  };

  const KN = 240;
  const kx = new Float32Array(KN + 1);
  const ky = new Float32Array(KN + 1);
  const kk = new Float32Array(KN + 1);
  function drawKnot(T: number, A: number): void {
    const vis = seg(T, 40.9, 1.6, inOutCubic);
    if (vis <= 0) return;
    knotFrame(A);
    R.setStage(ST.right);
    const { ctx } = R;
    const fs = fsRight;
    for (let n = 0; n <= KN; n++) {
      knotCurve(n / KN, v3);
      R.project(v3.x, v3.y, v3.z);
      kx[n] = R.px;
      ky[n] = R.py;
      kk[n] = R.pk;
    }
    // depth-shaded centre line, batched into four depth bands
    for (let band = 0; band < 4; band++) {
      ctx.beginPath();
      for (let n = 0; n < KN; n++) {
        const depth = smoothstep(0.9, 1.1, (kk[n] + kk[n + 1]) / 2);
        if (Math.min(3, Math.floor(depth * 4)) !== band) continue;
        ctx.moveTo(kx[n], ky[n]);
        ctx.lineTo(kx[n + 1], ky[n + 1]);
      }
      R.glowStroke(C.indigo + band * 0.8, vis * (0.1 + band * 0.1), 1 * fs, 0.1);
    }
  }

  function drawKnotOver(T: number, A: number): void {
    const vis = seg(T, 41.6, 1.4, inOutCubic);
    if (vis <= 0) return;
    knotFrame(A);
    R.setStage(ST.right);
    for (let k = 0; k < 6; k++) trail(knotCurve, fract(A * 0.045 + k / 6), 0.018, vis * 0.9, C.white, fsRight, 2, true);
  }

  // ── Composition ────────────────────────────────────────────
  const SCHEDULE: Step[] = [
    { f: fVoid, stage: 'world', t: 0, dur: 0, stagger: 0 },
    { f: fStream, stage: 'right', t: 3.9, dur: 1.7, stagger: 1.3 },
    { f: fScreen, stage: 'left', t: 8.7, dur: 1.4, stagger: 0.6 },
    { f: fHubs, stage: 'left', t: 11.9, dur: 1.2, stagger: 0.5 },
    { f: fBlueprint, stage: 'bottom', t: 18.8, dur: 1.6, stagger: 0.8 },
    { f: fTeam, stage: 'left', t: 30.4, dur: 1.5, stagger: 0.7 },
    { f: fKnot, stage: 'right', t: 40.4, dur: 1.8, stagger: 0.9 },
  ];

  /**
   * Runs a formation and projects it through its stage, so x / y come back
   * in CSS px with depth already applied to size and alpha.
   */
  function place(step: Step, i: number, A: number, T: number, out: Out): void {
    step.f(i, A, T, out);
    const st = ST[step.stage];
    R.setStage(st);
    R.project(out.x, out.y, out.z);
    const k = R.pk;
    out.x = R.px;
    out.y = R.py;
    out.z = k;
    out.s *= (step.stage === 'world' ? R.fs : stageFs(st)) * k;
    out.a *= clamp(0.35 + (k - 0.85) * 2.2, 0.3, 1.15);
  }

  const pa = blank();
  const pb = blank();
  function particle(i: number, T: number, A: number, out: Out): void {
    let j = SCHEDULE.length - 1;
    while (j > 0 && SCHEDULE[j].t > T) j--;
    const cur = SCHEDULE[j];
    const local = T - cur.t;
    if (j === 0 || local >= cur.dur + cur.stagger) {
      place(cur, i, A, T, out);
      return;
    }
    place(SCHEDULE[j - 1], i, A, T, pa);
    // stragglers on the left join the stream first, nearest its source
    const ord = j === 1 ? clamp(pa.x / R.view.w) : r4[i];
    const p = inOutCubic(clamp((local - ord * cur.stagger) / cur.dur));
    if (p <= 0) {
      Object.assign(out, pa);
      return;
    }
    place(cur, i, A, T, pb);
    // swing through a slight arc so morphs feel like a flock, not a tween
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.sin(Math.PI * p);
    const sw = bow * (r3[i] - 0.5) * 0.5 * Math.min(R.view.S, len);
    out.x = lerp(pa.x, pb.x, p) - (dy / len) * sw;
    out.y = lerp(pa.y, pb.y, p) + (dx / len) * sw;
    out.z = lerp(pa.z, pb.z, p);
    out.s = lerp(pa.s, pb.s, p) * (1 + bow * (r2[i] - 0.5) * 0.5);
    out.a = lerp(pa.a, pb.a, p);
    out.c = lerp(pa.c, pb.c, p);
  }

  const o = blank();
  function render(T: number, A: number): void {
    sync();
    R.begin();
    const { ctx } = R;
    ctx.globalCompositeOperation = 'lighter';

    drawDirection(T, A);
    drawScreen(T);
    drawHubsUnder(T, A);
    drawBlueprint(T, A);
    drawTeamUnder(T, A);
    drawKnot(T, A);

    // which copy is on screen: blend the legibility mask across chapter changes
    let c = 0;
    for (let k = 1; k < CHAPTERS.length; k++) if (T >= CHAPTERS[k].start - 0.6) c = k;
    const w = c ? seg(T, CHAPTERS[c].start - 0.6, 1.2, inOutCubic) : 1;

    const intro = T < 2.4;
    for (let i = 0; i < N; i++) {
      particle(i, T, A, o);
      if (o.a <= 0.004) continue;
      let alpha = o.a;
      if (intro) alpha *= seg(T, r1[i] * 1.1, 1.1, outCubic);
      alpha *= w >= 1 ? legible(c, o.x, o.y) : lerp(legible(c - 1, o.x, o.y), legible(c, o.x, o.y), w);
      R.dot(o.x, o.y, o.s, alpha, o.c);
    }

    drawHubsOver(T, A);
    drawBlueprintOver(T, A);
    drawTeamOver(T);
    drawKnotOver(T, A);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  return { render };
}
