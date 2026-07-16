import { useState, useCallback, useRef } from "react";

interface HistoryEntry<T> {
  state: T;
  description: string;
  timestamp: number;
}

export interface UndoHistoryEntry {
  timestamp: number;
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
  historyLog: UndoHistoryEntry[];
  currentHistoryIndex: number;
  jumpToHistoryIndex: (index: number) => void;
  clear: () => void;
  reset: (initial: T) => void;
}

export function useUndoRedo<T>(
  initial: T,
  maxDepth: number = 50,
): UseUndoRedoReturn<T> {
  const [state, setStateRaw] = useState<T>(initial);
  const [historyVersion, setHistoryVersion] = useState(0);
  const undoStackRef = useRef<HistoryEntry<T>[]>([]);
  const redoStackRef = useRef<HistoryEntry<T>[]>([]);
  const currentRef = useRef<HistoryEntry<T>>({
    state: initial,
    description: "Initial state",
    timestamp: Date.now(),
  });

  const bumpHistory = useCallback(() => setHistoryVersion((v) => v + 1), []);

  const pushState = useCallback(
    (newState: T, description: string = "edit") => {
      undoStackRef.current.push(currentRef.current);
      if (undoStackRef.current.length > maxDepth) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      currentRef.current = { state: newState, description, timestamp: Date.now() };
      setStateRaw(newState);
      bumpHistory();
    },
    [maxDepth, bumpHistory],
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
    bumpHistory();
  }, [bumpHistory]);

  const redo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const entry = redoStackRef.current.pop()!;
    undoStackRef.current.push(currentRef.current);
    currentRef.current = entry;
    setStateRaw(entry.state);
    bumpHistory();
  }, [bumpHistory]);

  const jumpToHistoryIndex = useCallback((index: number) => {
    const all = [...undoStackRef.current, currentRef.current];
    if (index < 0 || index >= all.length) return;
    const target = all[index];
    undoStackRef.current = all.slice(0, index);
    redoStackRef.current = all.slice(index + 1).reverse();
    currentRef.current = target;
    setStateRaw(target.state);
    bumpHistory();
  }, [bumpHistory]);

  const clear = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    bumpHistory();
  }, [bumpHistory]);

  const reset = useCallback(
    (newInitial: T) => {
      undoStackRef.current = [];
      redoStackRef.current = [];
      currentRef.current = { state: newInitial, description: "Initial state", timestamp: Date.now() };
      setStateRaw(newInitial);
      bumpHistory();
    },
    [bumpHistory],
  );

  void historyVersion;
  const historyLog: UndoHistoryEntry[] = [...undoStackRef.current, currentRef.current].map(
    ({ description, timestamp }) => ({ description, timestamp }),
  );

  return {
    state,
    setState,
    undo,
    redo,
    canUndo: undoStackRef.current.length > 0,
    canRedo: redoStackRef.current.length > 0,
    history: [...undoStackRef.current, currentRef.current],
    historyLog,
    currentHistoryIndex: undoStackRef.current.length,
    jumpToHistoryIndex,
    clear,
    reset,
  };
}
