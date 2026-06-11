import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FileAudio, Download, FolderOpen, Music, Sigma,
  ChevronDown, Loader2,
} from "lucide-react";

type ExportFormat = "wav" | "mp3" | "flac" | "ogg" | "aiff" | "m4a";
type ExportRange = "full" | "loop" | "markers";
type SampleRate = 44100 | 48000 | 88200 | 96000;
type BitDepth = 16 | 24 | 32;

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
  sessionName: string;
  trackCount: number;
  duration: number;
}

interface ExportOptions {
  format: ExportFormat;
  sampleRate: SampleRate;
  bitDepth: BitDepth;
  bitrate?: number;
  range: ExportRange;
  stemExport: boolean;
  normalize: boolean;
  lufsTarget: number;
  dithering: boolean;
  fileNameTemplate: string;
  outputDir: string;
}

const FORMAT_CONFIG: Record<ExportFormat, { label: string; ext: string; lossy: boolean }> = {
  wav: { label: "WAV", ext: ".wav", lossy: false },
  mp3: { label: "MP3", ext: ".mp3", lossy: true },
  flac: { label: "FLAC", ext: ".flac", lossy: false },
  ogg: { label: "OGG", ext: ".ogg", lossy: true },
  aiff: { label: "AIFF", ext: ".aiff", lossy: false },
  m4a: { label: "M4A", ext: ".m4a", lossy: true },
};

const BITRATE_OPTIONS = [128, 192, 256, 320];

