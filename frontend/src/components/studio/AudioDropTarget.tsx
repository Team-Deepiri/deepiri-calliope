import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Music, Upload, FileAudio } from "lucide-react";

interface AudioDropTargetProps {
  trackId: string;
  onDrop?: (trackId: string, data: unknown) => void;
  onFileDrop?: (trackId: string, file: File, metadata: { duration: number; name: string }) => void;
  isActive?: boolean;
  label?: string;
}

export function AudioDropTarget({
  trackId,
  onDrop,
  onFileDrop,
  isActive = true,
  label = "Drop audio here",
}: AudioDropTargetProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const dragCounter = useRef(0);

  const extractFileMetadata = useCallback(
    (file: File): Promise<{ duration: number; name: string }> => {
      return new Promise((resolve) => {
        if (file.type.startsWith("audio/")) {
          const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
          const reader = new FileReader();
          reader.onload = async (e) => {
            try {
              const buffer = e.target?.result as ArrayBuffer;
              const audioBuffer = await audioContext.decodeAudioData(buffer);
              resolve({ duration: audioBuffer.duration, name: file.name });
            } catch {
              resolve({ duration: 0, name: file.name });
            }
          };
          reader.readAsArrayBuffer(file);
        } else {
          resolve({ duration: 0, name: file.name });
        }
      });
    },
    [],
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isActive) return;
      dragCounter.current++;
      if (e.dataTransfer.types.includes("application/x-loop") || e.dataTransfer.types.includes("Files")) {
        setIsDragOver(true);
      }
    },
    [isActive],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current--;
      if (dragCounter.current === 0) {
        setIsDragOver(false);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isActive) {
        e.dataTransfer.dropEffect = "move";
      }
    },
    [isActive],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      dragCounter.current = 0;

      if (!isActive) return;

      const loopData = e.dataTransfer.getData("application/x-loop");
      if (loopData) {
        try {
          const parsed = JSON.parse(loopData);
          onDrop?.(trackId, parsed);
          setHasContent(true);
        } catch {
          // ignore parse errors
        }
        return;
      }

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.type.startsWith("audio/")) {
          const metadata = await extractFileMetadata(file);
          onFileDrop?.(trackId, file, metadata);
          setHasContent(true);
        }
      }
    },
    [isActive, trackId, onDrop, onFileDrop, extractFileMetadata],
  );

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative"
    >
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
          >
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center gap-2 text-blue-400">
                <Upload size={24} />
                <span className="text-xs font-bold">Drop to insert</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!hasContent && !isDragOver && (
        <div className="flex flex-col items-center justify-center py-8 text-center bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
          <FileAudio className="w-8 h-8 text-gray-700 mb-2" />
          <p className="text-xs text-gray-500 font-medium">{label}</p>
          <p className="text-[10px] text-gray-600 mt-1">
            Drag loops or audio files here
          </p>
        </div>
      )}
    </div>
  );
}
