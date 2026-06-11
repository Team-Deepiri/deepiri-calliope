import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Radio, Trash2, Plus, Loader2 } from "lucide-react";
import {
  listMidiMappings,
  createMidiMapping,
  deleteMidiMapping,
  setMidiLearnMode,
  type MidiMapping,
} from "../../api/client";

const CURVES = ["linear", "exponential", "logarithmic", "s-curve"] as const;

export function MidiLearnPanel() {
  const [mappings, setMappings] = useState<MidiMapping[]>([]);
  const [learnMode, setLearnMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [controllerName, setControllerName] = useState("Launchkey Mini");
  const [parameterPath, setParameterPath] = useState("channel.1.volume");
  const [ccNumber, setCcNumber] = useState(7);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listMidiMappings();
      setMappings(res.mappings);
    } catch {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleLearn = useCallback(async () => {
    const next = !learnMode;
    setLearnMode(next);
    try {
      await setMidiLearnMode(next);
    } catch {
      setLearnMode(!next);
    }
  }, [learnMode]);

  const handleCreate = useCallback(async () => {
    try {
      await createMidiMapping({
        controller_name: controllerName,
        parameter_path: parameterPath,
        cc_number: ccNumber,
      });
      await refresh();
    } catch {}
  }, [controllerName, parameterPath, ccNumber, refresh]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteMidiMapping(id);
      await refresh();
    } catch {}
  }, [refresh]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900/50 border border-gray-800 rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Radio size={16} className="text-purple-400" />
          <h3 className="text-sm font-bold text-white">MIDI Learn / Controller Mapping</h3>
        </div>
        <button
          onClick={() => void toggleLearn()}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            learnMode ? "bg-purple-600 text-white animate-pulse" : "bg-gray-800 text-gray-400 hover:text-white"
          }`}
        >
          {learnMode ? "Learning…" : "Learn Mode"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={controllerName}
          onChange={(e) => setControllerName(e.target.value)}
          placeholder="Controller"
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white"
        />
        <input
          value={parameterPath}
          onChange={(e) => setParameterPath(e.target.value)}
          placeholder="Parameter path"
          className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white md:col-span-2"
        />
        <div className="flex gap-2">
          <input
            type="number"
            value={ccNumber}
            onChange={(e) => setCcNumber(Number(e.target.value))}
            min={0}
            max={127}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white"
          />
          <button
            onClick={() => void handleCreate()}
            className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1"
          >
            <Plus size={12} /> Map
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-gray-500">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : mappings.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No mappings yet — enable Learn Mode or add manually.</p>
        ) : (
          mappings.map((m) => (
            <div
              key={m.id}
              className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-800/50 border border-gray-800"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">{m.controller_name}</div>
                <div className="text-[10px] text-gray-500 font-mono truncate">
                  CC{m.cc_number} → {m.parameter_path} ({CURVES.includes(m.curve_type as typeof CURVES[number]) ? m.curve_type : "linear"})
                </div>
              </div>
              <button
                onClick={() => void handleDelete(m.id)}
                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
}