export function ExportDialog({ open, onClose, onExport, sessionName, trackCount, duration }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("wav");
  const [sampleRate, setSampleRate] = useState<SampleRate>(48000);
  const [bitDepth, setBitDepth] = useState<BitDepth>(24);
  const [bitrate, setBitrate] = useState(320);
  const [range, setRange] = useState<ExportRange>("full");
  const [stemExport, setStemExport] = useState(false);
  const [normalize, setNormalize] = useState(false);
  const [lufsTarget, setLufsTarget] = useState(-14);
  const [dithering, setDithering] = useState(true);
  const [fileNameTemplate, setFileNameTemplate] = useState("{session}_mixdown");
  const [outputDir, setOutputDir] = useState("~/Exports");
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const config = FORMAT_CONFIG[format];

  const estimatedFileSize = useCallback(() => {
    const durationSec = duration || 120;
    if (config.lossy) {
      return (bitrate * 1000 / 8) * durationSec / (1024 * 1024);
    }
    return sampleRate * (bitDepth / 8) * 2 * durationSec / (1024 * 1024);
  }, [format, sampleRate, bitDepth, bitrate, duration, config]);

  const handleExport = useCallback(() => {
    setRendering(true);
    setProgress(0);
    const startTime = Date.now();

    progressRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = Math.min(99, prev + Math.random() * 8);
        const elapsed = (Date.now() - startTime) / 1000;
        setTimeRemaining(elapsed / (next / 100) - elapsed);
        return next;
      });
    }, 200);

    const options: ExportOptions = {
      format, sampleRate, bitDepth, bitrate: config.lossy ? bitrate : undefined,
      range, stemExport, normalize, lufsTarget, dithering, fileNameTemplate, outputDir,
    };

    setTimeout(() => {
      if (progressRef.current) clearInterval(progressRef.current);
      setProgress(100);
      setTimeRemaining(0);
      setTimeout(() => {
        setRendering(false);
        onExport(options);
        onClose();
      }, 500);
    }, 3000);
  }, [format, sampleRate, bitDepth, bitrate, config, range, stemExport, normalize, lufsTarget, dithering, fileNameTemplate, outputDir, onExport, onClose]);

  useEffect(() => {
    if (!open) {
      setRendering(false);
      setProgress(0);
      if (progressRef.current) clearInterval(progressRef.current);
    }
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [open]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !rendering) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, rendering, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget && !rendering) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-gray-950 border border-gray-800 rounded-3xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <FileAudio size={18} className="text-blue-500" />
                <h2 className="text-lg font-bold text-white">Export Mixdown</h2>
              </div>
              <button
                onClick={onClose}
                disabled={rendering}
                className="p-1.5 rounded-lg bg-gray-800 text-gray-500 hover:text-white transition-all disabled:opacity-30"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Format */}
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(FORMAT_CONFIG) as ExportFormat[]).map((fmt) => {
                  const cfg = FORMAT_CONFIG[fmt];
                  return (
                    <button
                      key={fmt}
                      onClick={() => { setFormat(fmt); if (!cfg.lossy) setBitrate(0); }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                        format === fmt
                          ? "bg-blue-600 text-white shadow-sm border border-blue-500"
                          : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                      }`}
                    >
                      <div>{cfg.label}</div>
                      <div className="text-[8px] font-normal opacity-60">{cfg.ext}</div>
                    </button>
                  );
                })}
              </div>

              {/* Sample Rate & Bit Depth */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Sample Rate</label>
                  <select
                    value={sampleRate}
                    onChange={(e) => setSampleRate(parseInt(e.target.value) as SampleRate)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-300 px-3 py-2 outline-none"
                  >
                    <option value={44100}>44.1 kHz</option>
                    <option value={48000}>48 kHz</option>
                    <option value={88200}>88.2 kHz</option>
                    <option value={96000}>96 kHz</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bit Depth</label>
                  <select
                    value={bitDepth}
                    onChange={(e) => setBitDepth(parseInt(e.target.value) as BitDepth)}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-300 px-3 py-2 outline-none"
                  >
                    <option value={16}>16-bit</option>
                    <option value={24}>24-bit</option>
                    <option value={32}>32-bit float</option>
                  </select>
                </div>
              </div>

              {/* Bitrate (lossy only) */}
              {config.lossy && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Bitrate</label>
                  <div className="flex gap-2">
                    {BITRATE_OPTIONS.map((br) => (
                      <button
                        key={br}
                        onClick={() => setBitrate(br)}
                        className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          bitrate === br
                            ? "bg-blue-600 text-white"
                            : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                        }`}
                      >
                        {br} kbps
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Export Range */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Export Range</label>
                <div className="flex gap-2">
                  {([{ value: "full", label: "Full Song" }, { value: "loop", label: "Loop Region" }, { value: "markers", label: "Between Markers" }] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setRange(opt.value)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        range === opt.value
                          ? "bg-blue-600 text-white"
                          : "bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3 bg-gray-900/50 rounded-xl border border-gray-800/50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Stem Export (individual tracks)</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={stemExport} onChange={(e) => setStemExport(e.target.checked)} className="sr-only peer" />
                    <div className="w-8 h-4 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Normalize to LUFS target</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={normalize} onChange={(e) => setNormalize(e.target.checked)} className="sr-only peer" />
                    <div className="w-8 h-4 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
                  </label>
                </div>
                {normalize && (
                  <div className="flex items-center gap-2 pl-4">
                    <span className="text-[9px] text-gray-500">Target:</span>
                    <input
                      type="number"
                      value={lufsTarget}
                      onChange={(e) => setLufsTarget(parseInt(e.target.value))}
                      className="w-16 bg-gray-800 border border-gray-700 rounded text-xs text-white text-center font-mono py-0.5 outline-none"
                    />
                    <span className="text-[9px] text-gray-500">LUFS</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">Dithering</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={dithering} onChange={(e) => setDithering(e.target.checked)} className="sr-only peer" />
                    <div className="w-8 h-4 bg-gray-800 rounded-full peer peer-checked:bg-blue-600 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all" />
                  </label>
                </div>
              </div>

              {/* File name template */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">File Name</label>
                <input
                  value={fileNameTemplate}
                  onChange={(e) => setFileNameTemplate(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-300 px-3 py-2 outline-none font-mono"
                  placeholder="{session}_mixdown"
                />
              </div>

              {/* Output directory */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Output Directory</label>
                <div className="flex gap-2">
                  <input
                    value={outputDir}
                    onChange={(e) => setOutputDir(e.target.value)}
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-xl text-xs text-gray-300 px-3 py-2 outline-none font-mono"
                  />
                  <button className="p-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-500 hover:text-white transition-all">
                    <FolderOpen size={14} />
                  </button>
                </div>
              </div>

              {/* Estimated size */}
              <div className="flex items-center gap-2 text-[9px] text-gray-600 bg-gray-900/50 px-3 py-2 rounded-xl">
                <Sigma size={10} />
                <span>Estimated size: <span className="font-mono text-gray-400">{estimatedFileSize().toFixed(1)} MB</span></span>
                <span className="ml-auto">Duration: <span className="font-mono text-gray-400">{Math.floor((duration || 120) / 60)}:{(duration || 120) % 60 < 10 ? "0" : ""}{(duration || 120) % 60}</span></span>
              </div>

              {/* Progress bar */}
              {rendering && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-blue-400 font-bold flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      Rendering...
                    </span>
                    <span className="font-mono text-gray-500">{Math.round(progress)}%</span>
                  </div>
                  <div className="h-2 bg-gray-900 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  {timeRemaining > 0 && (
                    <div className="text-[9px] font-mono text-gray-600 text-right">
                      ~{Math.round(timeRemaining)}s remaining
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-gray-950/50">
              <div className="text-[10px] text-gray-600">
                {trackCount} tracks · {config.label} output
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={rendering}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-gray-900 text-gray-400 hover:text-white border border-gray-800 transition-all disabled:opacity-30"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={rendering}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 text-white hover:bg-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {rendering ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                  {rendering ? "Rendering..." : "Export"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
