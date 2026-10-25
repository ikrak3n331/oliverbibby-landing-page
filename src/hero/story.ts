// ============================================================
// HERO STORY — CONTROLLER
// Clock, captions, the final frame, player controls, visibility
// and reduced-motion handling for the animated hero.
// ============================================================

import { Renderer } from './engine';
import type { Rect } from './engine';
import { CAPTIONS, CHAPTERS, END, FINAL, createStory } from './scenes';
import { Score } from './sound';
import type { Caption } from './scenes';
import { clamp, inCubic, outCubic } from './util';

const SEEN_KEY = 'ob:hero-story-seen';

/** Final-frame reveal offsets from FINAL, indexed by each element's data-step. */
const STEP_AT = [0.25, 0.55, 1.0, 1.65, 2.05];

interface CaptionView {
  cap: Caption;
  el: HTMLElement;
  words: HTMLElement[];
  settled: boolean;
}

/** Splits caption copy into word spans; *asterisks* toggle the accent style. */
function buildCaption(cap: Caption, host: HTMLElement): CaptionView {
  const el = document.createElement('p');
  el.className = 'story__caption';
  el.hidden = true;
  const words: HTMLElement[] = [];
  let em = false;
  cap.text.split(/\s+/).filter(Boolean).forEach((token, n) => {
    if (n) el.append(' ');
    const word = document.createElement('span');
    word.className = 'story__word';
    let buf = '';
    const flush = () => {
      if (!buf) return;
      if (em) {
        const accent = document.createElement('em');
        accent.textContent = buf;
        word.append(accent);
      } else {
        word.append(buf);
      }
      buf = '';
    };
    for (const ch of token) {
      if (ch === '*') {
        flush();
        em = !em;
      } else {
        buf += ch;
      }
    }
    flush();
    el.append(word);
    words.push(word);
  });
  host.append(el);
  return { cap, el, words, settled: false };
}

/** Blur-and-rise reveal; `out` runs the exit. */
function reveal(el: HTMLElement, p: number, out: number, rise: number, unit: string): void {
  const blur = (1 - p) * 12 + out * 8;
  el.style.opacity = (p * (1 - out)).toFixed(3);
  el.style.transform = `translate3d(0,${((1 - p) * rise - out * rise * 0.6).toFixed(3)}${unit},0)`;
  el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : '';
}

function clearReveal(el: HTMLElement): void {
  el.style.opacity = '';
  el.style.transform = '';
  el.style.filter = '';
}

