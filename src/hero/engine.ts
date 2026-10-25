// ============================================================
// HERO STORY — CANVAS RENDERER
// Sizing, camera projection, glow sprites and drawing helpers.
// World units: 1 unit ≈ half the hero's shorter side, origin at
// the hero's centre. Each chapter composes inside its own stage
// (a region of the hero) with local units, mapped through setStage.
// ============================================================

import { RAMP, rampIndex, rgba } from './palette';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Where the copy sits, measured from the DOM in CSS px relative to the hero. */
export interface Layout {
  copy: Rect; // the copy cell, full container width
  col: number; // width of a side column of story copy
  centerBottom: number; // bottom edge of centred story copy
  finalRight: number; // right edge of the final copy
  top: Rect; // narrow layouts: the stage area above the copy
  stacked: boolean; // narrow layout: stage above, copy below
}

export interface View {
  w: number; // canvas size in CSS px
  h: number;
  cx: number; // world origin in CSS px
  cy: number;
  S: number; // CSS px per world unit
  left: number; // canvas edges in world units
  right: number;
  top: number;
  bottom: number;
  layout: Layout;
}

/** A stage maps local units (±1 ≈ its shorter half-side) into world units. */
export interface Stage {
  cx: number; // centre, world units
  cy: number;
  s: number; // world units per local unit
  hx: number; // half extents, local units
  hy: number;
}

export const IDENTITY: Stage = { cx: 0, cy: 0, s: 1, hx: 1, hy: 1 };

type SpacedContext = CanvasRenderingContext2D & { letterSpacing: string };

const SPRITE = 64;
const MAX_PIXELS = 4_200_000;

