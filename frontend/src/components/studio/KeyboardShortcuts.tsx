import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";

interface ShortcutGroup {
  category: string;
  shortcuts: { keys: string; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    category: "Transport",
    shortcuts: [
      { keys: "Space", description: "Play / Pause" },
      { keys: "Shift + Space", description: "Stop" },
      { keys: "R", description: "Toggle Record" },
      { keys: "L", description: "Toggle Loop" },
      { keys: "M", description: "Toggle Metronome" },
      { keys: "Numpad 0", description: "Return to Start" },
      { keys: "Numpad .", description: "Jump to End" },
    ],
  },
  {
    category: "Editing",
    shortcuts: [
      { keys: "Ctrl/Cmd + Z", description: "Undo" },
      { keys: "Ctrl/Cmd + Shift + Z", description: "Redo" },
      { keys: "Ctrl/Cmd + X", description: "Cut" },
      { keys: "Ctrl/Cmd + C", description: "Copy" },
      { keys: "Ctrl/Cmd + V", description: "Paste" },
      { keys: "Delete / Backspace", description: "Delete Selected" },
      { keys: "Q", description: "Quantize Notes" },
      { keys: "D", description: "Draw Tool" },
      { keys: "S", description: "Select Tool" },
      { keys: "E", description: "Eraser Tool" },
    ],
  },
  {
    category: "Navigation",
    shortcuts: [
      { keys: "Left / Right Arrow", description: "Nudge Position" },
      { keys: "Shift + Arrow", description: "Nudge by Bar" },
      { keys: "Ctrl/Cmd + Arrow", description: "Jump to Next/Prev Section" },
      { keys: "Home", description: "Go to Start" },
      { keys: "End", description: "Go to End" },
      { keys: "Page Up / Down", description: "Scroll Timeline" },
    ],
  },
  {
    category: "Tools",
    shortcuts: [
      { keys: "Ctrl/Cmd + T", description: "New Track" },
      { keys: "Ctrl/Cmd + Shift + T", description: "New Bus" },
      { keys: "F", description: "Toggle Full Screen" },
      { keys: "H", description: "Toggle Snap to Grid" },
      { keys: "Z", description: "Zoom to Selection" },
      { keys: "Ctrl/Cmd + F", description: "Search" },
    ],
  },
  {
    category: "View",
    shortcuts: [
      { keys: "F1", description: "Toggle Mixer" },
      { keys: "F2", description: "Toggle Piano Roll" },
      { keys: "F3", description: "Toggle Arrangement" },
      { keys: "F4", description: "Toggle FX Rack" },
      { keys: "F5", description: "Toggle Browser" },
      { keys: "Ctrl/Cmd + W", description: "Close Panel" },
    ],
  },
  {
    category: "File",
    shortcuts: [
      { keys: "Ctrl/Cmd + N", description: "New Project" },
      { keys: "Ctrl/Cmd + O", description: "Open Project" },
      { keys: "Ctrl/Cmd + S", description: "Save Project" },
      { keys: "Ctrl/Cmd + Shift + S", description: "Save As..." },
      { keys: "Ctrl/Cmd + Shift + E", description: "Export Mixdown" },
      { keys: "Ctrl/Cmd + Shift + P", description: "Project Settings" },
      { keys: "Ctrl/Cmd + Q", description: "Quit" },
    ],
  },
];

interface KeyboardShortcutsProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcuts({ open, onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl w-[600px] max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <Keyboard size={18} className="text-blue-500" />
                <h2 className="text-lg font-bold text-white">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-all"
                title="Close (Esc)"
              >
                <X size={16} />
              </button>
            </div>

            {/* Shortcuts grid */}
            <div className="p-6 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-6">
                {SHORTCUT_GROUPS.map((group) => (
                  <div key={group.category}>
                    <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 pb-1 border-b border-gray-800">
                      {group.category}
                    </h3>
                    <div className="space-y-1.5">
                      {group.shortcuts.map((shortcut) => (
                        <div
                          key={shortcut.keys + shortcut.description}
                          className="flex items-center justify-between gap-2 py-0.5"
                        >
                          <span className="text-xs text-gray-400">{shortcut.description}</span>
                          <kbd className="text-[10px] font-mono font-bold bg-gray-900 border border-gray-800 text-gray-300 px-2 py-0.5 rounded-lg shrink-0 whitespace-nowrap">
                            {shortcut.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer hint */}
            <div className="px-6 py-3 border-t border-gray-800 bg-gray-950/50">
              <p className="text-[9px] text-gray-600 text-center">
                Press <kbd className="text-[9px] font-mono bg-gray-900 border border-gray-800 px-1.5 py-0.5 rounded text-gray-400">?</kbd> to toggle this cheat sheet at any time
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