export function initHeroStory(hero: HTMLElement): void {
  const q = <T extends HTMLElement>(sel: string) => hero.querySelector<T>(sel);
  const canvas = q<HTMLCanvasElement>('.hero__canvas');
  const copy = q('.hero__copy');
  const storyEl = q('.story');
  const captionHost = q('.story__captions');
  const finalEl = q('.hero__final');
  const toggle = q<HTMLButtonElement>('.story-controls__toggle');
  const skip = q<HTMLButtonElement>('.story-controls__skip');
  const soundBtn = q<HTMLButtonElement>('.story-controls__sound');
  const chapterList = q('.story-controls__chapters');
  if (
    !canvas || !copy || !storyEl ||
    !captionHost || !finalEl || !toggle || !skip || !soundBtn || !chapterList
  ) return;

  let renderer: Renderer;
  try {
    renderer = new Renderer(canvas);
  } catch {
    return; // no 2D canvas: the static final frame stays as the hero
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stacked = matchMedia('(max-width: 900px)');
  const params = new URLSearchParams(location.search);
  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    /* storage blocked */
  }
  const markSeen = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* storage blocked */
    }
  };

  // ── Layout ─────────────────────────────────────────────────
  const spacer = q('.hero__spacer');
  const measure = () => {
    const h = hero.getBoundingClientRect();
    const rel = (r: DOMRect): Rect => ({ x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height });
    // where the copy would sit in each arrangement, so every stage is known up front
    const align = storyEl.dataset.align ?? 'left';
    storyEl.dataset.align = 'left';
    const side = storyEl.getBoundingClientRect();
    storyEl.dataset.align = 'center';
    const centred = storyEl.getBoundingClientRect();
    storyEl.dataset.align = align;
    renderer.resize(h.width, h.height, {
      copy: rel(copy.getBoundingClientRect()),
      col: side.width,
      centerBottom: centred.bottom - h.top,
      finalRight: finalEl.getBoundingClientRect().right - h.left,
      top: rel((spacer ?? copy).getBoundingClientRect()),
      stacked: stacked.matches,
    });
  };

  hero.classList.add('is-story');
  measure();
  const hr = hero.getBoundingClientRect();
  const story = createStory(renderer, Math.round(clamp((hr.width * hr.height) / 1500, 420, 900)));

  // ── DOM pieces ─────────────────────────────────────────────
  const captions = CAPTIONS.map((c) => buildCaption(c, captionHost));
  const steps = Array.from(finalEl.querySelectorAll<HTMLElement>('[data-step]'));

  const fills: HTMLElement[] = [];
  const chapterButtons: HTMLButtonElement[] = [];
  CHAPTERS.forEach((ch, k) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'story-chapter';
    btn.setAttribute('aria-label', `Play chapter ${k + 1}: ${ch.label}`);
    const bar = document.createElement('span');
    bar.className = 'story-chapter__bar';
    const fill = document.createElement('span');
    fill.className = 'story-chapter__fill';
    bar.append(fill);
    btn.append(bar);
    btn.addEventListener('click', () => jump(ch.start, true));
    li.append(btn);
    chapterList.append(li);
    fills.push(fill);
    chapterButtons.push(btn);
  });

  const score = new Score();

  // ── Clock ──────────────────────────────────────────────────
  let T = 0; // story time: pauses, seeks
  let A = 0; // ambient time: always flows while visible
  let playing = false;
  let complete = false;
  let running = false;
  let inView = true;
  let last = 0;
  let aimYaw = 0;
  let aimPitch = 0;

  const finish = () => {
    T = END;
    playing = false;
    complete = true;
    markSeen();
  };

  /** Cuts to story time t, dipping the canvas so formations don't teleport. */
  const jump = (t: number, play: boolean) => {
    T = t;
    playing = play;
    complete = false;
    if (T >= END) finish();
    for (const c of captions) c.settled = false;
    canvas.classList.remove('is-fading');
    canvas.style.opacity = '0';
    void canvas.offsetWidth;
    canvas.classList.add('is-fading');
    canvas.style.opacity = '';
    draw();
    wake();
  };

  // ── Per-frame DOM updates ──────────────────────────────────
  let chapterIdx = -1;
  const updateCaptions = () => {
    for (const c of captions) {
      const { cap, el, words } = c;
      const st = cap.stagger ?? 0.05;
      const n = words.length;
      const active = T >= cap.t - 0.02 && T <= cap.out + 0.5 + n * 0.02;
      if (!active) {
        if (!el.hidden) el.hidden = true;
        c.settled = false;
        continue;
      }
      if (el.hidden) el.hidden = false;
      const settled = T >= cap.t + (n - 1) * st + 0.85 && T < cap.out;
      if (settled && c.settled) continue;
      c.settled = settled;
      for (let j = 0; j < n; j++) {
        const pin = outCubic(clamp((T - cap.t - j * st) / 0.85));
        const pout = inCubic(clamp((T - cap.out - j * 0.02) / 0.45));
        reveal(words[j], pin, pout, 0.55, 'em');
      }
    }

    let idx = 0;
    for (let k = 0; k < CHAPTERS.length; k++) if (T >= CHAPTERS[k].start) idx = k;
    // the copy moves between chapters; the last one hands over to the final frame
    if (idx !== chapterIdx && idx < CHAPTERS.length - 1) {
      chapterIdx = idx;
      storyEl.dataset.align = CHAPTERS[idx].align;
    }
    const fade = clamp((T - (FINAL - 0.3)) / 0.5);
    storyEl.style.opacity = fade > 0 ? (1 - fade).toFixed(3) : '';
    storyEl.style.visibility = fade >= 1 ? 'hidden' : '';
  };

  let finalStatic = false;
  const updateFinal = () => {
    const local = T - FINAL;
    if (local >= STEP_AT[STEP_AT.length - 1] + 0.95) {
      if (!finalStatic) {
        steps.forEach(clearReveal);
        finalEl.classList.add('is-revealed');
        finalStatic = true;
      }
      return;
    }
    finalStatic = false;
    finalEl.classList.toggle('is-revealed', local >= 1.6);
    for (const el of steps) {
      const at = STEP_AT[Number(el.dataset.step) || 0];
      reveal(el, outCubic(clamp((local - at) / 0.95)), 0, 22, 'px');
    }
  };

  const fillCache = CHAPTERS.map(() => -1);
  let toggleState = '';
  const updateControls = () => {
    CHAPTERS.forEach((ch, k) => {
      const end = k + 1 < CHAPTERS.length ? CHAPTERS[k + 1].start : END;
      const f = Math.round(clamp((T - ch.start) / (end - ch.start)) * 1000) / 1000;
      if (f !== fillCache[k]) {
        fills[k].style.transform = `scaleX(${f})`;
        fillCache[k] = f;
      }
      chapterButtons[k].classList.toggle('is-active', !complete && T >= ch.start && T < end);
    });
    const state = complete ? 'replay' : playing ? 'pause' : 'play';
    if (state !== toggleState) {
      toggleState = state;
      toggle.dataset.state = state;
      toggle.setAttribute('aria-label', `${state[0].toUpperCase()}${state.slice(1)} intro`);
    }
    hero.classList.toggle('is-final', T >= FINAL);
    hero.classList.toggle('is-complete', complete);
  };

  const draw = () => {
    story.render(T, A);
    updateCaptions();
    updateFinal();
    updateControls();
  };

  // ── Loop ───────────────────────────────────────────────────
  const shouldRun = () => inView && !document.hidden && (playing || !reduced.matches);

  const advance = (dt: number) => {
    A += dt;
    if (playing) {
      T += dt;
      if (T >= END) finish();
    }
    const ease = 1 - Math.exp(-dt * 2.5);
    renderer.yaw += (aimYaw - renderer.yaw) * ease;
    renderer.pitch += (aimPitch - renderer.pitch) * ease;
    draw();
    score.update(T, playing, complete);
  };

  const frame = (now: number) => {
    advance(last ? Math.min(0.05, (now - last) / 1000) : 0);
    last = now;
    if (shouldRun()) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      last = 0;
    }
  };

  const wake = () => {
    score.setActive(inView && !document.hidden);
    if (running || !shouldRun()) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  };

  // ── Wiring ─────────────────────────────────────────────────
  toggle.addEventListener('click', () => {
    if (complete) {
      jump(0, true);
      return;
    }
    playing = !playing;
    updateControls();
    wake();
  });

  soundBtn.addEventListener('click', () => {
    score.update(T, playing, complete);
    if (score.on) score.disable();
    else score.enable();
    const on = score.on;
    soundBtn.dataset.state = on ? 'on' : 'off';
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
  });

  skip.addEventListener('click', () => {
    markSeen();
    jump(FINAL, true);
  });

  // Keyboard users tabbing into the CTAs get the final frame at once
  finalEl.addEventListener('focusin', () => {
    if (T < END) jump(END, false);
  });

  if (matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      if (e.clientY > r.bottom) return;
      aimYaw = ((e.clientX - r.left) / r.width - 0.5) * 0.24;
      aimPitch = -((e.clientY - r.top) / r.height - 0.5) * 0.16;
    }, { passive: true });
  }

  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    wake();
  }, { threshold: 0.02 }).observe(hero);

  document.addEventListener('visibilitychange', wake);

  const relayout = () => {
    measure();
    if (!running) draw();
  };
  const ro = new ResizeObserver(relayout);
  ro.observe(hero);
  ro.observe(copy);
  stacked.addEventListener('change', relayout);

  reduced.addEventListener('change', () => {
    if (reduced.matches && !complete) jump(END, false);
    else wake();
  });

  // ── Start ──────────────────────────────────────────────────
  const devT = import.meta.env.DEV && params.has('t') ? Number(params.get('t')) : Number.NaN;
  if (!Number.isNaN(devT)) {
    T = devT;
  } else if (reduced.matches || (seen && !params.has('story'))) {
    finish();
  } else {
    playing = true;
  }

  if (import.meta.env.DEV) {
    (window as unknown as { heroStory: object }).heroStory = {
      seek(t: number) {
        T = t;
        playing = false;
        complete = false;
        for (const c of captions) c.settled = false;
        draw();
      },
      play() {
        playing = true;
        wake();
      },
      pause() {
        playing = false;
      },
      /** Steps the clock by hand, for environments where rAF is throttled. */
      tick(dt = 1 / 60) {
        advance(dt);
      },
      get time() {
        return T;
      },
      score,
    };
  }

  // Paint the opening state now, then give the web fonts a moment so
  // captions don't reflow mid-reveal before the clock starts
  draw();
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(() => {
    measure();
    draw();
    wake();
  });
}