function makeSprite(r: number, g: number, b: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SPRITE;
  const x = c.getContext('2d')!;
  const h = SPRITE / 2;
  const grad = x.createRadialGradient(h, h, 0, h, h, h);
  const hot = (v: number) => Math.round(v + (255 - v) * 0.72);
  grad.addColorStop(0, `rgba(${hot(r)},${hot(g)},${hot(b)},1)`);
  grad.addColorStop(0.13, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.28, `rgba(${r},${g},${b},0.4)`);
  grad.addColorStop(0.58, `rgba(${r},${g},${b},0.09)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, SPRITE, SPRITE);
  return c;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites: HTMLCanvasElement[];
  readonly D = 4; // perspective distance in world units

  view: View = {
    w: 1, h: 1, cx: 0, cy: 0, S: 1,
    left: -1, right: 1, top: -1, bottom: 1,
    layout: {
      copy: { x: 0, y: 0, w: 1, h: 1 },
      col: 1,
      centerBottom: 0,
      finalRight: 0,
      top: { x: 0, y: 0, w: 1, h: 1 },
      stacked: false,
    },
  };
  dpr = 1;
  /** Bumped on every resize so scenes know to rebuild their geometry. */
  version = 0;
  /** Detail scale for labels, strokes and particle sizes. */
  fs = 1;

  // Camera parallax, radians
  yaw = 0;
  pitch = 0;

  // Last projection result
  px = 0;
  py = 0;
  pk = 1;

  private st: Stage = IDENTITY;
  private cy = 1;
  private sy = 0;
  private cp = 1;
  private sp = 0;
  private readonly tmp: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly widths = new Map<string, number>();
  private readonly spacing: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.sprites = RAMP.map(([r, g, b]) => makeSprite(r, g, b));
    this.spacing = 'letterSpacing' in ctx;
  }

  resize(w: number, h: number, layout: Layout): void {
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > MAX_PIXELS) dpr = Math.max(1, Math.sqrt(MAX_PIXELS / (w * h)));
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);

    const S = (Math.min(w, h) / 2) * 0.94;
    const cx = w / 2;
    const cy = h / 2;
    this.view = {
      w, h, cx, cy, S,
      left: -cx / S,
      right: (w - cx) / S,
      top: -cy / S,
      bottom: (h - cy) / S,
      layout,
    };
    this.version++;
    this.widths.clear();
  }

  /** A stage filling a CSS-px rectangle of the hero. */
  stageFor(r: Rect): Stage {
    const v = this.view;
    const unit = (Math.min(r.w, r.h) / 2) * 0.94;
    return {
      cx: (r.x + r.w / 2 - v.cx) / v.S,
      cy: (r.y + r.h / 2 - v.cy) / v.S,
      s: unit / v.S,
      hx: r.w / 2 / unit,
      hy: r.h / 2 / unit,
    };
  }

  /** Local coordinates passed to project() are read in this stage. */
  setStage(st: Stage): void {
    this.st = st;
  }

  /** CSS px per local unit of the current stage. */
  get unit(): number {
    return this.st.s * this.view.S;
  }

  /** Clears the frame and caches the camera rotation. */
  begin(): void {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.cy = Math.cos(this.yaw);
    this.sy = Math.sin(this.yaw);
    this.cp = Math.cos(this.pitch);
    this.sp = Math.sin(this.pitch);
    this.st = IDENTITY;
  }

  /**
   * Projects a stage-local point into px / py (CSS px) and pk (perspective
   * scale). Parallax and perspective pivot on the stage's own centre, so
   * every stage has its own vanishing point wherever it sits on screen.
   */
  project(x: number, y: number, z: number): void {
    const st = this.st;
    const x1 = x * this.cy + z * this.sy;
    const z1 = -x * this.sy + z * this.cy;
    const y2 = y * this.cp - z1 * this.sp;
    const z2 = y * this.sp + z1 * this.cp;
    const k = this.D / Math.max(0.6, this.D + z2 * st.s);
    const v = this.view;
    this.px = v.cx + (st.cx + x1 * st.s * k) * v.S;
    this.py = v.cy + (st.cy + y2 * st.s * k) * v.S;
    this.pk = k;
  }

  /** Glowing dot at screen coords; r is the visual radius in CSS px. */
  dot(x: number, y: number, r: number, a: number, c: number): void {
    if (a <= 0.004 || r <= 0.05) return;
    const d = r * 7;
    this.ctx.globalAlpha = a > 1 ? 1 : a;
    this.ctx.drawImage(this.sprites[rampIndex(c)], x - d / 2, y - d / 2, d, d);
  }

  ring(x: number, y: number, r: number, a: number, c: number, width = 1): void {
    if (a <= 0.004 || r <= 0) return;
    const { ctx } = this;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** Strokes the current path as a crisp line over a soft glow. */
  glowStroke(c: number, a: number, width = 1, glow = 0.12): void {
    if (a <= 0.004) return;
    const { ctx } = this;
    ctx.globalAlpha = 1;
    if (glow > 0) {
      ctx.strokeStyle = rgba(c, a * glow);
      ctx.lineWidth = width * 6;
      ctx.stroke();
    }
    ctx.strokeStyle = rgba(c, a);
    ctx.lineWidth = width;
    ctx.stroke();
  }

  /** Appends a stage-local curve, sampled over [t0, t1], to the current path. */
  curve(fn: (t: number, out: Vec3) => void, t0: number, t1: number, n: number, join = false): void {
    const { ctx, tmp } = this;
    for (let k = 0; k <= n; k++) {
      fn(t0 + (t1 - t0) * (k / n), tmp);
      this.project(tmp.x, tmp.y, tmp.z);
      if (k === 0 && !join) ctx.moveTo(this.px, this.py);
      else ctx.lineTo(this.px, this.py);
    }
  }

  /** Appends a straight stage-local segment to the current path. */
  segment(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
    this.project(x1, y1, z1);
    this.ctx.moveTo(this.px, this.py);
    this.project(x2, y2, z2);
    this.ctx.lineTo(this.px, this.py);
  }

  private font(size: number, weight: number): void {
    this.ctx.font = `${weight} ${size.toFixed(2)}px Outfit, system-ui, sans-serif`;
    if (this.spacing) (this.ctx as SpacedContext).letterSpacing = `${(size * 0.16).toFixed(2)}px`;
  }

  private measure(text: string, size: number): number {
    const key = `${size}|${text}`;
    let w = this.widths.get(key);
    if (w === undefined) {
      w = this.ctx.measureText(text).width;
      this.widths.set(key, w);
    }
    return w;
  }

  /** UI-style label chip. `dot` is a palette colour for the status dot, or -1. */
  chip(text: string, x: number, y: number, a: number, dot = -1, align: CanvasTextAlign = 'center'): void {
    if (a <= 0.01) return;
    const { ctx } = this;
    const fs = this.fs;
    const size = 10 * fs;
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    this.font(size, 500);
    const tw = this.measure(text, size);
    const padX = 10 * fs;
    const h = 22 * fs;
    const dotW = dot >= 0 ? 11 * fs : 0;
    const w = tw + padX * 2 + dotW;
    const x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
    ctx.beginPath();
    const r = h / 2;
    ctx.moveTo(x0 + r, y - r);
    ctx.lineTo(x0 + w - r, y - r);
    ctx.arc(x0 + w - r, y, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x0 + r, y + r);
    ctx.arc(x0 + r, y, r, Math.PI / 2, (Math.PI * 3) / 2);
    ctx.closePath();
    ctx.fillStyle = `rgba(7,10,26,${(0.82 * a).toFixed(3)})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(165,180,252,${(0.26 * a).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (dot >= 0) {
      ctx.globalCompositeOperation = 'lighter';
      this.dot(x0 + padX + 2.5 * fs, y, 2.2 * fs, a, dot);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = `rgba(226,232,255,${(0.94 * a).toFixed(3)})`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x0 + padX + dotW, y + 0.5 * fs);
    ctx.globalCompositeOperation = prevOp;
  }
}
