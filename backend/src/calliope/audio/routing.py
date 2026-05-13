"""Advanced routing matrix for complex signal chains."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal

import numpy as np


class RoutingMode(str, Enum):
    SERIAL = "serial"
    PARALLEL = "parallel"
    MATRIX = "matrix"
    SEND_RETURN = "send_return"


@dataclass
class RoutingNode:
    id: str
    name: str
    node_type: Literal["input", "output", "process", "aux"]
    inputs: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)
    gain: float = 1.0
    pan: float = 0.0
    mute: bool = False
    solo: bool = False


@dataclass
class RoutingConnection:
    from_node: str
    to_node: str
    gain: float = 1.0
    pan: float = 0.0
    muted: bool = False


class RoutingMatrix:
    """
    Advanced routing matrix for complex signal chains.
    Supports serial, parallel, and matrix routing with sends.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._nodes: dict[str, RoutingNode] = {}
        self._connections: list[RoutingConnection] = []
        self._buffers: dict[str, np.ndarray] = {}
        self._solo_active = False

    def add_node(
        self,
        node_id: str,
        name: str,
        node_type: Literal["input", "output", "process", "aux"],
    ) -> RoutingNode:
        """Add a routing node."""
        node = RoutingNode(id=node_id, name=name, node_type=node_type)
        self._nodes[node_id] = node
        return node

    def connect(
        self,
        from_id: str,
        to_id: str,
        gain: float = 1.0,
        pan: float = 0.0,
    ) -> RoutingConnection:
        """Create a connection between nodes."""
        if from_id not in self._nodes or to_id not in self._nodes:
            raise ValueError("Node not found")

        conn = RoutingConnection(from_node=from_id, to_node=to_id, gain=gain, pan=pan)
        self._connections.append(conn)

        self._nodes[from_id].outputs.append(to_id)
        self._nodes[to_id].inputs.append(from_id)

        return conn

    def disconnect(self, from_id: str, to_id: str) -> bool:
        """Remove a connection."""
        self._connections = [
            c for c in self._connections
            if not (c.from_node == from_id and c.to_node == to_id)
        ]
        return True

    def set_node_gain(self, node_id: str, gain: float) -> None:
        """Set node gain."""
        if node_id in self._nodes:
            self._nodes[node_id].gain = np.clip(gain, 0.0, 2.0)

    def set_node_pan(self, node_id: str, pan: float) -> None:
        """Set node pan (-1 to 1)."""
        if node_id in self._nodes:
            self._nodes[node_id].pan = np.clip(pan, -1.0, 1.0)

    def toggle_mute(self, node_id: str) -> bool:
        """Toggle node mute."""
        if node_id in self._nodes:
            self._nodes[node_id].mute = not self._nodes[node_id].mute
            return self._nodes[node_id].mute
        return False

    def toggle_solo(self, node_id: str) -> bool:
        """Toggle node solo."""
        if node_id in self._nodes:
            self._nodes[node_id].solo = not self._nodes[node_id].solo

            self._solo_active = any(n.solo for n in self._nodes.values())

            return self._nodes[node_id].solo
        return False

    def process(
        self,
        inputs: dict[str, np.ndarray],
        processors: dict[str, Callable[[np.ndarray], np.ndarray]],
    ) -> dict[str, np.ndarray]:
        """Process audio through the routing matrix."""
        for node_id, node in self._nodes.items():
            if node.node_type == "input" and node_id in inputs:
                self._buffers[node_id] = inputs[node_id].copy()
            else:
                self._buffers[node_id] = np.zeros(max(len(v) for v in inputs.values()) if inputs else 1024)

        for conn in self._connections:
            if conn.muted:
                continue

            from_node = self._nodes.get(conn.from_node)
            to_node = self._nodes.get(conn.to_node)

            if not from_node or not to_node:
                continue

            if from_node.mute or (self._solo_active and not from_node.solo):
                continue

            source = self._buffers.get(conn.from_node, np.zeros(1024))
            dest = self._buffers.get(conn.to_node, np.zeros_like(source))

            if len(source) > len(dest):
                dest = np.pad(dest, (0, len(source) - len(dest)))
            elif len(source) < len(dest):
                source = np.pad(source, (0, len(dest) - len(source)))

            if to_node.node_type == "process" and to_node.id in processors:
                processed = processors[to_node.id](source * conn.gain * from_node.gain)
                dest = dest + processed
            else:
                dest = dest + source * conn.gain * from_node.gain

            self._buffers[conn.to_node] = dest

        outputs = {}
        for node_id, node in self._nodes.items():
            if node.node_type == "output":
                buf = self._buffers.get(node_id, np.zeros(1024))
                if node.mute or (self._solo_active and not node.solo):
                    buf = np.zeros_like(buf)
                outputs[node_id] = buf * node.gain

        return outputs

    def get_signal_flow(self) -> list[tuple[str, str]]:
        """Get current signal flow as list of connections."""
        return [(c.from_node, c.to_node) for c in self._connections if not c.muted]

    def clear(self) -> None:
        """Clear all nodes and connections."""
        self._nodes.clear()
        self._connections.clear()
        self._buffers.clear()


