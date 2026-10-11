export type Waveform = "sine" | "triangle" | "sawtooth" | "square";

export type SynthParams = {
  waveform: Waveform;
  cutoff: number;
  resonance: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  volume: number;
};

export const DEFAULT_PARAMS: SynthParams = {
  waveform: "sine",
  cutoff: 1600,
  resonance: 0.8,
  attack: 0.01,
  decay: 0.25,
  sustain: 0.35,
  release: 0.4,
  volume: 0.72,
};

type Voice = {
  osc: OscillatorNode;
  gain: GainNode;
  born: number;
};

const PEAK = 0.2;
const MAX_VOICES = 24;

export class SynthEngine {
  params: SynthParams;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private time = new Uint8Array(1024);
  private voices: Voice[] = [];
  private levelValue = 0;

  constructor(params: SynthParams) {
    this.params = { ...params };
  }

  get armed() {
    return this.ctx !== null;
  }

  /** Create the graph inside a user gesture. Safe to call more than once. */
  arm() {
    if (this.ctx) {
      if (this.ctx.state !== "running") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = this.params.cutoff;
    filter.Q.value = this.params.resonance;

    const master = ctx.createGain();
    master.gain.value = this.params.volume;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    this.time = new Uint8Array(analyser.fftSize);

    filter.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.filter = filter;
    this.master = master;
    this.analyser = analyser;
    if (ctx.state !== "running") void ctx.resume();
  }

  setParams(next: Partial<SynthParams>) {
    this.params = { ...this.params, ...next };
    const ctx = this.ctx;
    if (!ctx || !this.filter || !this.master) return;
    const now = ctx.currentTime;
    if (next.cutoff !== undefined) {
      this.filter.frequency.setTargetAtTime(this.params.cutoff, now, 0.015);
    }
    if (next.resonance !== undefined) {
      this.filter.Q.setTargetAtTime(this.params.resonance, now, 0.015);
    }
    if (next.volume !== undefined) {
      this.master.gain.setTargetAtTime(this.params.volume, now, 0.015);
    }
    if (next.waveform) {
      for (const voice of this.voices) voice.osc.type = next.waveform;
    }
  }

  noteOn(midi: number) {
    const ctx = this.ctx;
    const filter = this.filter;
    if (!ctx || !filter) return;
    while (this.voices.length >= MAX_VOICES) {
      const oldest = this.voices.shift();
      if (oldest) this.silence(oldest, 0.02);
    }

    const osc = ctx.createOscillator();
    osc.type = this.params.waveform;
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(filter);

    const voice: Voice = { osc, gain, born: ctx.currentTime };
    this.attack(voice);
    osc.start();
    this.voices.push(voice);
  }

  noteOff(midi: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const voice = [...this.voices].reverse().find((item) => {
      return Math.abs(item.osc.frequency.value - freq) < 0.5;
    });
    if (!voice) return;
    this.voices = this.voices.filter((item) => item !== voice);
    this.silence(voice, Math.max(this.params.release, 0.01));
  }

  panic() {
    for (const voice of this.voices) this.silence(voice, 0.03);
    this.voices = [];
  }

  level() {
    return this.levelValue;
  }

  /** Pull the analyser. Samples are display-scaled to about -1..1. */
  scope(bins = 160): number[] {
    const analyser = this.analyser;
    if (!analyser || !this.ctx) {
      this.levelValue = 0;
      return [];
    }
    analyser.getByteTimeDomainData(this.time);
    const samples: number[] = [];
    const step = this.time.length / bins;
    let sum = 0;
    for (let i = 0; i < bins; i += 1) {
      const raw = ((this.time[Math.floor(i * step)] ?? 128) - 128) / 128;
      sum += raw * raw;
      samples.push(Math.max(-1, Math.min(1, raw * 3.6)));
    }
    const rms = Math.sqrt(sum / bins);
    this.levelValue = Math.min(1, Math.sqrt(rms) * 1.85);
    return samples;
  }

  dispose() {
    this.panic();
    void this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.analyser = null;
  }

  private attack(voice: Voice) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const { attack, decay, sustain } = this.params;
    const g = voice.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(0.0001, now);
    const a = Math.max(attack, 0.005);
    g.linearRampToValueAtTime(PEAK, now + a);
    g.linearRampToValueAtTime(Math.max(sustain * PEAK, 0.0001), now + a + Math.max(decay, 0.01));
  }

  private silence(voice: Voice, release: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = voice.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, 0.0001), now);
    g.exponentialRampToValueAtTime(0.0001, now + release);
    try {
      voice.osc.stop(now + release + 0.04);
    } catch {
      /* already stopped */
    }
  }
}
