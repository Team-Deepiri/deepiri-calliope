import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileAudio, Download, X, Loader2, CheckCircle2,
  AlertCircle, ArrowRight, Info,
} from "lucide-react";

interface ConvertFile {
  id: string;
  name: string;
  size: number;
  status: "pending" | "converting" | "done" | "error";
  progress: number;
  sourceFormat: string;
  errorMessage?: string;
}

interface FormatOption {
  value: string;
  label: string;
  extensions: string[];
  qualities: { value: number; label: string }[];
  sampleRates: number[];
}

const FORMATS: Record<string, FormatOption> = {
  wav: {
    value: "wav",
    label: "WAV",
    extensions: [".wav"],
    qualities: [
      { value: 0, label: "16-bit PCM" },
      { value: 1, label: "24-bit PCM" },
      { value: 2, label: "32-bit float" },
    ],
    sampleRates: [44100, 48000, 96000, 192000],
  },
  mp3: {
    value: "mp3",
    label: "MP3",
    extensions: [".mp3"],
    qualities: [
      { value: 0, label: "128 kbps" },
      { value: 1, label: "192 kbps" },
      { value: 2, label: "256 kbps" },
      { value: 3, label: "320 kbps" },
    ],
    sampleRates: [44100, 48000],
  },
  flac: {
    value: "flac",
    label: "FLAC",
    extensions: [".flac"],
    qualities: [
      { value: 0, label: "Compression Level 0 (Fast)" },
      { value: 1, label: "Compression Level 5" },
      { value: 2, label: "Compression Level 8 (Best)" },
    ],
    sampleRates: [44100, 48000, 96000, 192000],
  },
  ogg: {
    value: "ogg",
    label: "OGG",
    extensions: [".ogg"],
    qualities: [
      { value: 0, label: "Quality 0.3" },
      { value: 1, label: "Quality 0.5" },
      { value: 2, label: "Quality 0.7" },
      { value: 3, label: "Quality 1.0" },
    ],
    sampleRates: [44100, 48000],
  },
  aiff: {
    value: "aiff",
    label: "AIFF",
    extensions: [".aiff", ".aif"],
    qualities: [
      { value: 0, label: "16-bit PCM" },
      { value: 1, label: "24-bit PCM" },
      { value: 2, label: "32-bit float" },
    ],
    sampleRates: [44100, 48000, 96000, 192000],
  },
  m4a: {
    value: "m4a",
    label: "M4A",
    extensions: [".m4a"],
    qualities: [
      { value: 0, label: "128 kbps AAC" },
      { value: 1, label: "192 kbps AAC" },
      { value: 2, label: "256 kbps AAC" },
      { value: 3, label: "320 kbps AAC" },
    ],
    sampleRates: [44100, 48000],
  },
  aac: {
    value: "aac",
    label: "AAC",
    extensions: [".aac"],
    qualities: [
      { value: 0, label: "128 kbps" },
      { value: 1, label: "192 kbps" },
      { value: 2, label: "256 kbps" },
      { value: 3, label: "320 kbps" },
    ],
    sampleRates: [44100, 48000],
  },
};

const FORMAT_COMPARISON: Record<string, { size: number; quality: string; useCase: string }> = {
  wav: { size: 10, quality: "Lossless (uncompressed)", useCase: "Editing, archiving" },
  mp3: { size: 1, quality: "Lossy (perceptual)", useCase: "Distribution, streaming" },
  flac: { size: 6, quality: "Lossless (compressed)", useCase: "Archiving, hi-fi" },
  ogg: { size: 1, quality: "Lossy (open)", useCase: "Streaming, gaming" },
  aiff: { size: 10, quality: "Lossless (uncompressed)", useCase: "Pro audio, editing" },
  m4a: { size: 1, quality: "Lossy (AAC)", useCase: "Apple ecosystem" },
  aac: { size: 1, quality: "Lossy (advanced)", useCase: "Streaming, broadcast" },
};

interface FormatConverterProps {
  files?: { name: string; size: number; path?: string }[];
  onConvert?: (fileId: string, targetFormat: string, quality: number, sampleRate: number) => void;
  onDownload?: (fileId: string) => void;
}

