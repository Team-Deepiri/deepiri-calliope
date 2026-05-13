"""Undo/Redo state management for audio processing."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable
from uuid import UUID, uuid4


class ProcessingState:
    """Represents a single processing state in the undo stack."""

    def __init__(self, samples: np.ndarray, sr: int, description: str = ""):
        self.id = uuid4()
        self.samples = samples.copy()
        self.sample_rate = sr
        self.description = description
        self.timestamp = 0

    def __repr__(self) -> str:
        return f"ProcessingState(id={self.id}, samples={len(self.samples)}, description='{self.description}')"


class HistoryManager:
    """
    Manages undo/redo history for audio processing.
    """

    def __init__(self, max_history: int = 50):
        self.max_history = max_history
        self._undo_stack: list[ProcessingState] = []
        self._redo_stack: list[ProcessingState] = []
        self._timestamp = 0

    def push(self, samples: np.ndarray, sr: int, description: str = "") -> ProcessingState:
        """Push a new state onto the undo stack."""
        self._timestamp += 1
        state = ProcessingState(samples, sr, description)
        state.timestamp = self._timestamp
        
        self._undo_stack.append(state)
        
        if len(self._undo_stack) > self.max_history:
            self._undo_stack.pop(0)
        
        self._redo_stack.clear()
        
        return state

    def undo(self, current_samples: np.ndarray, current_sr: int) -> ProcessingState | None:
        """Undo last operation. Returns state to restore."""
        if not self._undo_stack:
            return None
        
        current = ProcessingState(current_samples, current_sr, "current")
        self._redo_stack.append(current)
        
        return self._undo_stack.pop()

    def redo(self, current_samples: np.ndarray, current_sr: int) -> ProcessingState | None:
        """Redo last undone operation."""
        if not self._redo_stack:
            return None
        
        current = ProcessingState(current_samples, current_sr, "current")
        self._undo_stack.append(current)
        
        return self._redo_stack.pop()

    def get_undo_state(self) -> ProcessingState | None:
        """Peek at the next state to undo."""
        return self._undo_stack[-1] if self._undo_stack else None

    def get_redo_state(self) -> ProcessingState | None:
        """Peek at the next state to redo."""
        return self._redo_stack[-1] if self._redo_stack else None

    def clear(self) -> None:
        """Clear all history."""
        self._undo_stack.clear()
        self._redo_stack.clear()

    @property
    def can_undo(self) -> bool:
        return len(self._undo_stack) > 0

    @property
    def can_redo(self) -> bool:
        return len(self._redo_stack) > 0

    @property
    def undo_count(self) -> int:
        return len(self._undo_stack)

    @property
    def redo_count(self) -> int:
        return len(self._redo_stack)


@dataclass
class ProcessingAction:
    name: str
    params: dict
    timestamp: float


class ProcessingSession:
    """
    Complete processing session with undo/redo and action logging.
    """

    def __init__(self, initial_samples: np.ndarray, sr: int):
        self.history = HistoryManager()
        self.current_samples = initial_samples.copy()
        self.sample_rate = sr
        self._action_log: list[ProcessingAction] = []
        
        self.history.push(initial_samples, sr, "initial")

    def apply(
        self,
        processor: Callable[[np.ndarray], np.ndarray],
        name: str,
        params: dict | None = None,
    ) -> np.ndarray:
        """Apply a processing function and record in history."""
        new_samples = processor(self.current_samples)
        
        self.current_samples = new_samples
        self.history.push(new_samples, self.sample_rate, name)
        
        self._action_log.append(ProcessingAction(
            name=name,
            params=params or {},
            timestamp=0,
        ))
        
        return new_samples

    def undo(self) -> bool:
        """Undo last processing step."""
        state = self.history.undo(self.current_samples, self.sample_rate)
        if state:
            self.current_samples = state.samples
            if self._action_log:
                self._action_log.pop()
            return True
        return False

    def redo(self) -> bool:
        """Redo last undone step."""
        state = self.history.redo(self.current_samples, self.sample_rate)
        if state:
            self.current_samples = state.samples
            return True
        return False

    def get_snapshot(self) -> dict:
        """Get current session state as dict."""
        return {
            "sample_rate": self.sample_rate,
            "sample_count": len(self.current_samples),
            "undo_available": self.history.can_undo,
            "redo_available": self.history.can_redo,
            "action_count": len(self._action_log),
        }


import numpy as np