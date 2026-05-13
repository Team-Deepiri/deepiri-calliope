"""Real-time audio device I/O for live recording and playback."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Literal

import numpy as np


@dataclass
class AudioDeviceInfo:
    name: str
    index: int
    max_input_channels: int
    max_output_channels: int
    default_sample_rate: float
    is_default_input: bool
    is_default_output: bool


@dataclass
class AudioStreamConfig:
    sample_rate: int = 48000
    block_size: int = 256
    input_channels: int = 1
    output_channels: int = 2
    dtype: str = "float32"
    latency_ms: float = 10.0


class AudioDeviceError(Exception):
    pass


def list_input_devices() -> list[AudioDeviceInfo]:
    """
    List available audio input devices.
    Falls back to mock devices if sounddevice is unavailable.
    """
    try:
        import sounddevice as sd
        
        devices = sd.query_devices()
        if isinstance(devices, dict):
            devices = [devices]
        
        inputs = []
        for i, dev in enumerate(devices):
            if dev.get("max_input_channels", 0) > 0:
                inputs.append(AudioDeviceInfo(
                    name=dev.get("name", f"Device {i}"),
                    index=i,
                    max_input_channels=dev.get("max_input_channels", 0),
                    max_output_channels=dev.get("max_output_channels", 0),
                    default_sample_rate=dev.get("default_samplerate", 44100.0),
                    is_default_input=dev.get("default_input", False),
                    is_default_output=dev.get("default_output", False),
                ))
        return inputs
    except ImportError:
        return [
            AudioDeviceInfo(
                name="Default Microphone",
                index=0,
                max_input_channels=2,
                max_output_channels=0,
                default_sample_rate=48000.0,
                is_default_input=True,
                is_default_output=False,
            ),
        ]


def list_output_devices() -> list[AudioDeviceInfo]:
    """List available audio output devices."""
    try:
        import sounddevice as sd
        
        devices = sd.query_devices()
        if isinstance(devices, dict):
            devices = [devices]
        
        outputs = []
        for i, dev in enumerate(devices):
            if dev.get("max_output_channels", 0) > 0:
                outputs.append(AudioDeviceInfo(
                    name=dev.get("name", f"Device {i}"),
                    index=i,
                    max_input_channels=dev.get("max_input_channels", 0),
                    max_output_channels=dev.get("max_output_channels", 0),
                    default_sample_rate=dev.get("default_samplerate", 44100.0),
                    is_default_input=dev.get("default_input", False),
                    is_default_output=dev.get("default_output", False),
                ))
        return outputs
    except ImportError:
        return [
            AudioDeviceInfo(
                name="Default Speaker",
                index=0,
                max_input_channels=0,
                max_output_channels=2,
                default_sample_rate=48000.0,
                is_default_input=False,
                is_default_output=True,
            ),
        ]


class AudioStreamCallback:
    """Callback interface for real-time audio processing."""
    
    def on_audio(self, indata: np.ndarray, outdata: np.ndarray, time_info: dict) -> None:
        """Called for each audio block. Modify outdata in-place."""
        pass
    
    def on_overflow(self) -> None:
        """Called when audio callback falls behind."""
        pass


class RealTimeAudioStream:
    """
    Real-time audio stream for live recording/playback.
    Uses sounddevice if available, otherwise provides mock interface.
    """
    
    def __init__(self, config: AudioStreamConfig):
        self.config = config
        self._stream = None
        self._callback: AudioStreamCallback | None = None
        self._is_running = False
        self._input_buffer: list[np.ndarray] = []
        self._output_buffer: list[np.ndarray] = []
    
    def set_callback(self, callback: AudioStreamCallback) -> None:
        self._callback = callback
    
    def start(self) -> None:
        """Start the audio stream."""
        try:
            import sounddevice as sd
            
            def callback(indata, outdata, frames, time_info, status):
                if status:
                    print(f"Audio status: {status}")
                
                if self._callback:
                    self._callback.on_audio(indata, outdata, {
                        "current_time": time_info.current_time if hasattr(time_info, "current_time") else 0.0,
                    })
                else:
                    if len(indata) > 0:
                        outdata[:] = indata
                
                self._input_buffer.append(indata.copy())
                if len(self._input_buffer) > 100:
                    self._input_buffer.pop(0)
            
            self._stream = sd.Stream(
                samplerate=self.config.sample_rate,
                blocksize=self.config.block_size,
                device=None,
                channels=(self.config.input_channels, self.config.output_channels),
                dtype=self.config.dtype,
                latency=self.config.latency_ms / 1000.0,
                callback=callback,
            )
            self._stream.start()
            self._is_running = True
            
        except ImportError:
            print("sounddevice not available - running in mock mode")
            self._is_running = True
        except Exception as e:
            raise AudioDeviceError(f"Failed to start audio stream: {e}")
    
    def stop(self) -> None:
        """Stop the audio stream."""
        if self._stream:
            self._stream.stop()
            self._stream.close()
            self._stream = None
        self._is_running = False
    
    @property
    def is_running(self) -> bool:
        return self._is_running
    
    def get_input_level(self) -> float:
        """Get current input level in dB."""
        if not self._input_buffer:
            return -60.0
        
        latest = self._input_buffer[-1]
        if latest.size == 0:
            return -60.0
        
        rms = np.sqrt(np.mean(latest**2))
        if rms < 1e-9:
            return -60.0
        
        return 20.0 * np.log10(rms)
    
    def get_recorded_samples(self) -> np.ndarray | None:
        """Get all recorded samples."""
        if not self._input_buffer:
            return None
        
        return np.concatenate(self._input_buffer, axis=0)


class AudioLevelMeter:
    """Real-time audio level meter."""
    
    def __init__(self, decay_rate: float = 0.95):
        self._peak = 0.0
        self._decay_rate = decay_rate
        self._rms_history: list[float] = []
    
    def process(self, samples: np.ndarray) -> tuple[float, float]:
        """
        Process audio samples and return (rms_level, peak_level) in dB.
        """
        if samples.size == 0:
            return -60.0, -60.0
        
        rms = np.sqrt(np.mean(samples**2))
        peak = np.max(np.abs(samples))
        
        rms_db = -60.0 if rms < 1e-9 else 20.0 * np.log10(rms)
        peak_db = -60.0 if peak < 1e-9 else 20.0 * np.log10(peak)
        
        self._peak = max(peak, self._peak * self._decay_rate)
        
        self._rms_history.append(rms_db)
        if len(self._rms_history) > 50:
            self._rms_history.pop(0)
        
        return rms_db, peak_db
    
    def get_rms_smoothed(self) -> float:
        """Get smoothed RMS level."""
        if not self._rms_history:
            return -60.0
        return np.mean(self._rms_history)
    
    def reset(self) -> None:
        self._peak = 0.0
        self._rms_history.clear()


class AudioBuffer:
    """Circular audio buffer for real-time processing."""
    
    def __init__(self, max_samples: int = 48000 * 10):
        self.max_samples = max_samples
        self._buffer = np.zeros(max_samples, dtype=np.float64)
        self._write_pos = 0
        self._read_pos = 0
        self._count = 0
    
    def write(self, samples: np.ndarray) -> int:
        """Write samples to buffer. Returns number of samples written."""
        samples = np.asarray(samples, dtype=np.float64).ravel()
        n = min(len(samples), self.max_samples)
        
        for i in range(n):
            self._buffer[self._write_pos] = samples[i]
            self._write_pos = (self._write_pos + 1) % self.max_samples
            
            if self._count < self.max_samples:
                self._count += 1
            else:
                self._read_pos = (self._read_pos + 1) % self.max_samples
        
        return n
    
    def read(self, n: int) -> np.ndarray:
        """Read n samples from buffer."""
        n = min(n, self._count)
        result = np.zeros(n, dtype=np.float64)
        
        for i in range(n):
            pos = (self._read_pos + i) % self.max_samples
            result[i] = self._buffer[pos]
        
        self._read_pos = (self._read_pos + n) % self.max_samples
        self._count -= n
        
        return result
    
    @property
    def available_samples(self) -> int:
        return self._count
    
    def clear(self) -> None:
        self._write_pos = 0
        self._read_pos = 0
        self._count = 0


def connect_to_aggregator(
    host: str = "localhost",
    port: int = 8000,
    sample_rate: int = 48000,
) -> dict:
    """
    Connect to an audio aggregator service for distributed processing.
    Returns connection info.
    """
    return {
        "host": host,
        "port": port,
        "sample_rate": sample_rate,
        "protocol": "websocket",
        "buffer_size": 1024,
    }


def get_default_device_names() -> tuple[str | None, str | None]:
    """Get default input/output device names."""
    try:
        import sounddevice as sd
        default_input = sd.query_devices(kind="input")
        default_output = sd.query_devices(kind="output")
        return (
            default_input.get("name") if default_input else None,
            default_output.get("name") if default_output else None,
        )
    except Exception:
        return None, None