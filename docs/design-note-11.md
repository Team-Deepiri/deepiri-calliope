# Design Note 11 — Performance & Optimization

## Real-Time Audio Processing Constraints

The audio engine must complete all processing within the buffer duration to avoid dropouts (xruns).

### Timing Budgets (at 48kHz)
| Buffer Size | Duration | Max Processing Time |
|-------------|----------|-------------------|
| 32 samples | 0.67ms | 0.5ms (75% headroom) |
| 64 samples | 1.33ms | 1.0ms |
| 128 samples | 2.67ms | 2.0ms |
| 256 samples | 5.33ms | 4.0ms |
| 512 samples | 10.67ms | 8.0ms |
| 1024 samples | 21.33ms | 16.0ms |

### Real-Time Safe Operations
- Pre-allocated DSP buffers (no malloc/free in audio thread)
- Lock-free data structures for parameter updates
- All plugin processing completes within budget
- AI inference runs on separate thread with result buffering

### Unsafe Operations (blocking)
- File I/O (reading/writing audio files)
- Memory allocation
- Network requests
- AI model inference
- GUI updates

These are handled by the non-real-time thread pool and communicated to the audio thread via lock-free queues.

## Disk Streaming for Large Projects

For projects exceeding available RAM, audio clips are streamed from disk.

### Streaming Architecture
- **Read-ahead cache**: Pre-reads upcoming clip regions 2 seconds ahead
- **Page size**: 64KB aligned blocks for efficient disk access
- **Cache policy**: LRU eviction, keep active clips in RAM
- **Priority**: Current play position > upcoming > recent past
- **Compression**: Optional FLAC compression for storage savings (decompressed on read)

### Requirements
- SSD recommended (minimum 100MB/s sustained read)
- HDD support with larger cache (512MB minimum)
- Network storage: Pre-cache entire project before playback

## GPU Acceleration for AI Models

### Current GPU Usage
- **PyTorch inference**: Vocal synthesis, neural processing
- **ONNX Runtime**: Aamati mood classification
- **CUDA/TensorRT**: Available for supported models

### Target GPU Pipeline
| Model Type | Current | Target (Q4 2026) |
|------------|---------|------------------|
| Vocal Synthesis | CPU | CUDA/TensorRT |
| Stem Separation | CPU | CUDA |
| Pitch Detection | CPU | CUDA |
| Audio Generation | N/A | GPU (future) |

### Memory Management
- GPU model weights loaded on demand
- Context caching for rapid switching between models
- Mixed precision (FP16) inference for 2x throughput
- Batch processing for offline generation

## Memory Management Strategies

### Audio Buffer Pool
- Pre-allocated ring buffer per track (16 seconds at 48kHz = 1.5MB per track)
- Double-buffered for streaming
- Zero-copy clip slicing (reference existing buffer regions)

### Cache Hierarchy
1. **L1**: Active clip buffers (RAM, < 100ms latency target)
2. **L2**: Disk cache for recent clips (SSD, ~1ms latency target)
3. **L3**: Project media files (HDD/network, ~10ms latency)

### Garbage Collection
- Python objects: GC runs between generation requests, not during playback
- Audio buffers: Reference-counted, freed when no clip references remain
- Plugin instances: Lazy-loaded, cached until project close
- Undo history: Depth-limited (default 100 steps), item-sized capped
