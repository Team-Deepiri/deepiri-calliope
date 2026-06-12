"""Node-based audio routing and processing graph with send/return, bus, VCA, sidechain."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field, asdict
from uuid import uuid4
from typing import Dict, List, Optional, Protocol, Any, Callable


class AudioNode(Protocol):
    id: str
    def process(self, inputs: List[np.ndarray]) -> np.ndarray: ...


@dataclass
class AudioGraph:
    nodes: Dict[str, AudioNode] = field(default_factory=dict)
    edges: List[tuple[str, str]] = field(default_factory=list)
    sample_rate: int = 48000
    busses: Dict[str, BusNode] = field(default_factory=dict)
    sends: Dict[str, SendNode] = field(default_factory=dict)
    vca_groups: Dict[str, VCAGroup] = field(default_factory=dict)
    vca_assignments: Dict[str, str] = field(default_factory=dict)
    sidechains: Dict[str, str] = field(default_factory=dict)

    def add_node(self, node: AudioNode) -> str:
        self.nodes[node.id] = node
        return node.id

    def remove_node(self, node_id: str) -> None:
        self.nodes.pop(node_id, None)
        self.edges = [(u, v) for u, v in self.edges if u != node_id and v != node_id]
        self.sidechains = {k: v for k, v in self.sidechains.items() if k != node_id and v != node_id}

    def connect(self, from_id: str, to_id: str) -> None:
        if from_id in self.nodes and to_id in self.nodes:
            if (from_id, to_id) not in self.edges:
                self.edges.append((from_id, to_id))

    def disconnect(self, from_id: str, to_id: str) -> None:
        self.edges = [(u, v) for u, v in self.edges if not (u == from_id and v == to_id)]

    def add_bus(self, bus: BusNode) -> str:
        self.busses[bus.id] = bus
        self.nodes[bus.id] = bus
        return bus.id

    def remove_bus(self, bus_id: str) -> None:
        self.busses.pop(bus_id, None)
        self.remove_node(bus_id)

    def add_send(self, send: SendNode) -> str:
        self.sends[send.id] = send
        self.nodes[send.id] = send
        return send.id

    def remove_send(self, send_id: str) -> None:
        self.sends.pop(send_id, None)
        self.remove_node(send_id)

    def add_vca_group(self, vca: VCAGroup) -> str:
        self.vca_groups[vca.id] = vca
        return vca.id

    def remove_vca_group(self, vca_id: str) -> None:
        self.vca_groups.pop(vca_id, None)
        to_remove = [tid for tid, vid in self.vca_assignments.items() if vid == vca_id]
        for tid in to_remove:
            del self.vca_assignments[tid]

    def assign_to_vca(self, track_id: str, vca_id: str) -> None:
        if vca_id in self.vca_groups:
            self.vca_assignments[track_id] = vca_id

    def unassign_from_vca(self, track_id: str) -> None:
        self.vca_assignments.pop(track_id, None)

    def set_sidechain(self, target_id: str, source_id: str) -> None:
        if target_id in self.nodes and source_id in self.nodes:
            self.sidechains[target_id] = source_id

    def remove_sidechain(self, target_id: str) -> None:
        self.sidechains.pop(target_id, None)

    def get_vca_volume(self, track_id: str) -> float:
        vca_id = self.vca_assignments.get(track_id)
        if vca_id and vca_id in self.vca_groups:
            return self.vca_groups[vca_id].volume
        return 1.0

    def get_execution_order(self) -> List[str]:
        in_degree = {node_id: 0 for node_id in self.nodes}
        for u, v in self.edges:
            in_degree[v] = in_degree.get(v, 0) + 1

        queue = [n for n in self.nodes if in_degree.get(n, 0) == 0]
        order = []

        while queue:
            u = queue.pop(0)
            order.append(u)
            for start, end in self.edges:
                if start == u:
                    in_degree[end] = in_degree.get(end, 0) - 1
                    if in_degree[end] == 0:
                        queue.append(end)

        return order

    def render(self, duration_sec: float) -> np.ndarray:
        order = self.get_execution_order()
        node_outputs: Dict[str, np.ndarray] = {}

        n_samples = int(duration_sec * self.sample_rate)

        for node_id in order:
            node = self.nodes.get(node_id)
            if node is None:
                continue

            inputs = []
            sc_inputs = []

            for start, end in self.edges:
                if end == node_id:
                    inputs.append(node_outputs.get(start, np.zeros(n_samples)))

            sc_source = self.sidechains.get(node_id)
            if sc_source and sc_source in node_outputs:
                sc_inputs.append(node_outputs[sc_source])

            if hasattr(node, 'set_sidechain_input') and sc_inputs:
                node.set_sidechain_input(np.sum(sc_inputs, axis=0))

            node_outputs[node_id] = node.process(inputs)

        terminal_nodes = [n for n in self.nodes if not any(edge[0] == n for edge in self.edges)]
        if not terminal_nodes:
            return np.zeros(n_samples)

        final_output = np.zeros_like(node_outputs.get(terminal_nodes[0], np.zeros(n_samples)))
        for node_id in terminal_nodes:
            if node_id in node_outputs:
                final_output += node_outputs[node_id]

        return final_output

    def to_dict(self) -> dict:
        node_data = {}
        for nid, node in self.nodes.items():
            if isinstance(node, SourceNode):
                node_data[nid] = {"id": nid, "type": "source", "name": node.name}
            elif isinstance(node, EffectNode):
                node_data[nid] = {"id": nid, "type": "effect", "name": node.name}
            elif isinstance(node, BusNode):
                node_data[nid] = {"id": nid, "type": "bus", "name": node.name}
            elif isinstance(node, SendNode):
                node_data[nid] = {"id": nid, "type": "send", "name": node.name, "level": node.level}
            elif isinstance(node, OutputNode):
                node_data[nid] = {"id": nid, "type": "output", "name": node.name}

        return {
            "nodes": node_data,
            "edges": [{"from": u, "to": v} for u, v in self.edges],
            "busses": {bid: {"id": bid, "name": b.name, "volume": b.volume} for bid, b in self.busses.items()},
            "sends": {sid: {"id": sid, "name": s.name, "level": s.level, "source": s.source_id, "destination": s.destination_id} for sid, s in self.sends.items()},
            "vca_groups": {vid: {"id": vid, "name": v.name, "volume": v.volume} for vid, v in self.vca_groups.items()},
            "vca_assignments": dict(self.vca_assignments),
            "sidechains": dict(self.sidechains),
            "sample_rate": self.sample_rate,
        }

    @classmethod
    def from_dict(cls, data: dict) -> AudioGraph:
        graph = cls(sample_rate=data.get("sample_rate", 48000))
        for nid, ndata in data.get("nodes", {}).items():
            ntype = ndata.get("type")
            if ntype == "source":
                graph.nodes[nid] = SourceNode(id=nid, name=ndata.get("name", "Source"))
            elif ntype == "effect":
                graph.nodes[nid] = EffectNode(id=nid, name=ndata.get("name", "Effect"))
            elif ntype == "bus":
                bus = BusNode(id=nid, name=ndata.get("name", "Bus"))
                graph.busses[nid] = bus
                graph.nodes[nid] = bus
            elif ntype == "send":
                send = SendNode(id=nid, name=ndata.get("name", "Send"), level=ndata.get("level", 0.5))
                graph.sends[nid] = send
                graph.nodes[nid] = send

        graph.edges = [(e["from"], e["to"]) for e in data.get("edges", [])]
        graph.vca_groups = {vid: VCAGroup(id=vid, name=d["name"], volume=d.get("volume", 1.0)) for vid, d in data.get("vca_groups", {}).items()}
        graph.vca_assignments = dict(data.get("vca_assignments", {}))
        graph.sidechains = dict(data.get("sidechains", {}))
        return graph


class SourceNode:
    def __init__(self, generator_func: Optional[Callable] = None, id: Optional[str] = None, name: str = "Source"):
        self.id = id or str(uuid4())
        self.name = name
        self.generator = generator_func or (lambda: np.zeros(1))

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        return self.generator()


class EffectNode:
    def __init__(self, processor_func: Optional[Callable] = None, id: Optional[str] = None, name: str = "Effect"):
        self.id = id or str(uuid4())
        self.name = name
        self.processor = processor_func or (lambda x: x)
        self._sidechain_input: Optional[np.ndarray] = None

    def set_sidechain_input(self, signal: np.ndarray) -> None:
        self._sidechain_input = signal

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        if not inputs:
            return np.zeros(1)
        mixed = np.sum(inputs, axis=0)
        return self.processor(mixed)


class BusNode:
    def __init__(self, id: Optional[str] = None, name: str = "Bus", volume: float = 1.0):
        self.id = id or str(uuid4())
        self.name = name
        self.volume = volume

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        if not inputs:
            return np.zeros(1)
        return np.sum(inputs, axis=0) * self.volume


class SendNode:
    def __init__(self, id: Optional[str] = None, name: str = "Send", level: float = 0.5, source_id: str = "", destination_id: str = ""):
        self.id = id or str(uuid4())
        self.name = name
        self.level = level
        self.source_id = source_id
        self.destination_id = destination_id

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        if not inputs:
            return np.zeros(1)
        return np.sum(inputs, axis=0) * self.level


class OutputNode:
    def __init__(self, id: Optional[str] = None, name: str = "Master"):
        self.id = id or str(uuid4())
        self.name = name

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        if not inputs:
            return np.zeros(1)
        return np.sum(inputs, axis=0)


class VCAGroup:
    def __init__(self, id: Optional[str] = None, name: str = "VCA Group", volume: float = 1.0):
        self.id = id or str(uuid4())
        self.name = name
        self.volume = volume


_graph_store: Dict[str, AudioGraph] = {}


def get_graph(session_id: str = "default") -> AudioGraph:
    if session_id not in _graph_store:
        _graph_store[session_id] = AudioGraph()
    return _graph_store[session_id]


def set_graph(session_id: str, graph: AudioGraph) -> None:
    _graph_store[session_id] = graph
