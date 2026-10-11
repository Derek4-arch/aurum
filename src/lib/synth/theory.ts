export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Semitone offset from the octave root, for the home-row piano. */
export const KEY_MAP: Record<string, number> = {
  KeyA: 0,
  KeyW: 1,
  KeyS: 2,
  KeyE: 3,
  KeyD: 4,
  KeyF: 5,
  KeyT: 6,
  KeyG: 7,
  KeyY: 8,
  KeyH: 9,
  KeyU: 10,
  KeyJ: 11,
  KeyK: 12,
  KeyZ: 0,
  KeyX: 2,
  KeyC: 4,
  KeyV: 5,
  KeyB: 7,
  KeyN: 9,
  KeyM: 11,
};

export const SHORTCUT_LABEL: Record<number, string> = {
  0: "A",
  1: "W",
  2: "S",
  3: "E",
  4: "D",
  5: "F",
  6: "T",
  7: "G",
  8: "Y",
  9: "H",
  10: "U",
  11: "J",
  12: "K",
};

export const KEY_SPAN = 12;

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);

export type PianoKey = {
  offset: number;
  name: string;
  white: boolean;
  shortcut?: string;
  /** White-key index this black key sits after. */
  afterWhite?: number;
};

export function buildKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  let whiteIndex = -1;
  for (let offset = 0; offset <= KEY_SPAN; offset += 1) {
    const pc = offset % 12;
    const white = WHITE_PC.has(pc);
    if (white) whiteIndex += 1;
    keys.push({
      offset,
      name: NOTE_NAMES[pc] ?? "C",
      white,
      shortcut: SHORTCUT_LABEL[offset],
      afterWhite: white ? undefined : whiteIndex,
    });
  }
  return keys;
}

export const PIANO_KEYS = buildKeys();

export function midiFor(octave: number, offset: number) {
  return 12 * (octave + 1) + offset;
}

export function noteLabel(midi: number) {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[pc]}${oct}`;
}

export function clampMidi(midi: number) {
  return Math.min(127, Math.max(0, midi));
}

export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 6;
