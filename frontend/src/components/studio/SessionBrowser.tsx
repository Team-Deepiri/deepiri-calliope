import { useState, useMemo, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, X, Music, Clock, Hash, Trash2, Loader2,
  FilePlus2, ArrowUpDown, SlidersHorizontal, Calendar,
} from "lucide-react";
import { listStudioSessions, deleteStudioSession, type StudioSession } from "../../api/client";

interface SessionBrowserProps {
  open: boolean;
  onClose: () => void;
  onSessionLoad: (session: StudioSession) => void;
  onSessionCreate: (name: string) => void;
  onSessionDelete: (id: string) => void;
}

type SortField = "name" | "updated_at" | "bpm" | "key";

const ICON_MAP: Record<string, string> = {
  audio: "audio",
  midi: "midi",
  drum: "drum",
  bass: "bass",
  lead: "lead",
  vocal: "vocal",
};

export function SessionBrowser({
  open,
  onClose,
  onSessionLoad,
  onSessionCreate,
  onSessionDelete,
}: SessionBrowserProps) {
  const [sessions, setSessions] = useState<StudioSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("updated_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [newSessionName, setNewSessionName] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [bpmMin, setBpmMin] = useState("");
  const [bpmMax, setBpmMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listStudioSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filteredSessions = useMemo(() => {
    let result = [...sessions];

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.key?.toLowerCase().includes(q),
      );
    }

    if (bpmMin) {
      const min = parseInt(bpmMin, 10);
      if (!isNaN(min)) result = result.filter((s) => (s.bpm ?? 0) >= min);
    }
    if (bpmMax) {
      const max = parseInt(bpmMax, 10);
      if (!isNaN(max)) result = result.filter((s) => (s.bpm ?? 0) <= max);
    }

    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      result = result.filter((s) => new Date(s.updated_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime();
      result = result.filter((s) => new Date(s.updated_at).getTime() <= to);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "updated_at":
          cmp =
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
        case "bpm":
          cmp = (a.bpm ?? 0) - (b.bpm ?? 0);
          break;
        case "key":
          cmp = (a.key ?? "").localeCompare(b.key ?? "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [sessions, search, sortField, sortAsc, bpmMin, bpmMax, dateFrom, dateTo]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const toggleSort = useCallback(
    (field: SortField) => {
      setSortField((prev) => {
        if (prev === field) {
          setSortAsc((a) => !a);
          return prev;
        }
        setSortAsc(true);
        return field;
      });
    },
    [],
  );

  const handleDoubleClick = useCallback(
    (session: StudioSession) => {
      onSessionLoad(session);
      onClose();
    },
    [onSessionLoad, onClose],
  );

  const handleDelete = useCallback(
    (id: string) => {
      deleteStudioSession(id).catch(() => {});
      onSessionDelete(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setDeleteConfirm(null);
      if (selectedId === id) setSelectedId(null);
    },
    [onSessionDelete, selectedId],
  );

  const handleCreate = useCallback(() => {
    if (!newSessionName.trim()) return;
    onSessionCreate(newSessionName.trim());
    setNewSessionName("");
    setShowNewDialog(false);
    onClose();
  }, [newSessionName, onSessionCreate, onClose]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getTrackCount = (session: StudioSession) => {
    return session.audio_clips?.length ?? session.recordings?.length ?? 0;
  };

  const formatDuration = (session: StudioSession) => {
    return "0:00";
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 10 }}
            className="bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl w-[820px] max-h-[85vh] flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <Music size={18} className="text-blue-500" />
                <h2 className="text-lg font-bold text-white">Session Browser</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setShowNewDialog(true);
                    setNewSessionName("");
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <FilePlus2 size={14} />
                  New Session
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-800/50">
                <div className="p-4 space-y-3 shrink-0">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                    />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search sessions..."
                      className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-8 py-2 text-sm text-gray-200 placeholder-gray-600 outline-none focus:border-blue-500/50 transition-colors"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => setShowFilters((v) => !v)}
                    className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      showFilters ||
                      bpmMin ||
                      bpmMax ||
                      dateFrom ||
                      dateTo
                        ? "text-blue-400"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    <SlidersHorizontal size={12} />
                    Filters
                    {(bpmMin || bpmMax || dateFrom || dateTo) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                  </button>

                  <AnimatePresence>
                    {showFilters && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                              BPM Min
                            </label>
                            <input
                              type="number"
                              value={bpmMin}
                              onChange={(e) => setBpmMin(e.target.value)}
                              placeholder="Any"
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                              BPM Max
                            </label>
                            <input
                              type="number"
                              value={bpmMax}
                              onChange={(e) => setBpmMax(e.target.value)}
                              placeholder="Any"
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                              From Date
                            </label>
                            <input
                              type="date"
                              value={dateFrom}
                              onChange={(e) => setDateFrom(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50 [color-scheme:dark]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">
                              To Date
                            </label>
                            <input
                              type="date"
                              value={dateTo}
                              onChange={(e) => setDateTo(e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-gray-300 outline-none focus:border-blue-500/50 [color-scheme:dark]"
                            />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center gap-1 text-[10px] text-gray-500">
                    <span className="font-bold uppercase tracking-wider mr-1">
                      Sort
                    </span>
                    {(
                      [
                        { field: "name", label: "Name" },
                        { field: "updated_at", label: "Date" },
                        { field: "bpm", label: "BPM" },
                        { field: "key", label: "Key" },
                      ] as const
                    ).map(({ field, label }) => (
                      <button
                        key={field}
                        onClick={() => toggleSort(field)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg font-bold transition-colors ${
                          sortField === field
                            ? "bg-blue-500/20 text-blue-400"
                            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        {label}
                        {sortField === field && (
                          <ArrowUpDown
                            size={10}
                            className={sortAsc ? "" : "rotate-180"}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 size={24} className="text-blue-500 animate-spin" />
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Music className="w-12 h-12 text-gray-700 mb-3" />
                      <p className="text-gray-400 font-bold text-sm">
                        No sessions found
                      </p>
                      <p className="text-gray-600 text-xs mt-1">
                        {search ||
                        bpmMin ||
                        bpmMax ||
                        dateFrom ||
                        dateTo
                          ? "Try adjusting your filters"
                          : 'Create a new session to get started'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredSessions.map((session) => (
                        <motion.div
                          key={session.id}
                          layout
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                            selectedId === session.id
                              ? "bg-blue-500/10 border border-blue-500/30"
                              : "hover:bg-gray-800/50 border border-transparent"
                          }`}
                          onClick={() => setSelectedId(session.id)}
                          onDoubleClick={() => handleDoubleClick(session)}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor:
                                  selectedId === session.id
                                    ? "#3b82f6"
                                    : "#6b7280",
                              }}
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-gray-200 group-hover:text-white transition-colors truncate">
                                  {session.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-2.5 text-[10px] text-gray-600 mt-0.5">
                                <span className="flex items-center gap-1">
                                  <Hash size={10} />
                                  {session.bpm ?? "--"} BPM
                                </span>
                                <span>{session.key ?? "--"}</span>
                                <span className="flex items-center gap-1">
                                  <Music size={10} />
                                  {getTrackCount(session)} tracks
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock size={10} />
                                  {formatDuration(session)}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-gray-600 font-mono hidden sm:block">
                              {formatDate(session.updated_at)}
                            </span>

                            {deleteConfirm === session.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDelete(session.id)}
                                  className="px-2 py-1 bg-red-500/20 text-red-400 rounded-lg text-[10px] font-bold hover:bg-red-500/30 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  className="px-2 py-1 bg-gray-800 text-gray-400 rounded-lg text-[10px] font-bold hover:text-white transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirm(session.id);
                                }}
                                className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                                title="Delete session"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-64 shrink-0 p-4 flex flex-col">
                {selectedSession ? (
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-white truncate">
                      {selectedSession.name}
                    </h3>

                    <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-3 space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">BPM</span>
                        <span className="text-gray-300 font-mono font-bold">
                          {selectedSession.bpm ?? "--"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Key</span>
                        <span className="text-gray-300 font-mono font-bold">
                          {selectedSession.key ?? "--"}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Tracks</span>
                        <span className="text-gray-300 font-mono font-bold">
                          {getTrackCount(selectedSession)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Duration</span>
                        <span className="text-gray-300 font-mono font-bold">
                          {formatDuration(selectedSession)}
                        </span>
                      </div>
                    </div>

                    <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-3 space-y-2">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Created</span>
                        <span className="text-gray-400">
                          {formatDate(selectedSession.created_at)}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Modified</span>
                        <span className="text-gray-400">
                          {formatDate(selectedSession.updated_at)}
                        </span>
                      </div>
                    </div>

                    {selectedSession.prompt && (
                      <div className="bg-gray-900/50 rounded-xl border border-gray-800/50 p-3">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">
                          Prompt
                        </div>
                        <p className="text-[11px] text-gray-400 line-clamp-3 leading-relaxed">
                          {selectedSession.prompt}
                        </p>
                      </div>
                    )}

                    <button
                      onClick={() => handleDoubleClick(selectedSession)}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 mt-auto"
                    >
                      <Music size={14} />
                      Load Session
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-8">
                    <Music className="w-8 h-8 text-gray-700 mb-2" />
                    <p className="text-gray-500 text-xs font-bold">
                      Select a session
                    </p>
                    <p className="text-gray-700 text-[10px] mt-1">
                      Click to preview, double-click to load
                    </p>
                  </div>
                )}
              </div>
            </div>

            <AnimatePresence>
              {showNewDialog && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl"
                  onClick={(e) => {
                    if (e.target === e.currentTarget) setShowNewDialog(false);
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-80 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-sm font-bold text-white mb-4">
                      New Session
                    </h3>
                    <input
                      value={newSessionName}
                      onChange={(e) => setNewSessionName(e.target.value)}
                      placeholder="Session name"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors mb-4"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreate();
                        if (e.key === "Escape") setShowNewDialog(false);
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowNewDialog(false)}
                        className="flex-1 py-2 bg-gray-800 text-gray-400 hover:text-white rounded-xl text-xs font-bold transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreate}
                        disabled={!newSessionName.trim()}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                      >
                        Create
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
