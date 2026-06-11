import { useState, useCallback, useRef, useEffect } from "react";

export interface DroppedFileMetadata {
  file: File;
  duration?: number;
  name: string;
  size: number;
  type: string;
}

interface UseFileDragDropOptions {
  onFilesDrop?: (files: DroppedFileMetadata[]) => void;
  accept?: string[];
}

export function useFileDragDrop(options: UseFileDragDropOptions = {}) {
  const { onFilesDrop, accept } = options;
  const [isDragOver, setIsDragOver] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState<DroppedFileMetadata[]>([]);
  const dragCounter = useRef(0);

  const extractMetadata = useCallback(async (files: FileList): Promise<DroppedFileMetadata[]> => {
    const results: DroppedFileMetadata[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const meta: DroppedFileMetadata = {
        file,
        name: file.name,
        size: file.size,
        type: file.type,
      };
      if (file.type.startsWith("audio/")) {
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const buffer = await file.arrayBuffer();
          const decoded = await ctx.decodeAudioData(buffer);
          meta.duration = decoded.duration;
          ctx.close();
        } catch {}
      }
      results.push(meta);
    }
    return results;
  }, []);

  const handleDragEnter = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      setIsDragOver(true);
      const meta = await extractMetadata(e.dataTransfer.files);
      setDraggedFiles(meta);
    }
  }, [extractMetadata]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragOver(false);
    if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) return;
    const meta = await extractMetadata(e.dataTransfer.files);
    const filtered = accept
      ? meta.filter((m) => accept.some((ext) => m.name.endsWith(ext)))
      : meta;
    setDraggedFiles(filtered);
    onFilesDrop?.(filtered);
  }, [accept, extractMetadata, onFilesDrop]);

  const resetDrag = useCallback(() => {
    dragCounter.current = 0;
    setIsDragOver(false);
    setDraggedFiles([]);
  }, []);

  useEffect(() => {
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  return {
    isDragOver,
    draggedFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    resetDrag,
  };
}
