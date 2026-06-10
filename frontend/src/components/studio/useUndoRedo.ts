import { useState, useCallback, useRef } from "react";

interface HistoryEntry<T> {
  state: T;
  description: string;
}

interface UseUndoRedoReturn<T> {
  state: T;
  setState: (newState: T | ((prev: T) => T), description?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  history: HistoryEntry<T>[];
  clear: () => void;
  reset: (initial: T) => void;
}

export function useUndoRedo<T>(
  initial: T,
  maxDepth: number = 50,
): UseUndoRedoReturn<T> {
  const [state, setStateRaw] = useState<T>(initial);
  const undoStackRef = useRef<HistoryEntry<T>[]>([]);
  const redoStackRef = useRef<HistoryEntry<T>[]>([]);
  const currentRef = useRef<HistoryEntry<T>>({
    state: initial,
    description: "initial",
  });

  const pushState = useCallback(
    (newState: T, description: string = "edit") => {
      undoStackRef.current.push(currentRef.current);
      if (undoStackRef.current.length > maxDepth) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      currentRef.current = { state: newState, description };
      setStateRaw(newState);
    },
    [maxDepth],
  );

  const setState = useCallback(
    (newState: T | ((prev: T) => T), description?: string) => {
      if (typeof newState === "function") {
        const prev = currentRef.current.state;
        const next = (newState as (prev: T) => T)(prev);
        pushState(next, description ?? "edit");
      } else {
        pushState(newState, description ?? "edit");
      }
    },
    [pushState],
  );

  const undo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const entry = undoStackRef.current.pop()!;
    redoStackRef.current.push(currentRef.current);
    currentRef.current = entry;
    setStateRaw(entry.state);
  }, []);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const entry = redoStackRef.current.pop()!;
    undoStackRef.current.push(currentRef.current);
    currentRef.current = entry;
    setStateRaw(entry.state);
  }, []);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
  }, []);

  const reset = useCallback(
    (newInitial: T) => {
      undoStackRef.current = [];
      redoStackRef.current = [];
      currentRef.current = { state: newInitial, description: "initial" };
      setStateRaw(newInitial);
    },
    [],
  );

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    history: [...undoStackRef.current, currentRef.current],
    clear,
    reset,
  };
}
