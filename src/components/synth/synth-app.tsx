import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { DEFAULT_PARAMS, SynthEngine, type SynthParams, type Waveform } from "@/lib/synth/engine";
import {
  KEY_MAP,
  MAX_OCTAVE,
  MIN_OCTAVE,
  PIANO_KEYS,
  clampMidi,
  midiFor,
  noteLabel,
} from "@/lib/synth/theory";

const WAVES: { id: Waveform; label: string }[] = [
  { id: "sine", label: "Sine" },
  { id: "triangle", label: "Tri" },
  { id: "sawtooth", label: "Saw" },
  { id: "square", label: "Square" },
];

const PRESETS: { id: string; label: string; patch: Omit<SynthParams, "volume"> }[] = [
  {
    id: "keys",
    label: "Keys",
    patch: { waveform: "sine", cutoff: 1600, resonance: 0.8, attack: 0.01, decay: 0.25, sustain: 0.35, release: 0.4 },
  },
  {
    id: "pluck",
    label: "Pluck",
    patch: { waveform: "triangle", cutoff: 2800, resonance: 2.4, attack: 0.005, decay: 0.18, sustain: 0.02, release: 0.16 },
  },
  {
    id: "pad",
    label: "Pad",
    patch: { waveform: "sawtooth", cutoff: 720, resonance: 0.7, attack: 0.42, decay: 0.35, sustain: 0.78, release: 1.05 },
  },
  {
    id: "bass",
    label: "Bass",
    patch: { waveform: "square", cutoff: 320, resonance: 5.5, attack: 0.005, decay: 0.14, sustain: 0.62, release: 0.12 },
  },
];

const WHITE_KEYS = PIANO_KEYS.filter((key) => key.white);
const BLACK_KEYS = PIANO_KEYS.filter((key) => !key.white);