export function FormatConverter({
  files: initialFiles,
  onConvert,
  onDownload,
}: FormatConverterProps) {
  const [targetFormat, setTargetFormat] = useState("wav");
  const [quality, setQuality] = useState(0);
  const [sampleRate, setSampleRate] = useState(44100);
  const [files, setFiles] = useState<ConvertFile[]>(
    () =>
      initialFiles?.map((f, i) => ({
        id: `file-${i}`,
        name: f.name,
        size: f.size,
        status: "pending" as const,
        progress: 0,
        sourceFormat: f.name.split(".").pop()?.toUpperCase() ?? "?",
      })) ?? [],
  );

  const currentFormat = FORMATS[targetFormat];
  const comparison = FORMAT_COMPARISON[targetFormat];

  const handleAddFiles = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "audio/*";
    input.onchange = (e) => {
      const fileList = (e.target as HTMLInputElement).files;
      if (!fileList) return;
      const newFiles: ConvertFile[] = Array.from(fileList).map((f, i) => ({
        id: `file-${Date.now()}-${i}`,
        name: f.name,
        size: f.size,
        status: "pending" as const,
        progress: 0,
        sourceFormat: f.name.split(".").pop()?.toUpperCase() ?? "?",
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    };
    input.click();
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const convertAll = useCallback(() => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.status === "pending") {
          onConvert?.(f.id, targetFormat, quality, sampleRate);
          return { ...f, status: "converting" as const, progress: 0 };
        }
        return f;
      }),
    );

    const interval = setInterval(() => {
      setFiles((prev) => {
        const allDone = prev.every((f) => f.status === "done" || f.status === "error");
        if (allDone) clearInterval(interval);

        return prev.map((f) => {
          if (f.status !== "converting") return f;
          const newProgress = Math.min(1, f.progress + Math.random() * 0.15);
          if (newProgress >= 1) {
            return { ...f, progress: 1, status: "done" as const };
          }
          return { ...f, progress: newProgress };
        });
      });
    }, 300);
  }, [targetFormat, quality, sampleRate, onConvert]);

  const formatQualityLabel = currentFormat?.qualities[quality]?.label ?? "Default";

  return (
    <div className="bg-gray-950 rounded-2xl border border-gray-800 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <FileAudio className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-bold text-gray-100">Format Converter</h2>
        </div>
        <motion.button
          onClick={handleAddFiles}
          whileTap={{ scale: 0.95 }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold transition-colors"
        >
          <FileAudio size={12} />
          Add Files
        </motion.button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Format</label>
          <select
            value={targetFormat}
            onChange={(e) => {
              setTargetFormat(e.target.value);
              setQuality(0);
              const fmt = FORMATS[e.target.value];
              if (fmt && fmt.sampleRates.includes(sampleRate)) {
                setSampleRate(fmt.sampleRates[0]);
              }
            }}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-200 px-3 py-2 focus:outline-none focus:border-blue-500/50"
          >
            {Object.values(FORMATS).map((fmt) => (
              <option key={fmt.value} value={fmt.value}>
                {fmt.label} ({fmt.extensions.join(", ")})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Quality</label>
          <select
            value={quality}
            onChange={(e) => setQuality(parseInt(e.target.value))}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-200 px-3 py-2 focus:outline-none focus:border-blue-500/50"
          >
            {currentFormat?.qualities.map((q, i) => (
              <option key={i} value={i}>{q.label}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sample Rate</label>
          <select
            value={sampleRate}
            onChange={(e) => setSampleRate(parseInt(e.target.value))}
            className="w-full bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-200 px-3 py-2 focus:outline-none focus:border-blue-500/50"
          >
            {currentFormat?.sampleRates.map((sr) => (
              <option key={sr} value={sr}>{sr / 1000} kHz</option>
            ))}
          </select>
        </div>
      </div>

      {comparison && (
        <div className="flex items-start gap-2.5 bg-gray-900/50 rounded-xl p-3 border border-gray-800/50">
          <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
          <div className="text-[10px] text-gray-400 space-y-0.5">
            <p>
              <span className="text-gray-300 font-bold">{currentFormat?.label}</span>
              {" — "}{comparison.quality}
            </p>
            <p>Best for: {comparison.useCase}</p>
          </div>
        </div>
      )}

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-400">
                {files.length} file{files.length !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-2">
                <motion.button
                  onClick={convertAll}
                  whileTap={{ scale: 0.95 }}
                  disabled={files.every((f) => f.status === "done" || f.status === "converting")}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ArrowRight size={12} />
                  Convert All
                </motion.button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-3 py-2.5 bg-gray-900/60 rounded-xl border border-gray-800/40"
                >
                  <div className="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                    {file.status === "converting" ? (
                      <Loader2 size={12} className="text-blue-400 animate-spin" />
                    ) : file.status === "done" ? (
                      <CheckCircle2 size={12} className="text-green-400" />
                    ) : file.status === "error" ? (
                      <AlertCircle size={12} className="text-red-400" />
                    ) : (
                      <FileAudio size={12} className="text-gray-400" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-200 truncate">{file.name}</span>
                      <span className="text-[9px] font-mono text-gray-500 shrink-0">
                        ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                    </div>

                    {file.status === "converting" && (
                      <div className="mt-1.5 h-1 bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${file.progress * 100}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}

                    {file.status === "error" && file.errorMessage && (
                      <p className="text-[9px] text-red-400 mt-0.5">{file.errorMessage}</p>
                    )}

                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] font-mono text-gray-600">{file.sourceFormat}</span>
                      <ArrowRight size={8} className="text-gray-600" />
                      <span className="text-[9px] font-mono text-blue-400">{targetFormat.toUpperCase()}</span>
                      <span className="text-[9px] font-mono text-gray-600">· {formatQualityLabel}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {file.status === "done" && (
                      <motion.button
                        onClick={() => onDownload?.(file.id)}
                        whileTap={{ scale: 0.9 }}
                        className="p-1.5 rounded-lg text-green-400 hover:bg-green-500/10"
                        title="Download"
                      >
                        <Download size={12} />
                      </motion.button>
                    )}
                    {file.status === "pending" && (
                      <motion.button
                        onClick={() => removeFile(file.id)}
                        whileTap={{ scale: 0.9 }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10"
                        title="Remove"
                      >
                        <X size={12} />
                      </motion.button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 text-[9px] font-mono text-gray-600">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-700" /> Pending
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" /> Converting
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" /> Done
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" /> Error
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {files.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FileAudio className="w-10 h-10 text-gray-700 mb-3" />
          <p className="text-sm text-gray-500 font-medium">No files added</p>
          <p className="text-xs text-gray-600 mt-1">
            Click "Add Files" to select audio files for conversion
          </p>
        </div>
      )}
    </div>
  );
}
