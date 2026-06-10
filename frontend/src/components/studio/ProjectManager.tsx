import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, FolderOpen, FilePlus2, Download,
  X, Search, Clock, Music, FileDown,
  Loader2, ChevronRight, Archive,
} from "lucide-react";
import {
  listStudioSessions,
  saveSession,
  getRecentSessions,
  getTemplates,
  createSessionFromTemplate,
  exportStems,
  type StudioSession,
} from "../../api/client";

interface ProjectManagerProps {
  open: boolean;
  onClose: () => void;
  currentSessionId?: string;
  onSessionLoaded?: (session: { id: string; name: string; bpm: number; key: string }) => void;
}

type DialogMode = "save" | "load" | "new" | "export";

export function ProjectManager({
  open,
  onClose,
  currentSessionId,
  onSessionLoaded,
}: ProjectManagerProps) {
  const [mode, setMode] = useState<DialogMode>("load");
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [recent, setRecent] = useState<Array<{ id: string; name: string; bpm: number; key: string; track_count: number; updated_at: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ name: string; label: string; description: string; bpm: number; key: string; track_count: number }>>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveTags, setSaveTags] = useState("");

  const [newName, setNewName] = useState("");
  const [newTemplate, setNewTemplate] = useState("empty");

  const [exportResult, setExportResult] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      listStudioSessions().then(r => setSessions(r.sessions)).catch(() => {}),
      getRecentSessions().then(r => setRecent(r.recent)).catch(() => {}),
      getTemplates().then(r => setTemplates(r.templates)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [open]);

  const filteredSessions = sessions.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const handleSave = async () => {
    if (!currentSessionId) return;
    setSaving(true);
    try {
      const result = await saveSession(currentSessionId);
      setMode("load");
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFromTemplate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const session = await createSessionFromTemplate(newName.trim(), newTemplate);
      onSessionLoaded?.(session);
      onClose();
    } catch (e) {
      console.error("Create from template failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handleExportStems = async () => {
    if (!currentSessionId) return;
    setLoading(true);
    try {
      const result = await exportStems(currentSessionId);
      setExportResult(`Export ready: ${result.session_name} - ${result.stems.length} stems`);
    } catch (e) {
      setExportResult("Export failed");
    } finally {
      setLoading(false);
    }
  };

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
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-[720px] max-h-[80vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMode("save")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    mode === "save" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <Save size={14} /> Save
                </button>
                <button
                  onClick={() => setMode("load")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    mode === "load" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <FolderOpen size={14} /> Load
                </button>
                <button
                  onClick={() => setMode("new")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    mode === "new" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <FilePlus2 size={14} /> New
                </button>
                <button
                  onClick={() => setMode("export")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    mode === "export" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  <Download size={14} /> Export
                </button>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="text-blue-500 animate-spin" />
                </div>
              )}

              {!loading && mode === "save" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Save Project</h3>
                  <div className="space-y-3">
                    <input
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      placeholder="Project name"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold text-sm outline-none focus:border-blue-500 transition-colors"
                    />
                    <textarea
                      value={saveDescription}
                      onChange={e => setSaveDescription(e.target.value)}
                      placeholder="Description (optional)"
                      rows={3}
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-gray-300 text-sm outline-none focus:border-blue-500 transition-colors resize-none"
                    />
                    <input
                      value={saveTags}
                      onChange={e => setSaveTags(e.target.value)}
                      placeholder="Tags (comma separated)"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-gray-300 text-sm outline-none focus:border-blue-500 transition-colors"
                    />
                    <button
                      onClick={handleSave}
                      disabled={saving || !currentSessionId}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                      {saving ? "Saving..." : "Save to .calliope"}
                    </button>
                  </div>
                </div>
              )}

              {!loading && mode === "load" && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Search projects..."
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-gray-300 text-sm outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  {/* Recent */}
                  {recent.length > 0 && !search && (
                    <div>
                      <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <Clock size={12} /> Recent Projects
                      </h4>
                      <div className="space-y-1">
                        {recent.map(p => (
                          <button
                            key={p.id}
                            onClick={() => { onSessionLoaded?.(p); onClose(); }}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-800 transition-colors group"
                          >
                            <div className="flex items-center gap-3">
                              <Music size={14} className="text-gray-600" />
                              <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{p.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-600">
                              <span>{p.bpm} BPM</span>
                              <span>{p.key}</span>
                              <span>{p.track_count} tracks</span>
                              <ChevronRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All sessions */}
                  <div>
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <Archive size={12} /> All Projects ({filteredSessions.length})
                    </h4>
                    {filteredSessions.length === 0 ? (
                      <div className="text-center py-8 text-gray-600 text-sm">No projects found</div>
                    ) : (
                      <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                        {filteredSessions.map(s => (
                          <button
                            key={s.id}
                            onClick={() => { onSessionLoaded?.(s); onClose(); }}
                            className="w-full flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-800 transition-colors group"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                              <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors truncate">{s.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] text-gray-600 shrink-0">
                              <span className="flex items-center gap-1"><Hash size={10} />{s.bpm}</span>
                              <span>{s.key}</span>
                              <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!loading && mode === "new" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">New Project</h3>
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Project name"
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3 text-white font-bold text-sm outline-none focus:border-blue-500 transition-colors"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {templates.map(t => (
                      <button
                        key={t.name}
                        onClick={() => setNewTemplate(t.name)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          newTemplate === t.name
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-gray-800 bg-gray-800/50 hover:border-gray-700"
                        }`}
                      >
                        <div className="text-sm font-bold text-gray-200">{t.label}</div>
                        <div className="text-[10px] text-gray-500 mt-1">{t.description}</div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-gray-600">
                          <span>{t.bpm} BPM</span>
                          <span>Key: {t.key}</span>
                          <span>{t.track_count} tracks</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={handleCreateFromTemplate}
                    disabled={!newName.trim() || loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
                    Create Project
                  </button>
                </div>
              )}

              {!loading && mode === "export" && (
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Export Project</h3>
                  <div className="space-y-3">
                    <button
                      onClick={handleExportStems}
                      disabled={!currentSessionId}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <FileDown size={16} /> Export Stems
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!currentSessionId}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      <Download size={16} /> Export .calliope File
                    </button>
                    {exportResult && (
                      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 text-sm text-green-400">
                        {exportResult}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