class SendReturnSystem:
    """
    Send/return system for parallel effect chains.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._sends: dict[str, np.ndarray] = {}
        self._returns: dict[str, np.ndarray] = {}
        self._processors: dict[str, Callable[[np.ndarray], np.ndarray]] = {}
        self._levels: dict[str, float] = {}
        self._active = False

    def add_send(
        self,
        send_id: str,
        processor: Callable[[np.ndarray], np.ndarray],
        level: float = 0.5,
    ) -> None:
        """Add a send bus."""
        self._sends[send_id] = np.zeros(1024)
        self._processors[send_id] = processor
        self._levels[send_id] = level
        self._active = True

    def send(self, audio: np.ndarray, send_ids: list[str], pre_level: float = 0.5) -> None:
        """Send audio to send buses."""
        for send_id in send_ids:
            if send_id in self._sends:
                self._sends[send_id] = audio * pre_level * self._levels.get(send_id, 0.5)

    def process(self, audio: np.ndarray, send_ids: list[str]) -> np.ndarray:
        """Process audio through send/return chain."""
        self.send(audio, send_ids)

        result = audio.copy()

        for send_id in send_ids:
            if send_id in self._sends and send_id in self._processors:
                processed = self._processors[send_id](self._sends[send_id])
                result = result + processed * self._levels.get(send_id, 0.5)

        return result.astype(np.float64)

    def set_level(self, send_id: str, level: float) -> None:
        """Set send/return level."""
        self._levels[send_id] = np.clip(level, 0.0, 1.0)

    def remove_send(self, send_id: str) -> None:
        """Remove a send bus."""
        self._sends.pop(send_id, None)
        self._processors.pop(send_id, None)
        self._levels.pop(send_id, None)
        if not self._sends:
            self._active = False


class ParallelProcessor:
    """
    Parallel processor with crossfade/blend between paths.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._paths: dict[str, Callable[[np.ndarray], np.ndarray]] = {}
        self._levels: dict[str, float] = {}
        self._pans: dict[str, float] = {}

    def add_path(
        self,
        path_id: str,
        processor: Callable[[np.ndarray], np.ndarray],
        level: float = 1.0,
        pan: float = 0.0,
    ) -> None:
        """Add a parallel processing path."""
        self._paths[path_id] = processor
        self._levels[path_id] = level
        self._pans[path_id] = pan

    def process(
        self,
        audio: np.ndarray,
        output_mode: Literal["sum", "stereo", "multi"] = "sum",
    ) -> np.ndarray | tuple[np.ndarray, np.ndarray] | dict[str, np.ndarray]:
        """Process through all parallel paths."""
        audio = np.asarray(audio, dtype=np.float64).ravel()

        if output_mode == "sum":
            result = np.zeros_like(audio)
            for path_id, processor in self._paths.items():
                processed = processor(audio)
                level = self._levels.get(path_id, 1.0)
                result += processed * level
            return result / max(len(self._paths), 1)

        elif output_mode == "stereo":
            left = np.zeros_like(audio)
            right = np.zeros_like(audio)
            for path_id, processor in self._paths.items():
                processed = processor(audio)
                level = self._levels.get(path_id, 1.0)
                pan = self._pans.get(path_id, 0.0)
                left_gain = max(0, 0.5 - pan * 0.5)
                right_gain = max(0, 0.5 + pan * 0.5)
                left += processed * level * left_gain
                right += processed * level * right_gain
            return left.astype(np.float64), right.astype(np.float64)

        else:
            results = {}
            for path_id, processor in self._paths.items():
                processed = processor(audio)
                level = self._levels.get(path_id, 1.0)
                results[path_id] = (processed * level).astype(np.float64)
            return results

    def set_level(self, path_id: str, level: float) -> None:
        """Set path level."""
        self._levels[path_id] = np.clip(level, 0.0, 1.0)

    def set_pan(self, path_id: str, pan: float) -> None:
        """Set path pan."""
        self._pans[path_id] = np.clip(pan, -1.0, 1.0)


class SidechainMatrix:
    """
    Sidechain routing with multiple key inputs.
    """

    def __init__(self, sr: int = 48000):
        self.sr = sr
        self._key_inputs: dict[str, np.ndarray] = {}
        self._processors: dict[str, Callable[[np.ndarray, np.ndarray], np.ndarray]] = {}

    def add_key(
        self,
        key_id: str,
        processor: Callable[[np.ndarray, np.ndarray], np.ndarray],
    ) -> None:
        """Add sidechain key input."""
        self._key_inputs[key_id] = np.zeros(1024)
        self._processors[key_id] = processor

    def set_key(self, key_id: str, audio: np.ndarray) -> None:
        """Set key audio."""
        self._key_inputs[key_id] = np.asarray(audio, dtype=np.float64).ravel()

    def process(
        self,
        audio: np.ndarray,
        key_id: str,
    ) -> np.ndarray:
        """Process with sidechain key."""
        audio = np.asarray(audio, dtype=np.float64).ravel()

        if key_id not in self._processors:
            return audio

        key_audio = self._key_inputs.get(key_id, np.zeros_like(audio))

        if len(key_audio) < len(audio):
            key_audio = np.pad(key_audio, (0, len(audio) - len(key_audio)))
        elif len(key_audio) > len(audio):
            key_audio = key_audio[:len(audio)]

        return self._processors[key_id](audio, key_audio).astype(np.float64)


from typing import Callable