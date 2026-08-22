# Orchestra MIDI — Gestures / Baton

Baton plays **MIDI only** (`.mid`). Files are listed in `manifest.json`.

## Scores

| File | Label | Notes |
|------|--------|--------|
| `moonlight1.mid` | Moonlight I | Mutopia — Beethoven Op. 27 No. 2 |
| `moonlight2.mid` | Moonlight II | Mutopia |
| `moonlight3.mid` | Moonlight III | Mutopia |
| `cornfield-chase.mid` | Cornfield Chase | Interstellar — via Nonstop2k |
| `no-time-for-caution.mid` | No Time for Caution | Interstellar — via Contrebombarde |
| `time-inception.mid` | Time (Inception) | via Nonstop2k |
| `The_Landing_from_First_Man.mid` | The Landing (First Man) | Justin Hurwitz — MIDI from public audio (prototype only) |
| `Can_You_Hear_The_Music.mid` | Can You Hear The Music | Oppenheimer — [Online Sequencer #3591131](https://onlinesequencer.net/3591131); playback uses `timeScale: 3` (export was ~400 BPM / too fast) |
| `star-wars.mid` | Star Wars | via SynthesiaManiac |

**Parked (not in picker):** `mission-impossible.mid` — dense drum/bass bed buries the melody with current playback.

Baton maps GM programs to FluidR3 soundfonts (sampled grand for acoustic piano; orchestral percussion for drum tracks).

## Sources / attribution

### Moonlight (Mutopia)

- Piece page: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=276  
- MIDI zip: https://www.mutopiaproject.org/ftp/BeethovenLv/O27/moonlight/moonlight-mids.zip  
- License: [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/)  
- Typeset / maintained by Stewart Holmes (LilyPond)

### Film themes

- Interstellar / Inception MIDI: Nonstop2k  
- No Time for Caution MIDI: Contrebombarde  
- Star Wars MIDI: SynthesiaManiac  
- Mission Impossible MIDI (parked): SynthesiaManiac  
- The Landing (First Man): Justin Hurwitz — MIDI transcribed from a public performance for internal prototyping only; not cleared for redistribution  
- Can You Hear The Music (Oppenheimer): Ludwig Göransson — sequence from [Online Sequencer #3591131](https://onlinesequencer.net/3591131); prototype use only

Redistribute only if your use complies with each source’s terms. Prefer Mutopia / clearly licensed MIDI when shipping broadly.

## URLs (Vite)

Files under `/gestures/orchestra/…` as listed in `manifest.json`.
