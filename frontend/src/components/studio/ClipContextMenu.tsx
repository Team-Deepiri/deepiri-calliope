import { useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scissors, Copy, Trash2, Edit3, Type, Palette,
  Radio, RefreshCw, X,
} from "lucide-react";

export type ContextMenuAction =
  | "edit"
  | "duplicate"
  | "delete"
  | "split"
  | "rename"
  | "color"
  | "render"
  | "loop";

interface ClipContextMenuProps {
  x: number;
  y: number;
  open: boolean;
  onClose: () => void;
  onAction: (action: ContextMenuAction) => void;
  clipName?: string;
}

const MENU_ITEMS: Array<{ action: ContextMenuAction; label: string; icon: typeof Scissors; shortcut?: string }> = [
  { action: "edit", label: "Edit", icon: Edit3 },
  { action: "duplicate", label: "Duplicate", icon: Copy, shortcut: "Ctrl+D" },
  { action: "delete", label: "Delete", icon: Trash2, shortcut: "Del" },
  { action: "split", label: "Split at Playhead", icon: Scissors, shortcut: "Ctrl+E" },
  { action: "rename", label: "Rename", icon: Type },
  { action: "color", label: "Change Color", icon: Palette },
  { action: "render", label: "Render as Audio", icon: Radio },
  { action: "loop", label: "Loop On/Off", icon: RefreshCw },
];

export function ClipContextMenu({ x, y, open, onClose, onAction, clipName }: ClipContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      onClose();
    }
  }, [onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleClickOutside, handleKeyDown]);

  const menuX = Math.min(x, window.innerWidth - 200);
  const menuY = Math.min(y, window.innerHeight - 320);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.95, y: -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.12, ease: "easeOut" }}
          className="fixed z-50 w-48 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl shadow-black/50 overflow-hidden"
          style={{ left: menuX, top: menuY }}
        >
          <div className="px-3 py-2 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 truncate max-w-[140px]">
                {clipName || "Clip"}
              </span>
              <button onClick={onClose} className="p-0.5 rounded text-gray-600 hover:text-gray-300">
                <X size={10} />
              </button>
            </div>
          </div>
          <div className="py-1">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.action}
                  onClick={() => { onAction(item.action); onClose(); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                >
                  <Icon size={13} className="text-gray-500 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[8px] font-mono text-gray-600">{item.shortcut}</span>
                  )}
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
