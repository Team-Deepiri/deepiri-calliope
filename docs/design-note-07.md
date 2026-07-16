# Design Note 07 — AI Music Generation Pipeline

## Multi-Stage Generation Workflow

The AI generation pipeline follows a hierarchical decomposition approach:

```
Stage 1: Prompt Analysis (LLM)
  -> Genre, mood, tempo, key, structure, instrumentation
Stage 2: Structural Planning (HarmonyEngine + LLM)
  -> Section map, chord progressions, dynamic envelopes
Stage 3: Content Generation (Music models)
  -> Melody, bassline, chord voicings, drum patterns, vocal lines
Stage 4: Arrangement (Conductor)
  -> Multi-track arrangement with spatial positioning
Stage 5: Mixing & Mastering (AIMixEngine)
  -> Level balance, EQ, compression, limiting, stereo enhancement
```

### Stage 1 — Prompt Analysis
The input prompt is processed by the LLM router (supports Ollama, OpenAI, Anthropic, OpenRouter, Gemini). The response is parsed into structured generation parameters:
- Genre (with sub-genre confidence)
- Mood/emotional quality (mapped to Aamati ontology)
- Estimated BPM range
- Key and scale suggestions
- Structural hints (section types, repeats)

### Stage 2 — Structural Planning
The HarmonyEngine generates chord progressions based on the analyzed mood and key. The LLM can override or suggest specific progressions. Sections are planned with intro/verse/chorus/bridge/outro structure.

### Stage 3 — Content Generation
- **MelodyGenerator**: Markov chain-based monophonic melody generation constrained to the current scale and chord tones
- **DrumMachine**: Euclidean rhythm generation with configurable density and swing
- **Synthesizer**: Parameterized synthesis based on genre profiles
- **AIVocalSynthesizer**: Neural vocal synthesis with configurable timbre and expression

### Stage 4 — Arrangement
The Conductor class orchestrates all generated content into a multi-track arrangement. Audio routing is managed through AudioGraph for parallel processing.

### Stage 5 — Mixing & Mastering
Final polish via AIMixEngine — leveling, EQ, compression, stereo enhancement, and loudness normalization.

## Integration with LLM Providers

The provider router supports:
- **Ollama**: Local, private inference with open-weight models
- **OpenAI**: GPT-4o-mini and GPT-4o for high-quality analysis
- **Anthropic**: Claude 3.5 Haiku/Sonnet for nuanced musical reasoning
- **OpenRouter**: Unified API for multiple model providers
- **Gemini**: Google's Gemini models

Provider selection is automatic based on availability and task complexity.

## Aamati Groove/Mood Ontology Integration

The Aamati tree provides structured emotional/mood tags that map to generation parameters. Each mood has associated feature targets (tempo range, energy level, timbral brightness, rhythmic complexity). The ranking system selects the best-fitting mood cluster for the prompt.

## Stem-Based Generation vs Full Mix

Two modes:
- **Stem-based**: Generate individual stems (drums, bass, harmony, melody, vocals) as separate audio files for flexible mixing
- **Full mix**: Generate final stereo mix through automatic arrangement and mastering

Stem mode provides maximum creative control. Full mix mode is optimized for rapid prototyping and export.
