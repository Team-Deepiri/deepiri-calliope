import { motion, AnimatePresence } from "framer-motion";
import { Music } from "lucide-react";
import type { DragData, DropTarget } from "../../hooks/useDragAndDrop";

interface DragOverlayProps {
  isDragging: boolean;
  dragData: DragData | null;
  position: { x: number; y: number } | null;
  dropTarget: DropTarget | null;
}

export function DragOverlay({
  isDragging,
  dragData,
  position,
  dropTarget,
}: DragOverlayProps) {
  return (
    <AnimatePresence>
      {isDragging && dragData && position && (
        <>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: position.x - 80,
              y: position.y - 40,
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed pointer-events-none z-[9999]"
            style={{
              left: 0,
              top: 0,
            }}
          >
            <div className="bg-gray-900/95 backdrop-blur-sm border border-blue-500/40 rounded-xl p-2 shadow-2xl shadow-blue-500/10 w-40">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center">
                  <Music size={12} className="text-blue-400" />
                </div>
                <span className="text-xs font-bold text-gray-200 truncate">
                  {dragData.name}
                </span>
              </div>

              {dragData.loop && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
                    {dragData.loop.bpm} BPM
                  </span>
                  <span className="text-[9px] font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded-full">
                    {dragData.loop.key}
                  </span>
                </div>
              )}

              <div className="mt-1.5 h-6 flex items-center gap-[1px]">
                {Array.from({ length: 20 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{
                      height: `${(Math.sin(i * 0.8 + Date.now() * 0.001) * 0.4 + 0.6) * 100}%`,
                      backgroundColor: dragData.loop?.color ?? "rgb(59, 130, 246)",
                      opacity: 0.6 + Math.sin(i * 0.5) * 0.3,
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>

          {dropTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.5, 0.2] }}
              transition={{ duration: 0.2 }}
              className="fixed pointer-events-none z-[9998] w-0.5 bg-blue-400 shadow-lg shadow-blue-500/50"
              style={{
                left: dropTarget.position,
                top: 0,
                bottom: 0,
                height: "100vh",
              }}
            />
          )}
        </>
      )}
    </AnimatePresence>
  );
}