export function SynthApp() {
  const engineRef = useRef<SynthEngine | null>(null);
  const paramsRef = useRef<SynthParams>(DEFAULT_PARAMS);
  const octaveRef = useRef(4);
  const counts = useRef(new Map<number, number>());
  const latched = useRef(new Set<number>());
  const sounding = useRef(new Set<number>());
  const pointers = useRef(new Map<number, number>());
  const keyMidi = useRef(new Map<string, number>());
  const sustainRef = useRef(false);

  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS);
  const [octave, setOctave] = useState(4);
  const [armed, setArmed] = useState(false);
  const [sustain, setSustain] = useState(false);
  const [active, setActive] = useState<number[]>([]);
  const [recent, setRecent] = useState("—");
  const [preset, setPreset] = useState("keys");

  useEffect(() => {
    paramsRef.current = params;
    engineRef.current?.setParams(params);
  }, [params]);

  useEffect(() => {
    octaveRef.current = octave;
  }, [octave]);

  useEffect(() => {
    return () => engineRef.current?.dispose();
  }, []);

  function paint() {
    const notes = new Set<number>([...counts.current.keys(), ...latched.current]);
    setActive([...notes].sort((a, b) => a - b));
  }

  function ensure() {
    if (!engineRef.current) engineRef.current = new SynthEngine(paramsRef.current);
    engineRef.current.arm();
    engineRef.current.setParams(paramsRef.current);
    setArmed(true);
  }

  function press(midi: number) {
    ensure();
    const wasDown = counts.current.has(midi);
    const next = (counts.current.get(midi) ?? 0) + 1;
    counts.current.set(midi, next);
    latched.current.delete(midi);
    if (!wasDown) {
      if (sounding.current.has(midi)) engineRef.current?.noteOff(midi);
      engineRef.current?.noteOn(midi);
      sounding.current.add(midi);
    }
    setRecent(noteLabel(midi));
    paint();
  }

  function stop(midi: number) {
    if (sounding.current.has(midi)) {
      engineRef.current?.noteOff(midi);
      sounding.current.delete(midi);
    }
    latched.current.delete(midi);
  }

  function release(midi: number) {
    const next = (counts.current.get(midi) ?? 1) - 1;
    if (next <= 0) counts.current.delete(midi);
    else counts.current.set(midi, next);
    if (next <= 0) {
      if (sustainRef.current) latched.current.add(midi);
      else stop(midi);
    }
    paint();
  }

  function setPedal(on: boolean) {
    sustainRef.current = on;
    setSustain(on);
    if (!on) {
      for (const midi of [...latched.current]) {
        if (!counts.current.has(midi)) stop(midi);
      }
      latched.current.clear();
      paint();
    }
  }

  function panic() {
    counts.current.clear();
    latched.current.clear();
    sounding.current.clear();
    pointers.current.clear();
    keyMidi.current.clear();
    engineRef.current?.panic();
    paint();
  }

  function shiftOctave(delta: number) {
    setOctave((current) => Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, current + delta)));
  }

  function nudgeVolume(delta: number) {
    setPreset("");
    setParams((current) => ({
      ...current,
      volume: Math.min(1, Math.max(0, Math.round((current.volume + delta) * 100) / 100)),
    }));
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code === "Space") {
        event.preventDefault();
        if (event.repeat) return;
        setPedal(true);
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        panic();
        return;
      }
      if (event.code === "BracketLeft" || event.code === "Minus") {
        event.preventDefault();
        if (!event.repeat) shiftOctave(-1);
        return;
      }
      if (event.code === "BracketRight" || event.code === "Equal") {
        event.preventDefault();
        if (!event.repeat) shiftOctave(1);
        return;
      }
      if (event.code === "ArrowDown") {
        event.preventDefault();
        nudgeVolume(-0.05);
        return;
      }
      if (event.code === "ArrowUp") {
        event.preventDefault();
        nudgeVolume(0.05);
        return;
      }
      if (event.repeat || keyMidi.current.has(event.code)) return;
      const offset = KEY_MAP[event.code];
      if (offset === undefined) return;
      event.preventDefault();
      const midi = clampMidi(midiFor(octaveRef.current, offset));
      keyMidi.current.set(event.code, midi);
      press(midi);
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.code === "Space") {
        setPedal(false);
        return;
      }
      const midi = keyMidi.current.get(event.code);
      if (midi === undefined) return;
      keyMidi.current.delete(event.code);
      release(midi);
    }

    function onBlur() {
      panic();
      setPedal(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  function midiAt(offset: number) {
    return clampMidi(midiFor(octave, offset));
  }

  function hitMidi(event: ReactPointerEvent) {
    const el = document.elementFromPoint(event.clientX, event.clientY);
    const key = el?.closest("[data-midi]");
    if (!key) return null;
    const value = Number(key.getAttribute("data-midi"));
    return Number.isFinite(value) ? value : null;
  }

  function movePointer(event: ReactPointerEvent<HTMLDivElement>, fromDown = false) {
    if (!fromDown && !pointers.current.has(event.pointerId)) return;
    const midi = hitMidi(event);
    const prev = pointers.current.get(event.pointerId);
    if (prev === midi) return;
    if (prev !== undefined && prev >= 0) release(prev);
    if (midi === null) {
      pointers.current.delete(event.pointerId);
      return;
    }
    pointers.current.set(event.pointerId, midi);
    press(midi);
  }

  function endPointer(event: ReactPointerEvent<HTMLDivElement>) {
    const prev = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (prev !== undefined) release(prev);
  }

  function applyPreset(id: string) {
    const found = PRESETS.find((item) => item.id === id);
    if (!found) return;
    setPreset(id);
    setParams((current) => ({ ...current, ...found.patch }));
  }

  function patch(partial: Partial<SynthParams>) {
    setPreset("");
    setParams((current) => ({ ...current, ...partial }));
  }

  const activeSet = new Set(active);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-5xl flex-col gap-3 overflow-hidden px-3 py-3 sm:gap-4 sm:px-6 sm:py-5">
      <header className="rise flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-mist uppercase">Desk synth</p>
          <h1 className="font-display text-4xl leading-none text-cream sm:text-5xl">Aurum</h1>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-2xl text-amber tabular-nums" aria-live="polite">
            {recent}
          </p>
          <button
            type="button"
            aria-pressed={armed}
            onClick={() => ensure()}
            className="flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-2 font-mono text-xs tracking-widest text-cream uppercase transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            <span className={armed ? "lamp-on size-2.5 rounded-full" : "size-2.5 rounded-full bg-line"} />
            {armed ? "Live" : "Arm"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto sm:gap-4">

      {!armed ? (
        <p className="font-mono text-xs tracking-wide text-mist">
          Sound stays off until you tap Arm, a key, or the keyboard.
        </p>
      ) : null}

      <section className="chassis rise grid grid-cols-[1fr_auto] gap-3 p-3 sm:p-4">
        <ScopeMeter engineRef={engineRef} armed={armed} />
        <LevelReadout engineRef={engineRef} />
      </section>

      <section className="chassis flex flex-col gap-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs tracking-widest text-mist uppercase">Wave</span>
            <div role="radiogroup" aria-label="Waveform" className="flex overflow-hidden rounded-full border border-line">
              {WAVES.map((wave) => {
                const on = params.waveform === wave.id;
                return (
                  <button
                    key={wave.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => patch({ waveform: wave.id })}
                    className={
                      on
                        ? "min-h-11 bg-amber px-4 text-sm font-medium text-ink"
                        : "min-h-11 bg-raised px-4 text-sm text-mist"
                    }
                  >
                    {wave.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="group" aria-label="Presets">
            {PRESETS.map((item) => {
              const on = preset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => applyPreset(item.id)}
                  className={
                    on
                      ? "min-h-11 rounded-full bg-cream px-4 text-sm font-medium text-ink"
                      : "min-h-11 rounded-full border border-line px-4 text-sm text-mist"
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tracking-widest text-mist uppercase">Octave</span>
            <button
              type="button"
              aria-label="Octave down"
              onClick={() => shiftOctave(-1)}
              className="size-11 rounded-full border border-line bg-raised text-lg text-cream"
            >
              −
            </button>
            <span className="w-8 text-center font-mono text-lg text-cream tabular-nums">{octave}</span>
            <button
              type="button"
              aria-label="Octave up"
              onClick={() => shiftOctave(1)}
              className="size-11 rounded-full border border-line bg-raised text-lg text-cream"
            >
              +
            </button>
            <button
              type="button"
              aria-pressed={sustain}
              onClick={() => setPedal(!sustain)}
              className={
                sustain
                  ? "min-h-11 rounded-full bg-ember px-4 text-sm font-medium text-cream"
                  : "min-h-11 rounded-full border border-line px-4 text-sm text-mist"
              }
            >
              Pedal
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-4">
          <Knob
            label="Cut"
            ariaLabel="Cutoff"
            value={params.cutoff}
            min={80}
            max={8000}
            curve="log"
            format={formatHz}
            onChange={(cutoff) => patch({ cutoff })}
          />
          <Knob
            label="Res"
            ariaLabel="Resonance"
            value={params.resonance}
            min={0.4}
            max={14}
            format={(value) => value.toFixed(1)}
            onChange={(resonance) => patch({ resonance })}
          />
          <Knob
            label="Atk"
            ariaLabel="Attack"
            value={params.attack}
            min={0.005}
            max={1.4}
            curve="log"
            format={formatTime}
            onChange={(attack) => patch({ attack })}
          />
          <Knob
            label="Dec"
            ariaLabel="Decay"
            value={params.decay}
            min={0.01}
            max={1.4}
            curve="log"
            format={formatTime}
            onChange={(decay) => patch({ decay })}
          />
          <Knob
            label="Sus"
            ariaLabel="Sustain"
            value={params.sustain}
            min={0}
            max={1}
            format={(value) => `${Math.round(value * 100)}`}
            onChange={(value) => patch({ sustain: value })}
          />
          <Knob
            label="Rel"
            ariaLabel="Release"
            value={params.release}
            min={0.01}
            max={2}
            curve="log"
            format={formatTime}
            onChange={(release) => patch({ release })}
          />
          <Knob
            label="Vol"
            ariaLabel="Level"
            value={params.volume}
            min={0}
            max={1}
            format={(value) => `${Math.round(value * 100)}`}
            onChange={(volume) => patch({ volume })}
          />
        </div>
      </section>
      </div>

      <section className="chassis flex shrink-0 flex-col p-3 sm:p-4">
        <div
          className="relative h-36 touch-none select-none sm:h-48"
          onPointerDown={(event) => {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              /* synthetic pointers may refuse capture */
            }
            movePointer(event, true);
          }}
          onPointerMove={movePointer}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="flex h-full">
            {WHITE_KEYS.map((key) => {
              const midi = midiAt(key.offset);
              const on = activeSet.has(midi);
              return (
                <button
                  key={key.offset}
                  type="button"
                  data-midi={midi}
                  data-on={on ? "true" : "false"}
                  aria-label={`${noteLabel(midi)}${key.shortcut ? ` ${key.shortcut}` : ""}`}
                  aria-pressed={on}
                  className="key-white relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-b-lg pb-2"
                >
                  <span className="font-mono text-xs">{key.shortcut}</span>
                  <span className="text-xs">{key.offset % 12 === 0 ? noteLabel(midi) : ""}</span>
                </button>
              );
            })}
          </div>
          {BLACK_KEYS.map((key) => {
            const midi = midiAt(key.offset);
            const on = activeSet.has(midi);
            const index = key.afterWhite ?? 0;
            return (
              <button
                key={key.offset}
                type="button"
                data-midi={midi}
                data-on={on ? "true" : "false"}
                aria-label={`${noteLabel(midi)}${key.shortcut ? ` ${key.shortcut}` : ""}`}
                aria-pressed={on}
                className="key-black absolute top-0 z-10 flex h-3/5 flex-col items-center justify-end rounded-b-md pb-1.5"
                style={{
                  left: `${((index + 1) / WHITE_KEYS.length) * 100}%`,
                  width: `${(0.62 / WHITE_KEYS.length) * 100}%`,
                  transform: on ? "translateX(-50%) translateY(2px)" : "translateX(-50%)",
                }}
              >
                <span className="font-mono text-xs">{key.shortcut}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 font-mono text-xs text-mist">
          A S D F G H J play. W E T Y U are sharps. Brackets move octave. Space holds the pedal.
        </p>
      </section>
    </main>
  );
}

function ScopeMeter({
  engineRef,
  armed,
}: {
  engineRef: RefObject<SynthEngine | null>;
  armed: boolean;
}) {
  const lineRef = useRef<SVGPolylineElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const line = lineRef.current;
      const samples = engineRef.current?.scope() ?? [];
      if (line) {
        if (samples.length === 0) {
          line.setAttribute("points", "0,50 200,50");
        } else {
          const last = samples.length - 1;
          line.setAttribute(
            "points",
            samples
              .map((sample, index) => {
                const x = (index / last) * 200;
                const y = 50 - sample * 42;
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(" "),
          );
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engineRef]);

  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-xs tracking-widest text-mist uppercase">Scope</p>
      <div className="relative">
        <svg
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          className="h-24 w-full rounded-lg border border-line bg-ink sm:h-32"
          role="img"
          aria-label={armed ? "Oscilloscope" : "Oscilloscope standby"}
        >
          <line x1="0" y1="50" x2="200" y2="50" stroke="var(--color-line)" strokeWidth="0.6" />
          <polyline
            ref={lineRef}
            points="0,50 200,50"
            fill="none"
            stroke="var(--color-amber)"
            strokeWidth="1.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {armed ? null : (
          <span className="pointer-events-none absolute top-2 left-3 z-10 font-mono text-xs tracking-widest text-mist uppercase">
            Standby
          </span>
        )}
      </div>
    </div>
  );
}

function LevelReadout({ engineRef }: { engineRef: RefObject<SynthEngine | null> }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    let frame = 0;
    let ticks = 0;
    const tick = () => {
      ticks += 1;
      if (ticks % 3 === 0) setLevel(engineRef.current?.level() ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [engineRef]);

  const segments = 12;
  const lit = Math.round(level * segments);

  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 font-mono text-xs tracking-widest text-mist uppercase">Level</p>
      <div
        role="meter"
        aria-label="Level"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(level * 100)}
        className="flex h-24 flex-col-reverse gap-1 sm:h-32"
      >
        {Array.from({ length: segments }, (_, index) => {
          const on = index < lit;
          const hot = index >= segments - 2;
          return (
            <span
              key={index}
              className={
                on
                  ? hot
                    ? "h-1.5 w-8 rounded-sm bg-ember sm:w-10"
                    : "h-1.5 w-8 rounded-sm bg-amber sm:w-10"
                  : "h-1.5 w-8 rounded-sm bg-line sm:w-10"
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function Knob({
  label,
  ariaLabel,
  value,
  min,
  max,
  curve = "lin",
  format,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  max: number;
  curve?: "lin" | "log";
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const drag = useRef<{ y: number; t: number } | null>(null);
  const t = toUnit(value, min, max, curve);
  const angle = -140 + t * 280;

  function commit(unit: number) {
    const next = fromUnit(unit, min, max, curve);
    onChange(next);
  }

  return (
    <div className="flex w-16 flex-col items-center gap-1">
      <button
        type="button"
        role="slider"
        aria-label={ariaLabel ?? label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(3))}
        aria-valuetext={format(value)}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { y: event.clientY, t };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const delta = (drag.current.y - event.clientY) / 140;
          commit(drag.current.t + delta);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 0.1 : 0.02;
          if (event.key === "ArrowUp" || event.key === "ArrowRight") {
            event.preventDefault();
            event.stopPropagation();
            commit(t + step);
          }
          if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
            event.preventDefault();
            event.stopPropagation();
            commit(t - step);
          }
        }}
        className="relative size-12 rounded-full border-2 border-line bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber sm:size-14"
      >
        <span className="absolute inset-1" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="absolute top-0 left-1/2 h-2.5 w-1 -translate-x-1/2 rounded-full bg-amber" />
        </span>
      </button>
      <span className="font-mono text-xs text-cream tabular-nums">{format(value)}</span>
      <span className="font-mono text-xs tracking-wide text-mist uppercase">{label}</span>
    </div>
  );
}

function toUnit(value: number, min: number, max: number, curve: "lin" | "log") {
  if (max === min) return 0;
  if (curve === "log") {
    const safe = Math.min(max, Math.max(min, value));
    return Math.log(safe / min) / Math.log(max / min);
  }
  return (value - min) / (max - min);
}

function fromUnit(unit: number, min: number, max: number, curve: "lin" | "log") {
  const t = Math.min(1, Math.max(0, unit));
  if (curve === "log") return min * (max / min) ** t;
  return min + t * (max - min);
}

function formatHz(value: number) {
  if (value >= 1000) {
    const scaled = value / 1000;
    return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1)}k`;
  }
  return `${Math.round(value)}`;
}

function formatTime(value: number) {
  if (value < 0.1) return `${Math.round(value * 1000)}ms`;
  return `${value.toFixed(2)}s`;
}
