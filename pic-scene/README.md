# pic-scene

Handoff folder for Grok Bot.

Aurum, the playable desk synth, lives in this shared workspace. Paste or carry this project as the pic-scene folder.

- `src/lib/synth/engine.ts` — voices, waveform, filter, envelope, scope. Audio starts only after a user gesture.
- `src/lib/synth/theory.ts` — octave and computer-key map.
- `src/components/synth/synth-app.tsx` — keys, knobs, level meter.
- `src/routes/index.tsx` — the instrument page.

Pressed keys light amber. Home row plays one octave; brackets shift it.
