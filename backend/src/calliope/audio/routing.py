"""Node-based audio routing and processing graph."""

from __future__ import annotations

import numpy as np
from dataclasses import dataclass, field
from uuid import uuid4
from typing import Dict, List, Optional, Protocol, Any


class AudioNode(Protocol):
    """Protocol for all audio processing nodes."""
    id: str
    def process(self, inputs: List[np.ndarray]) -> np.ndarray: ...


@dataclass
class AudioGraph:
    """Manages the connections and execution of audio nodes."""
    nodes: Dict[str, AudioNode] = field(default_factory=dict)
    edges: List[tuple[str, str]] = field(default_factory=list)  # (from_id, to_id)
    sample_rate: int = 48000

    def add_node(self, node: AudioNode) -> str:
        self.nodes[node.id] = node
        return node.id

    def connect(self, from_id: str, to_id: str) -> None:
        if from_id in self.nodes and to_id in self.nodes:
            self.edges.append((from_id, to_id))

    def get_execution_order(self) -> List[str]:
        """Simple topological sort for DAG execution."""
        # Note: This basic version assumes no cycles for now
        in_degree = {node_id: 0 for node_id in self.nodes}
        for u, v in self.edges:
            in_degree[v] += 1
        
        queue = [n for n in self.nodes if in_degree[n] == 0]
        order = []
        
        while queue:
            u = queue.pop(0)
            order.append(u)
            for start, end in self.edges:
                if start == u:
                    in_degree[end] -= 1
                    if in_degree[end] == 0:
                        queue.append(end)
        
        return order

    def render(self, duration_sec: float) -> np.ndarray:
        """Renders the entire graph for a given duration."""
        order = self.get_execution_order()
        node_outputs: Dict[str, np.ndarray] = {}
        
        n_samples = int(duration_sec * self.sample_rate)
        
        for node_id in order:
            # Gather inputs from incoming edges
            inputs = []
            for start, end in self.edges:
                if end == node_id:
                    inputs.append(node_outputs[start])
            
            # If no inputs, pass empty list
            node_outputs[node_id] = self.nodes[node_id].process(inputs)
            
        # Return the output of the last node (sink) or sum of nodes with no outgoing edges
        terminal_nodes = [n for n in self.nodes if not any(edge[0] == n for edge in self.edges)]
        if not terminal_nodes:
            return np.zeros(n_samples)
            
        final_output = np.zeros_like(node_outputs[terminal_nodes[0]])
        for node_id in terminal_nodes:
            final_output += node_outputs[node_id]
            
        return final_output


class SourceNode:
    """A node that generates audio (e.g., Synth, Sampler)."""
    def __init__(self, generator_func, id: Optional[str] = None):
        self.id = id or str(uuid4())
        self.generator = generator_func

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        # Generator function should handle duration/state
        return self.generator()


class EffectNode:
    """A node that processes audio (e.g., Reverb, EQ)."""
    def __init__(self, processor_func, id: Optional[str] = None):
        self.id = id or str(uuid4())
        self.processor = processor_func

    def process(self, inputs: List[np.ndarray]) -> np.ndarray:
        if not inputs:
            return np.zeros(1) # Should not happen in a valid graph
        # Mix multiple inputs if necessary, then process
        mixed_input = np.sum(inputs, axis=0)
        return self.processor(mixed_input)
