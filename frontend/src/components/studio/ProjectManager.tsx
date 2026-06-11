import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, FolderOpen, FilePlus2, Download,
  X, Search, Clock, Music, FileDown,
  Loader2, ChevronRight, Archive, HardDrive, Cloud,
  Upload, History, Camera, EllipsisVertical,
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
import { SessionBrowser } from "./SessionBrowser";
import { ProjectTemplates } from "./ProjectTemplates";
import { TEMPLATES, type TemplateInfo } from "../../api/sessionTemplates";

interface ProjectManagerProps {
  open: boolean;
  onClose: () => void;
  currentSessionId?: string;
  onSessionLoaded?: (session: { id: string; name: string; bpm: number; key: string }) => void;
}

type DialogMode = "save" | "load" | "new" | "export" | "history";

interface VersionEntry {
  id: string;
  name: string;
  timestamp: string;
  size: number;
  note: string;
}

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

  const [autoSave, setAutoSave] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState(5);
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);
  const [storageType, setStorageType] = useState<"local" | "cloud">("local");
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [sessionBrowserOpen, setSessionBrowserOpen] = useState(false);
  const [templateBrowserOpen, setTemplateBrowserOpen] = useState(false);

  const [versionHistory, setVersionHistory] = useState<VersionEntry[]>([
    { id: "v1", name: "Initial draft", timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), size: 2.4, note: "First tracking session" },
    { id: "v2", name: "Mix revision 1", timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), size: 2.8, note: "Adjusted levels and added reverb" },
    { id: "v3", name: "Master v1", timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), size: 3.1, note: "Master bus processing" },
  ]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      listStudioSessions().then(r => setSessions(r.sessions)).catch(() => {}),
      getRecentSessions().then(r => setRecent(r.recent)).catch(() => {}),
      getTemplates().then(r => setTemplates(r.templates)).catch(() => {}),
    ]).finally(() => setLoading(false));

    if (currentSessionId) {
      setSaveName("");
      setSaveAsName("");
    }
  }, [open, currentSessionId]);

  useEffect(() => {
    if (!autoSave || !currentSessionId || !open) return;
    const interval = setInterval(async () => {
      try {
        await saveSession(currentSessionId);
        setLastAutoSave(new Date().toLocaleTimeString());
      } catch {}
    }, autoSaveInterval * 60000);
    return () => clearInterval(interval);
  }, [autoSave, autoSaveInterval, currentSessionId, open]);

  const filteredSessions = sessions.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const handleSave = async () => {
    if (!currentSessionId) return;
    setSaving(true);
    try {
      await saveSession(currentSessionId);
      setLastAutoSave(new Date().toLocaleTimeString());
      setMode("load");
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAs = async () => {
    if (!currentSessionId || !saveAsName.trim()) return;
    setSaving(true);
    try {
      await saveSession(currentSessionId);
      setShowSaveAs(false);
      setLastAutoSave(new Date().toLocaleTimeString());
    } catch (e) {
      console.error("Save As failed", e);
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

  const handleSessionLoad = (session: StudioSession) => {
    onSessionLoaded?.({ id: session.id, name: session.name, bpm: session.bpm ?? 120, key: session.key ?? "C" });
    setSessionBrowserOpen(false);
    onClose();
  };

  const handleSessionCreate = (name: string) => {
    createSessionFromTemplate(name, "empty")
      .then((session) => {
        onSessionLoaded?.(session);
        onClose();
      })
      .catch(() => {});
  };

  const handleSessionDelete = (_id: string) => {};

  const handleTemplateSelect = (template: TemplateInfo) => {
    createSessionFromTemplate(template.name, template.id)
      .then((session) => {
        onSessionLoaded?.(session);
        setTemplateBrowserOpen(false);
        onClose();
      })
      .catch(() => {});
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <>
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
              className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl w-[780px] max-h-[85vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <div className="flex items-center gap-2">
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
                  <div className="w-px h-4 bg-gray-800 mx-1" />
                  <button
                    onClick={() => setMode("history")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      mode === "history" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                    }`}
                  >
                    <History size={14} /> History
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {autoSave && lastAutoSave && (
                    <div className="flex items-center gap-1 text-[9px] text-gray-600 bg-gray-800 px-2 py-1 rounded-lg">
                      <Clock size={10} />
                      Auto-saved {lastAutoSave}
                    </div>
                  )}
                  <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                </div>
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
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Save Project</h3>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={autoSave}
                              onChange={(e) => setAutoSave(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-7 h-3.5 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all" />
                          </label>
                          <span className="text-[10px] text-gray-500">Auto-save</span>
                        </div>
                        {autoSave && (
                          <select
                            value={autoSaveInterval}
                            onChange={(e) => setAutoSaveInterval(parseInt(e.target.value))}
                            className="bg-gray-800 border border-gray-700 rounded text-[10px] text-gray-300 px-1.5 py-0.5 outline-none"
                          >
                            <option value={1}>1 min</option>
                            <option value={5}>5 min</option>
                            <option value={10}>10 min</option>
                            <option value={30}>30 min</option>
                          </select>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 bg-gray-800/30 rounded-xl p-2">
                      <button
                        onClick={() => setStorageType("local")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
                          storageType === "local"
                            ? "bg-blue-600 text-white"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        <HardDrive size={12} />
                        Local
                      </button>
                      <button
                        onClick={() => setStorageType("cloud")}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold transition-all ${
                          storageType === "cloud"
                            ? "bg-blue-600 text-white"
                            : "text-gray-500 hover:text-gray-300"
                        }`}
                      >
                        <Cloud size={12} />
                        Cloud
                      </button>
                    </div>

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
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={handleSave}
                          disabled={saving || !currentSessionId}
                          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                        >
                          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={() => { setShowSaveAs(true); setSaveAsName(""); }}
                          disabled={!currentSessionId}
                          className="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 border border-gray-700"
                        >
                          <Upload size={16} />
                          Save As...
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {!loading && mode === "load" && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                          value={search}
                          onChange={e => setSearch(e.target.value)}
                          placeholder="Search projects..."
                          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-gray-300 text-sm outline-none focus:border-blue-500 transition-colors"
                        />
                      </div>
                      <button
                        onClick={() => setSessionBrowserOpen(true)}
                        className="px-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                      >
                        <FolderOpen size={14} />
                        Browse
                      </button>
                      <button
                        onClick={() => setTemplateBrowserOpen(true)}
                        className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-gray-700"
                      >
                        <FilePlus2 size={14} />
                        Templates
                      </button>
                    </div>

                    {/* Recent */}
                    {recent.length > 0 && !search && (
                      <div>
                        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <Clock size={12} /> Recent Projects
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {recent.slice(0, 4).map(p => (
                            <button
                              key={p.id}
                              onClick={() => { onSessionLoaded?.(p); onClose(); }}
                              className="flex items-center gap-3 p-3 rounded-xl bg-gray-800/30 border border-gray-800/50 hover:bg-gray-800 transition-all group"
                            >
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shrink-0">
                                <Music size={16} className="text-white" />
                              </div>
                              <div className="flex-1 min-w-0 text-left">
                                <div className="text-xs font-bold text-gray-200 group-hover:text-white transition-colors truncate">
                                  {p.name}
                                </div>
                                <div className="flex items-center gap-2 text-[9px] text-gray-600 mt-0.5">
                                  <span>{p.bpm} BPM</span>
                                  <span>{p.key}</span>
                                  <span>{p.track_count} trk</span>
                                </div>
                              </div>
                              <ChevronRight size={12} className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
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
                        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
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
                                <span className="flex items-center gap-1 font-mono">{s.bpm} BPM</span>
                                <span className="font-mono">{s.key}</span>
                                <span>{formatDate(s.updated_at)}</span>
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
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTemplateBrowserOpen(true)}
                        className="flex-1 py-3 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 font-bold text-xs transition-all flex items-center justify-center gap-2"
                      >
                        <Camera size={14} />
                        Browse Templates
                      </button>
                      <button
                        onClick={handleCreateFromTemplate}
                        disabled={!newName.trim() || loading}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2"
                      >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
                        Create
                      </button>
                    </div>
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

                {!loading && mode === "history" && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Version History</h3>
                    {versionHistory.length === 0 ? (
                      <div className="text-center py-8 text-gray-600 text-sm">No saved versions yet</div>
                    ) : (
                      <div className="space-y-2">
                        {versionHistory.map((v, i) => (
                          <div
                            key={v.id}
                            className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                              i === versionHistory.length - 1
                                ? "border-blue-500/30 bg-blue-500/5"
                                : "border-gray-800 bg-gray-800/30 hover:bg-gray-800"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                i === versionHistory.length - 1
                                  ? "bg-blue-500/20 text-blue-400"
                                  : "bg-gray-800 text-gray-500"
                              }`}>
                                <History size={14} />
                              </div>
                              <div>
                                <div className="text-sm font-bold text-gray-200">{v.name}</div>
                                <div className="flex items-center gap-2 text-[10px] text-gray-600 mt-0.5">
                                  <span>{new Date(v.timestamp).toLocaleString()}</span>
                                  <span>{v.size} MB</span>
                                  {v.note && <span className="text-gray-500">· {v.note}</span>}
                                </div>
                              </div>
                            </div>
                            {i === versionHistory.length - 1 && (
                              <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                Current
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800 bg-gray-900/50">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <HardDrive size={10} className="text-gray-600" />
                    <span className="text-[9px] text-gray-600 uppercase tracking-wider font-bold">
                      {storageType === "cloud" ? "Cloud" : "Local"}
                    </span>
                  </div>
                  {lastAutoSave && (
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className="text-gray-600" />
                      <span className="text-[9px] text-gray-600 font-mono">
                        Last saved: {lastAutoSave}
                      </span>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-gray-600 font-mono">
                  {currentSessionId ? "Session active" : "No session loaded"}
                </span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save As Dialog */}
      <AnimatePresence>
        {showSaveAs && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowSaveAs(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-bold text-white mb-4">Save Project As</h3>
              <input
                value={saveAsName}
                onChange={(e) => setSaveAsName(e.target.value)}
                placeholder="New project name"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors mb-4"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveAs();
                  if (e.key === "Escape") setShowSaveAs(false);
                }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSaveAs(false)}
                  className="flex-1 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAs}
                  disabled={!saveAsName.trim() || saving}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : "Save As"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session Browser Modal */}
      <SessionBrowser
        open={sessionBrowserOpen}
        onClose={() => setSessionBrowserOpen(false)}
        onSessionLoad={handleSessionLoad}
        onSessionCreate={handleSessionCreate}
        onSessionDelete={handleSessionDelete}
      />

      {/* Project Templates Modal */}
      <ProjectTemplates
        onSelect={handleTemplateSelect}
        onClose={() => setTemplateBrowserOpen(false)}
      />
    </>
  );
}
