// ============================================================
// HERO STORY — SOUNDTRACK
// An upbeat, positive track synthesised live with Web Audio and
// locked to the story clock: D major at ~113 BPM, four-on-the-floor
// kick, a bouncing bassline, plucked arpeggios and bright stabs.
// The arrangement builds with the chapters, drops on the beats the
// animation lands, then settles into a lighter loop. Nothing is
// downloaded; audio only starts after a click.
// ============================================================

import { BEAT, END } from './scenes';

const STEP = BEAT / 4; // a sixteenth note
const LOOKAHEAD = 0.14; // seconds of notes scheduled ahead of the clock
const LEVEL = 0.5;

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };

/** iPhone, iPod, or an iPad presenting itself as a Mac. */
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** A tenth of a second of silence as a WAV, for switching older iOS into playback mode. */
function silentWav(): string {
  const rate = 8000;
  const n = 800;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const GESTURES = ['touchend', 'click', 'keydown'];

interface Chord {
  bass: number; // MIDI
  tones: number[]; // voicing, low to high
}

const CHORD: Record<string, Chord> = {
  D: { bass: 50, tones: [62, 66, 69, 76] },
  A: { bass: 45, tones: [61, 64, 69, 73] },
  Bm: { bass: 47, tones: [62, 66, 69, 71] },
  G: { bass: 43, tones: [62, 66, 67, 71] },
  Asus: { bass: 45, tones: [62, 64, 69, 71] },
  Em: { bass: 52, tones: [62, 64, 67, 71] },
};

/** One chord per bar through the story; the final frame lands on bar 19. */
const SONG = ['D', 'A', 'Bm', 'G', 'D', 'Bm', 'Asus', 'D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'Em', 'G', 'Bm', 'G', 'Asus', 'D'];
const LOOP = ['D', 'A', 'Bm', 'G'];
const chordAt = (bar: number) => CHORD[bar < SONG.length ? SONG[bar] : LOOP[(bar - 19) % 4]];

/** What plays in each bar; levels are 0–1. */
interface Mix {
  pad: number;
  kick: number;
  clap: number;
  hat: number;
  hat16: number;
  open: number;
  shaker: number;
  bass: number;
  long: boolean; // held bass notes instead of the bounce
  arp: number;
  arp8: boolean; // eighth-note arpeggio instead of sixteenths
  sparkle: number;
  stab: number;
  roll: number;
  riser: boolean;
  crash: boolean;
  hook: boolean;
}

const NONE: Mix = {
  pad: 0, kick: 0, clap: 0, hat: 0, hat16: 0, open: 0, shaker: 0, bass: 0, long: false,
  arp: 0, arp8: false, sparkle: 0, stab: 0, roll: 0, riser: false, crash: false, hook: false,
};

function mixAt(bar: number): Mix {
  const m = (o: Partial<Mix>): Mix => ({ ...NONE, ...o });
  // 01 Direction: a pulse in the void, then people fall into step
  if (bar < 2) return m({ pad: 0.9, arp: 0.55, arp8: true });
  if (bar < 4) return m({ pad: 0.8, arp: 0.65, arp8: true, kick: 0.65, shaker: 0.45 });
  // 02 Partnership: the groove arrives, tension, then the drop on "one vision"
  if (bar < 6) return m({ pad: 0.7, arp: 0.8, kick: 0.9, clap: 0.7, hat: 0.6, shaker: 0.4, bass: 0.85 });
  if (bar === 6) return m({ pad: 0.8, arp: 0.85, kick: 0.9, hat: 0.5, hat16: 0.6, bass: 0.7, long: true, roll: 1, riser: true });
  if (bar < 9) return m({ pad: 0.65, arp: 1, kick: 1, clap: 0.85, hat: 0.75, hat16: 0.5, open: 0.6, shaker: 0.5, bass: 1, stab: 0.8, crash: bar === 7 });
  // 03 Blueprint: full groove, lifting again when the system scales
  if (bar < 13) return m({ pad: 0.6, arp: 0.9, kick: 1, clap: 0.8, hat: 0.7, hat16: 0.45, shaker: 0.45, bass: 1, stab: bar % 2 ? 0.55 : 0.4 });
  if (bar === 13) return m({ pad: 0.65, arp: 1, sparkle: 0.7, kick: 1, clap: 0.85, hat: 0.75, hat16: 0.6, open: 0.7, shaker: 0.5, bass: 1, stab: 0.75, crash: true });
  // 04 People: a breakdown, then a build into the finale
  if (bar < 17) return m({ pad: 0.95, arp: 0.75, clap: 0.5, hat: 0.4, shaker: 0.35, bass: 0.6, long: true });
  if (bar < 19) return m({ pad: 0.85, arp: 0.9, kick: 0.9, hat: 0.55, hat16: bar === 18 ? 0.6 : 0, bass: 0.8, roll: bar === 17 ? 0.6 : 1, riser: bar === 18 });
  // 05 Hello: everything, plus the hook
  if (bar < 21) return m({ pad: 0.7, arp: 1, sparkle: 0.55, kick: 1, clap: 0.85, hat: 0.75, hat16: 0.5, open: 0.6, shaker: 0.5, bass: 1, stab: 0.8, crash: bar === 19, hook: true });
  // afterwards: a lighter groove that breathes every sixteen bars
  const phase = (bar - 21) % 16;
  if (phase >= 12) return m({ pad: 0.9, arp: 0.6, hat: 0.3, shaker: 0.3, bass: 0.55, long: true });
  return m({ pad: 0.6, arp: 0.75, kick: 0.75, clap: 0.55, hat: 0.55, shaker: 0.35, bass: 0.85, stab: 0.35, hook: bar >= 37 && (phase === 2 || phase === 3) });
}

/** First bar of the two-bar hook that `bar` belongs to. */
const hookStart = (bar: number) => (bar < 21 ? 19 : bar - (((bar - 21) % 16) - 2));

// [step within the two bars, MIDI, length in steps]
const HOOK: [number, number, number][] = [
  [0, 78, 2], [2, 81, 2], [4, 83, 2], [6, 81, 2], [8, 78, 3], [12, 74, 4],
  [16, 76, 2], [18, 78, 2], [20, 76, 2], [22, 73, 2], [24, 69, 6],
];
// [step within the bar, octave, length in steps]
const BOUNCE: [number, number, number][] = [
  [0, 0, 2], [3, 0, 1], [4, 12, 1], [6, 0, 2], [8, 0, 2], [11, 0, 1], [12, 12, 1], [14, 0, 2],
];
const ARP = [0, 1, 2, 3, 4, 3, 2, 1]; // 4 = the root an octave up
/** Clarity. Capability. Confidence. — chimes on beats 71, 73 and 75. */
const BELLS: Record<number, number> = { [71 * 4]: 81, [73 * 4]: 83, [75 * 4]: 86 };

interface Held {
  gain: GainNode;
  srcs: AudioScheduledSourceNode[];
}

export class Score {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null; // ducked by the kick
  private drums: GainNode | null = null;
  private verb: GainNode | null = null; // reverb send
  private echo: GainNode | null = null; // delay send
  private noiseBuf: AudioBuffer | null = null;
  private held: Held[] = [];
  private timer = 0;

  private enabled = false;
  private active = true;
  private t = 0; // story time
  private playing = false;
  private complete = false;
  private m = 0; // music time
  private doneAt = -1; // audio time the story completed, for the ambient loop
  private step = -1; // last scheduled sixteenth
  private silent: HTMLAudioElement | null = null;
  private sleep = 0;

  /** Later taps bring audio back if iOS suspended it (lock screen, app switch, a call). */
  private readonly wake = () => {
    if (this.enabled && this.ctx && this.ctx.state !== 'running') this.unlock();
  };

  get on(): boolean {
    return this.enabled;
  }

  /** Must run inside a user gesture so the browser lets audio start. */
  enable(): void {
    this.enabled = true;
    // iOS routes Web Audio through an "ambient" session that Silent mode mutes;
    // a "playback" session plays like any other media (iOS 17+)
    const session = (navigator as AudioSessionNavigator).audioSession;
    if (session) session.type = 'playback';
    if (!this.ctx) this.build();
    window.clearTimeout(this.sleep);
    this.unlock();
    this.resync();
    this.level(1.2);
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => this.tick(), 25);
    for (const type of GESTURES) document.addEventListener(type, this.wake, true);
  }

  disable(): void {
    this.enabled = false;
    window.clearInterval(this.timer);
    for (const type of GESTURES) document.removeEventListener(type, this.wake, true);
    this.level(0.5);
    this.silent?.pause();
    // once faded out, give the device's audio back to other apps
    window.clearTimeout(this.sleep);
    this.sleep = window.setTimeout(() => {
      if (this.enabled) return;
      void this.ctx?.suspend();
      const session = (navigator as AudioSessionNavigator).audioSession;
      if (session) session.type = 'auto';
    }, 600);
  }

  /** Mutes while the hero is off screen or the tab is hidden. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (!this.ctx || !this.enabled) return;
    if (active) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      void this.silent?.play().catch(() => {});
      this.resync();
    }
    this.level(active ? 0.8 : 0.3);
  }

  /** Wakes the audio context from inside a user gesture, the way iOS requires. */
  private unlock(): void {
    const ctx = this.ctx!;
    if (ctx.state !== 'running') void ctx.resume();
    // a one-sample silent blip: the long-standing way to unlock Web Audio on iOS
    const blip = ctx.createBufferSource();
    blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    blip.connect(ctx.destination);
    blip.start();
    // older iOS has no audio session API; a playing media element switches the
    // page into playback mode instead, so Silent mode stops muting the track
    if (isIOS() && !(navigator as AudioSessionNavigator).audioSession) {
      if (!this.silent) {
        this.silent = new Audio(silentWav());
        this.silent.loop = true;
        this.silent.setAttribute('playsinline', '');
        this.silent.setAttribute('x-webkit-airplay', 'deny');
      }
      void this.silent.play().catch(() => {});
    }
  }

  /** Follows the story clock; call every frame (and after seeks). */
  update(T: number, playing: boolean, complete: boolean): void {
    const was = this.playing || this.complete;
    this.t = T;
    this.playing = playing;
    if (complete && !this.complete && this.ctx) this.doneAt = this.ctx.currentTime - Math.max(0, T - END);
    this.complete = complete;
    if (!this.ctx || !this.enabled) return;
    if (was !== (playing || complete)) this.level(0.4); // pause / resume
    this.tick();
  }

  // ── Clock & scheduling ─────────────────────────────────────
  private clock(): number {
    if (this.playing) return this.t;
    if (this.complete && this.ctx) {
      if (this.doneAt < 0) this.doneAt = this.ctx.currentTime;
      return END + (this.ctx.currentTime - this.doneAt);
    }
    return this.m;
  }

  /** Re-aligns the sequencer after a seek, a pause or coming back on screen. */
  private resync(): void {
    if (!this.ctx) return;
    this.m = this.clock();
    this.step = Math.floor(this.m / STEP) - 1;
    const now = this.ctx.currentTime;
    for (const h of this.held) {
      h.gain.gain.cancelScheduledValues(now);
      h.gain.gain.setTargetAtTime(0, now, 0.04);
      for (const s of h.srcs) {
        try {
          s.stop(now + 0.3);
        } catch {
          /* older WebKit throws if a source was already stopped */
        }
      }
    }
    this.held = [];
    // pick the current bar's pad up mid-way so the harmony is there at once
    const bar = Math.floor(this.m / (STEP * 16));
    const left = (bar + 1) * STEP * 16 - this.m;
    const mix = mixAt(bar);
    if ((this.playing || this.complete) && mix.pad && left > 0.2) this.pad(now, chordAt(bar), mix.pad, left);
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled || !this.active) return;
    const m = this.clock();
    if (m < this.m - 0.01 || m - this.m > 0.35) {
      this.m = m;
      this.resync();
      return;
    }
    this.m = m;
    if (!this.playing && !this.complete) return;
    const now = ctx.currentTime;
    const until = Math.floor((m + LOOKAHEAD) / STEP);
    for (let s = this.step + 1; s <= until; s++) {
      const when = now + (s * STEP - m);
      if (when >= now - 0.02) this.play(s, Math.max(when, now));
    }
    this.step = Math.max(this.step, until);
  }

  private play(s: number, t: number): void {
    const bar = Math.floor(s / 16);
    const st = s % 16;
    const mix = mixAt(bar);
    const chord = chordAt(bar);

    if (st === 0) {
      if (mix.pad) this.pad(t, chord, mix.pad, STEP * 16);
      if (mix.crash) this.crash(t);
      if (mix.riser) this.riser(t, STEP * 16);
    }
    if (mix.kick && st % 4 === 0) this.kick(t, mix.kick);
    if (mix.clap && (st === 4 || st === 12)) this.clap(t, mix.clap);
    if (mix.hat) {
      if (st % 4 === 2) this.hat(t, mix.hat, mix.open > 0 && st === 14);
      else if (mix.hat16 && st % 2 === 1) this.hat(t, mix.hat * mix.hat16 * 0.5, false);
    }
    if (mix.shaker && st % 2 === 1) this.shaker(t, mix.shaker * (st % 4 === 3 ? 1 : 0.6));
    if (mix.roll) {
      const every = st < 8 ? 2 : 1;
      if (st % every === 0) this.snare(t, mix.roll * (0.25 + 0.75 * (st / 15)));
    }
    if (mix.bass) {
      if (mix.long) {
        if (st === 0) this.bass(t, chord.bass, STEP * 15, mix.bass);
      } else {
        for (const [at, oct, len] of BOUNCE) if (at === st) this.bass(t, chord.bass + oct, STEP * len, mix.bass);
      }
    }
    if (mix.arp && (!mix.arp8 || st % 2 === 0)) {
      const i = ARP[(mix.arp8 ? st / 2 : st) % ARP.length];
      const note = i === 4 ? chord.tones[0] + 12 : chord.tones[i];
      this.pluck(t, note, mix.arp * (st % 4 === 0 ? 1 : 0.75), st % 2 ? 0.35 : -0.35);
    }
    if (mix.sparkle && st % 2 === 1) this.pluck(t, chord.tones[(st >> 1) % 4] + 12, mix.sparkle * 0.5, (st % 4) - 1.5);
    if (mix.stab && (st === 3 || st === 10)) this.stab(t, chord, mix.stab);
    if (mix.hook) {
      const local = (bar - hookStart(bar)) * 16 + st;
      for (const [at, note, len] of HOOK) if (at === local) this.lead(t, note, STEP * len);
    }
    const bell = BELLS[s];
    if (bell) this.bell(t, bell);
  }

  // ── Graph ──────────────────────────────────────────────────
  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.connect(limiter).connect(ctx.destination);
    this.master = master;

    const music = ctx.createGain();
    music.connect(master);
    this.music = music;
    const drums = ctx.createGain();
    drums.connect(master);
    this.drums = drums;

    // a bright, short room
    const len = Math.floor(ctx.sampleRate * 2.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    const verb = ctx.createGain();
    verb.gain.value = 0.28;
    verb.connect(reverb).connect(master);
    this.verb = verb;

    // dotted-eighth echo for the plucks and the hook
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    delay.connect(tone).connect(fb).connect(delay);
    const echo = ctx.createGain();
    echo.gain.value = 0.22;
    echo.connect(delay);
    tone.connect(master);
    this.echo = echo;

    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;
  }

  private level(secs: number): void {
    if (!this.ctx || !this.master) return;
    const on = this.enabled && this.active && (this.playing || this.complete);
    const g = this.master.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(on ? LEVEL : 0, now + secs);
  }

  // ── Instruments ────────────────────────────────────────────
  private env(t: number, peak: number, attack: number, decay: number, dest: AudioNode): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    g.connect(dest);
    return g;
  }

  private osc(type: OscillatorType, freq: number, t: number, stop: number, dest: AudioNode, detune = 0): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    o.start(t);
    o.stop(stop);
    return o;
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, v: number, dest: AudioNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(this.env(t, v, 0.002, dur, dest));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  private kick(t: number, v: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.11);
    o.connect(this.env(t, 0.95 * v, 0.004, 0.36, this.drums!));
    o.start(t);
    o.stop(t + 0.42);
    this.noise(t, 0.012, 'highpass', 2600, 0.7, 0.22 * v, this.drums!);
    // pump the music under each kick
    const d = this.music!.gain;
    d.setValueAtTime(1, t);
    d.linearRampToValueAtTime(0.42, t + 0.012);
    d.linearRampToValueAtTime(1, t + 0.26);
  }

  private clap(t: number, v: number): void {
    for (const [dt, len, k] of [[0, 0.02, 0.6], [0.012, 0.02, 0.6], [0.024, 0.16, 1]] as const) {
      this.noise(t + dt, len, 'bandpass', 1500, 1.1, 0.34 * v * k, this.drums!);
      this.noise(t + dt, len, 'bandpass', 1500, 1.1, 0.2 * v * k, this.verb!);
    }
  }

  private hat(t: number, v: number, open: boolean): void {
    this.noise(t, open ? 0.26 : 0.035, 'highpass', 7600, 0.8, (open ? 0.12 : 0.1) * v, this.drums!);
  }

  private shaker(t: number, v: number): void {
    this.noise(t, 0.05, 'bandpass', 5800, 2.2, 0.06 * v, this.drums!);
  }

  private snare(t: number, v: number): void {
    this.noise(t, 0.11, 'bandpass', 2100, 0.8, 0.2 * v, this.drums!);
    this.osc('triangle', 190, t, t + 0.09, this.env(t, 0.12 * v, 0.002, 0.07, this.drums!));
  }

  private crash(t: number): void {
    this.noise(t, 1.8, 'highpass', 4200, 0.6, 0.16, this.drums!);
    this.noise(t, 1.8, 'highpass', 4200, 0.6, 0.1, this.verb!);
  }

  private riser(t: number, dur: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.drums!);
    src.start(t);
    src.stop(t + dur + 0.02);
    this.held.push({ gain: g, srcs: [src] });
  }

  private bass(t: number, midi: number, dur: number, v: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(1500, t);
    f.frequency.exponentialRampToValueAtTime(280, t + Math.min(0.24, dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.26 * v, t + 0.008);
    g.gain.setValueAtTime(0.26 * v, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    f.connect(g).connect(this.music!);
    const stop = t + dur + 0.08;
    this.osc('sawtooth', hz(midi), t, stop, f);
    const sub = ctx.createGain();
    sub.gain.value = 0.7;
    sub.connect(g);
    this.osc('sine', hz(midi), t, stop, sub);
  }

  private pluck(t: number, midi: number, v: number, pan: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(4600, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.16);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = this.env(t, 0.1 * v, 0.004, 0.26, p);
    f.connect(g);
    p.connect(this.music!);
    p.connect(this.echo!);
    this.osc('sawtooth', hz(midi), t, t + 0.32, f);
    this.osc('square', hz(midi), t, t + 0.32, f, 7);
  }

  private stab(t: number, chord: Chord, v: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, t);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.2);
    const g = this.env(t, 0.06 * v, 0.004, 0.22, this.music!);
    g.connect(this.verb!);
    f.connect(g);
    for (const n of chord.tones.slice(1)) {
      this.osc('sawtooth', hz(n), t, t + 0.3, f, -8);
      this.osc('sawtooth', hz(n), t, t + 0.3, f, 8);
    }
  }

  private pad(t: number, chord: Chord, v: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03 * v, t + 0.12);
    g.gain.setValueAtTime(0.03 * v, t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    f.connect(g).connect(this.music!);
    g.connect(this.verb!);
    const srcs: AudioScheduledSourceNode[] = [];
    for (const n of chord.tones) {
      srcs.push(this.osc('sawtooth', hz(n), t, t + dur + 0.35, f, -7));
      srcs.push(this.osc('sawtooth', hz(n), t, t + dur + 0.35, f, 7));
    }
    if (this.held.length > 6) this.held.shift();
    this.held.push({ gain: g, srcs });
  }

  private lead(t: number, midi: number, dur: number): void {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.11, t + 0.012);
    g.gain.setValueAtTime(0.09, t + dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    f.connect(g);
    g.connect(this.music!);
    g.connect(this.echo!);
    g.connect(this.verb!);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 7;
    vib.connect(depth);
    vib.start(t);
    vib.stop(t + dur + 0.15);
    for (const [type, det] of [['square', 0], ['triangle', 6]] as const) {
      const o = this.osc(type, hz(midi), t, t + dur + 0.15, f, det);
      depth.connect(o.detune);
    }
  }

  private bell(t: number, midi: number): void {
    const g = this.env(t, 0.1, 0.006, 3, this.drums!);
    g.connect(this.verb!);
    for (const [ratio, gain] of [[1, 1], [2.76, 0.3], [5.4, 0.1]]) {
      const pg = this.ctx!.createGain();
      pg.gain.value = gain;
      pg.connect(g);
      this.osc('sine', hz(midi) * ratio, t, t + 3.1, pg);
    }
  }
}
