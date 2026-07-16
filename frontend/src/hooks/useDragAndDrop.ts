import { useState, useCallback, useRef } from "react";

export interface DragData {
  type: "loop" | "sample" | "file";
  id: string;
  name: string;
  loop?: {
    bpm: number;
    key: string;
    category: string;
    duration: number;
    color: string;
  };
  file?: File;
}

export interface DropTarget {
  trackId: string | null;
  position: number;
  bar: number;
  beat: number;
}

export interface DragState {
  isDragging: boolean;
  dragData: DragData | null;
  dragPosition: { x: number; y: number } | null;
  dropTarget: DropTarget | null;
}

interface UseDragAndDropOptions {
  bpm?: number;
  gridResolution?: number;
  onDrop?: (data: DragData, target: DropTarget) => void;
  onFileDrop?: (file: File, target: DropTarget) => void;
}

export function useDragAndDrop(options: UseDragAndDropOptions = {}) {
  const { bpm = 120, gridResolution = 4, onDrop, onFileDrop } = options;

  const [state, setState] = useState<DragState>({
    isDragging: false,
    dragData: null,
    dragPosition: null,
    dropTarget: null,
  });

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const positionToGrid = useCallback(
    (x: number, y: number): DropTarget => {
      const pixelsPerBeat = 60;
      const pixelsPerBar = pixelsPerBeat * gridResolution;
      const bar = Math.max(0, Math.round(x / pixelsPerBar));
      const beat = Math.max(0, Math.round((x % pixelsPerBar) / pixelsPerBeat));
      return {
        trackId: null,
        position: x,
        bar,
        beat,
      };
    },
    [gridResolution],
  );

  const startDrag = useCallback(
    (data: DragData, clientX: number, clientY: number) => {
      setState({
        isDragging: true,
        dragData: data,
        dragPosition: { x: clientX, y: clientY },
        dropTarget: null,
      });
    },
    [],
  );

  const updatePosition = useCallback(
    (clientX: number, clientY: number) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        setState((prev) => {
          if (!prev.isDragging) return prev;
          const gridPos = positionToGrid(clientX, clientY);
          return {
            ...prev,
            dragPosition: { x: clientX, y: clientY },
            dropTarget: { ...gridPos, trackId: prev.dropTarget?.trackId ?? null },
          };
        });
      }, 16);
    },
    [positionToGrid],
  );

  const endDrag = useCallback(
    (clientX?: number, clientY?: number) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      if (state.isDragging && state.dragData && state.dropTarget) {
        if (state.dragData.type === "file" && state.dragData.file) {
          onFileDrop?.(state.dragData.file, state.dropTarget);
        } else {
          onDrop?.(state.dragData, state.dropTarget);
        }
      }

      setState({
        isDragging: false,
        dragData: null,
        dragPosition: null,
        dropTarget: null,
      });
    },
    [state, onDrop, onFileDrop],
  );

  const cancelDrag = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    setState({
      isDragging: false,
      dragData: null,
      dragPosition: null,
      dropTarget: null,
    });
  }, []);

  const setDropTarget = useCallback((trackId: string | null) => {
    setState((prev) => ({
      ...prev,
      dropTarget: prev.dropTarget ? { ...prev.dropTarget, trackId } : null,
    }));
  }, []);

  return {
    isDragging: state.isDragging,
    dragData: state.dragData,
    dragPosition: state.dragPosition,
    dropTarget: state.dropTarget,
    startDrag,
    updatePosition,
    endDrag,
    cancelDrag,
    setDropTarget,
  };
}
