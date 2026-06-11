import { useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, RotateCcw, X, Trash2 } from "lucide-react";

interface HistoryEntry {
  timestamp: number;
  description: string;
}

interface UndoHistoryProps {
  open: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  currentIndex: number;
  onJumpToIndex: (index: number) => void;
  onClear: () => void;
}

export function UndoHistory({
  open, onClose, history, currentIndex,
  onJumpToIndex, onClear,
}: UndoHistoryProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-undo-panel]')) onClose();
      });
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown, onClose]);

  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.querySelector('[data-current="true"]');
      item?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [open, currentIndex]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-40"
          />
          <motion.div
            data-undo-panel
            ref={listRef}
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-80 bg-gray-950 border-l border-gray-800 z-50 shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <History size={14} className="text-blue-400" />
                <span className="text-sm font-bold text-white">Undo History</span>
              </div>
              <button onClick={onClose} className="p-1 rounded text-gray-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                  <RotateCcw size={24} className="mb-2 opacity-50" />
                  <span className="text-xs font-medium">No history yet</span>
                </div>
              ) : (
                history.map((entry, i) => {
                  const isCurrent = i === currentIndex;
                  const time = new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: "2-digit", minute: "2-digit", second: "2-digit",
                  });
                  return (
                    <button
                      key={i}
                      data-current={isCurrent}
                      onClick={() => onJumpToIndex(i)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-l-2 ${
                        isCurrent
                          ? "bg-blue-500/10 border-l-blue-500"
                          : "border-l-transparent hover:bg-gray-900"
                      }`}
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isCurrent ? "bg-blue-500" : "bg-gray-700"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs truncate ${
                          isCurrent ? "text-white font-medium" : "text-gray-400"
                        }`}>
                          {entry.description}
                        </div>
                        <div className="text-[9px] font-mono text-gray-600 mt-0.5">{time}</div>
                      </div>
                      {isCurrent && (
                        <span className="text-[8px] font-bold text-blue-500 uppercase">Current</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {history.length > 0 && (
              <div className="border-t border-gray-800 p-3">
                <button
                  onClick={onClear}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 text-xs font-bold transition-colors"
                >
                  <Trash2 size={12} />
                  Clear History
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
