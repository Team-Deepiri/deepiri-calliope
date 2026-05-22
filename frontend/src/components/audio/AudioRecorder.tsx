import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import {
  Mic,
  Square,
  Pause,
  Play,
  Upload,
  Trash2,
  Wand2,
  Settings,
  X,
  Download,
  Music,
  FileAudio,
  FolderOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createRecordingSession,
  uploadRecordingFile,
  listSessionFiles,
  applyAutotune,
  processRecording,
  listPlugins,
} from "../../api/client";
import type {
  RecordingSession,
  RecordingFile,
  PluginInfo,
  AutotuneConfig,
} from "../../types/audio";
import {
  DEFAULT_AUTOTUNE_CONFIG,
  SCALE_TYPES,
  AUTOTUNE_MODES,
  PLUGIN_CATEGORIES,
} from "../../types/audio";
import type { VocalRackPayload } from "../../types/vocalRack";

export type AudioRecorderHandle = {
  toggleRecord: () => void;
  isRecording: () => boolean;
};

async function encodeBlobToWav(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const audio = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const numCh = audio.numberOfChannels;
    const sampleRate = audio.sampleRate;
    const numSamples = audio.length;
    const bytesPerSample = 2;
    const blockAlign = numCh * bytesPerSample;
    const dataSize = numSamples * blockAlign;
    const out = new ArrayBuffer(44 + dataSize);
    const view = new DataView(out);
    let off = 0;
    const writeStr = (s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off++, s.charCodeAt(i));
    };
    const u32 = (v: number) => { view.setUint32(off, v, true); off += 4; };
    const u16 = (v: number) => { view.setUint16(off, v, true); off += 2; };
    writeStr("RIFF");
    u32(36 + dataSize);
    writeStr("WAVE");
    writeStr("fmt ");
    u32(16);
    u16(1);
    u16(numCh);
    u32(sampleRate);
    u32(sampleRate * blockAlign);
    u16(blockAlign);
    u16(16);
    writeStr("data");
    u32(dataSize);
    const channels: Float32Array[] = [];
    for (let c = 0; c < numCh; c++) channels.push(audio.getChannelData(c));
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        off += 2;
      }
    }
    return new Blob([out], { type: "audio/wav" });
  } finally {
    ctx.close();
  }
}

interface AudioRecorderProps {
  variant?: "default" | "daw";
  onRecordingComplete?: (file: RecordingFile, sessionId: string) => void;
  onProcessedAudio?: (outputFile: string, metrics: Record<string, number>) => void;
  onRecordingStateChange?: (recording: boolean) => void;
}

export const AudioRecorder = forwardRef<AudioRecorderHandle, AudioRecorderProps>(function AudioRecorder(
  { variant = "default", onRecordingComplete, onProcessedAudio, onRecordingStateChange },
  ref,
) {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentSession, setCurrentSession] = useState<RecordingSession | null>(null);
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<RecordingFile | null>(null);
  const [showAutotune, setShowAutotune] = useState(false);
  const [showPlugins, setShowPlugins] = useState(false);
  const [autotuneConfig, setAutotuneConfig] = useState<AutotuneConfig>(DEFAULT_AUTOTUNE_CONFIG);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [playingFileId, setPlayingFileId] = useState<string | null>(null);
  const isRecordingRef = useRef(false);
  const audioPlayRef = useRef<HTMLAudioElement | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  useImperativeHandle(ref, () => ({
    toggleRecord: () => {
      if (isRecordingRef.current) stopRecording();
      else void startRecording();
    },
    isRecording: () => isRecordingRef.current,
  }));

  useEffect(() => {
    isRecordingRef.current = isRecording;
    onRecordingStateChange?.(isRecording);
  }, [isRecording, onRecordingStateChange]);

  useEffect(() => {
    loadPlugins();
  }, []);
  
  useEffect(() => {
    if (currentSession) {
      loadSessionFiles();
    }
  }, [currentSession]);
  
  const loadPlugins = async () => {
    try {
      const result = await listPlugins();
      setPlugins(result.plugins);
    } catch (e) {
      console.error("Failed to load plugins:", e);
    }
  };
  
  const loadSessionFiles = async () => {
    if (!currentSession) return;
    try {
      const sessionFiles = await listSessionFiles(currentSession.id);
      setFiles(sessionFiles);
    } catch (e) {
      console.error("Failed to load session files:", e);
    }
  };
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { 
          sampleRate: 48000,
          channelCount: 2,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });
      
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });
      
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        await handleRecordingComplete(blob);
      };
      
      mediaRecorderRef.current.start(100);
      setIsRecording(true);
      setRecordingTime(0);
      
      startVisualization();
      startTimer();
    } catch (e) {
      console.error("Failed to start recording:", e);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      stopVisualization();
      stopTimer();
      
      const tracks = mediaRecorderRef.current.stream?.getTracks();
      tracks?.forEach((track) => track.stop());
    }
  };
  
  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        startVisualization();
        startTimer();
      } else {
        mediaRecorderRef.current.pause();
        stopVisualization();
        stopTimer();
      }
      setIsPaused(!isPaused);
    }
  };
  
  const handleRecordingComplete = async (blob: Blob) => {
    try {
      let session = currentSession;
      if (!session) {
        session = await createRecordingSession("Recording " + new Date().toLocaleTimeString());
        setCurrentSession(session);
      }

      const wavBlob = await encodeBlobToWav(blob);
      const file = new File([wavBlob], "recording.wav", { type: "audio/wav" });

      const result = await uploadRecordingFile(session.id, file, "vocal");

      const newFile: RecordingFile = {
        id: result.recording_id,
        filename: result.filename,
        original_name: "recording.wav",
        format: "wav",
        duration_sec: result.duration_sec,
        track_type: "vocal",
        uploaded_at: new Date().toISOString(),
      };

      setFiles((prev) => [...prev, newFile]);
      setSelectedFile(newFile);
      onRecordingComplete?.(newFile, session.id);
    } catch (e) {
      console.error("Failed to upload recording:", e);
    }
  };
  
  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setRecordingTime((prev) => prev + 1);
    }, 1000);
  };
  
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  
  const startVisualization = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fftSize = analyser.fftSize;
    const freqLen = analyser.frequencyBinCount;
    const timeData = new Uint8Array(fftSize);
    const freqData = new Uint8Array(freqLen);
    const W = canvas.width;
    const H = canvas.height;
    const topH = Math.floor(H * 0.55);
    const botH = H - topH;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      const rec = isRecordingRef.current;

      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      ctx.fillStyle = "#0a0b0e";
      ctx.fillRect(0, 0, W, H);

      // --- waveform (top) ---
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = rec ? "#f2555a" : "#3b5bdb";
      if (rec) {
        ctx.shadowColor = "#f2555a";
        ctx.shadowBlur = 6;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.beginPath();
      const slice = W / fftSize;
      for (let i = 0; i < fftSize; i++) {
        const v = timeData[i] / 128.0;
        const y = (v * topH) / 2;
        if (i === 0) ctx.moveTo(0, y);
        else ctx.lineTo(i * slice, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- frequency bars (bottom) ---
      const barCount = 64;
      const barW = W / barCount - 1;
      const step = Math.floor(freqLen / barCount);
      for (let i = 0; i < barCount; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += freqData[i * step + j];
        const avg = sum / step;
        const barH = (avg / 255) * botH;
        const t = avg / 255;
        const r = Math.round(59 + t * (242 - 59));
        const g = Math.round(91 + t * (85 - 91));
        const b = Math.round(219 + t * (90 - 219));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(i * (barW + 1), H - barH, barW, barH);
      }
    };

    draw();
  };
  
  const stopVisualization = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };
  
  const handleProcess = async (file: RecordingFile) => {
    setIsProcessing(true);
    try {
      const result = await processRecording(file.id, currentSession?.id || "");
      onProcessedAudio?.(result.output_file, result.metrics);
    } catch (e) {
      console.error("Failed to process:", e);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleAutotune = async (file: RecordingFile) => {
    setIsProcessing(true);
    try {
      await applyAutotune(file.id, currentSession?.id || "", autotuneConfig);
      loadSessionFiles();
    } catch (e) {
      console.error("Failed to apply autotune:", e);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };
  
  const ensureSession = async () => {
    if (!currentSession) {
      const session = await createRecordingSession("Session " + new Date().toLocaleTimeString());
      setCurrentSession(session);
      return session;
    }
    return currentSession;
  };
  
  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i)) {
      alert("Please upload an audio file (WAV, MP3, OGG, FLAC, M4A, AAC, or WebM)");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const session = await ensureSession();
      
      setUploadProgress(30);
      const result = await uploadRecordingFile(session.id, file, "vocal");
      
      setUploadProgress(80);
      const newFile: RecordingFile = {
        id: result.recording_id,
        filename: result.filename,
        original_name: file.name,
        format: file.name.split(".").pop()?.toLowerCase() || "audio",
        duration_sec: result.duration_sec,
        track_type: "vocal",
        uploaded_at: new Date().toISOString(),
      };
      
      setUploadProgress(100);
      setFiles((prev) => [...prev, newFile]);
      setSelectedFile(newFile);
      setShowUploadDialog(false);
      onRecordingComplete?.(newFile, session.id);
    } catch (e) {
      console.error("Failed to upload file:", e);
      alert("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const audioFile = files.find((f) => f.type.startsWith("audio/") || f.name.match(/\.(wav|mp3|ogg|flac|m4a|aac|webm)$/i));
    
    if (audioFile) {
      void handleFileUpload(audioFile);
    }
  }, [currentSession]);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);
  
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);
  
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleFileUpload(file);
    }
  }, []);
  
  const handleBrowseFiles = () => {
    fileInputRef.current?.click();
  };
  
  const handleDeleteFile = async (file: RecordingFile) => {
    // Note: would need backend support for delete endpoint
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    if (selectedFile?.id === file.id) {
      setSelectedFile(null);
    }
  };
  
  if (variant === "daw") {
    return (
      <div className="daw-rec">
        <input ref={fileInputRef} type="file" accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm" onChange={handleFileInputChange} hidden />
        <canvas ref={canvasRef} width={800} height={120} className="daw-rec__wave" />
        <div className="daw-rec__controls">
          {isRecording && (
            <div className="daw-rec__status">
              <span className="daw-rec__status-dot" />
              REC
            </div>
          )}
          <span className="daw-rec__time">{formatTime(recordingTime)}</span>
          <div className="daw-rec__actions">
            {!isRecording ? (
              <button type="button" className="daw-rec__btn daw-rec__btn--record" onClick={() => void startRecording()}>
                <Mic size={16} />
                Record
              </button>
            ) : (
              <>
                <button type="button" className="daw-rec__btn daw-rec__btn--icon" onClick={pauseRecording}>
                  {isPaused ? <Play size={16} /> : <Pause size={16} />}
                </button>
                <button type="button" className="daw-rec__btn daw-rec__btn--record" onClick={stopRecording}>
                  <Square size={14} fill="currentColor" />
                  Stop
                </button>
              </>
            )}
            <button type="button" className="daw-rec__btn daw-rec__btn--icon" onClick={handleBrowseFiles} title="Import">
              <Upload size={16} />
            </button>
          </div>
        </div>
        {files.length > 0 && (
          <div className="daw-rec__takes">
            {files.map((file) => (
              <div key={file.id} className={`daw-rec__take${selectedFile?.id === file.id ? " is-selected" : ""}`}>
                <button
                  type="button"
                  className="daw-rec__take-label"
                  onClick={() => setSelectedFile(file)}
                >
                  <Mic size={12} />
                  {file.original_name || file.filename}
                  {file.duration_sec > 0 && (
                    <span className="daw-rec__take-dur">
                      {Math.floor(file.duration_sec / 60).toString().padStart(2, "0")}:{Math.round(file.duration_sec % 60).toString().padStart(2, "0")}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="daw-rec__take-play"
                  title={playingFileId === file.id ? "Stop" : "Play"}
                  onClick={() => {
                    if (playingFileId === file.id) {
                      audioPlayRef.current?.pause();
                      setPlayingFileId(null);
                    } else {
                      const session = currentSession;
                      if (!session) return;
                      const url = `/v1/recordings/sessions/${session.id}/files/${file.id}/download`;
                      if (!audioPlayRef.current) audioPlayRef.current = new Audio();
                      audioPlayRef.current.src = url;
                      audioPlayRef.current.onended = () => setPlayingFileId(null);
                      void audioPlayRef.current.play();
                      setPlayingFileId(file.id);
                    }
                  }}
                >
                  {playingFileId === file.id ? <Square size={11} fill="currentColor" /> : <Play size={11} />}
                </button>
              </div>
            ))}
          </div>
        )}
        {isProcessing && <div className="daw-rec__status">Processing…</div>}
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Vocal Recording Studio
        </h3>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUploadDialog(true)}
            className="p-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            title="Upload Audio Clip"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAutotune(!showAutotune)}
            className={`p-2 rounded-lg transition-colors ${
              showAutotune ? "bg-purple-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            <Wand2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowPlugins(!showPlugins)}
            className={`p-2 rounded-lg transition-colors ${
              showPlugins ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm"
        onChange={handleFileInputChange}
        className="hidden"
      />
      
      <canvas
        ref={canvasRef}
        width={600}
        height={100}
        className="w-full h-24 bg-gray-950 rounded-lg"
      />
      
      <div className="flex items-center justify-center gap-4">
        {!isRecording ? (
          <button
            onClick={startRecording}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium transition-colors"
          >
            <Mic className="w-5 h-5" />
            Start Recording
          </button>
        ) : (
          <>
            <button
              onClick={pauseRecording}
              className="p-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-full transition-colors"
            >
              {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            </button>
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full font-medium transition-colors"
            >
              <Square className="w-5 h-5" />
              Stop ({formatTime(recordingTime)})
            </button>
          </>
        )}
      </div>
      
      <AnimatePresence>
        {showAutotune && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-800 rounded-lg p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-medium flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                Autotune Settings
              </h4>
              <button onClick={() => setShowAutotune(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Mode</label>
                <select
                  value={autotuneConfig.mode}
                  onChange={(e) => setAutotuneConfig({ ...autotuneConfig, mode: e.target.value as any })}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                >
                  {AUTOTUNE_MODES.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label} — {mode.hint}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Scale</label>
                <select
                  value={autotuneConfig.scale_type}
                  onChange={(e) => setAutotuneConfig({ ...autotuneConfig, scale_type: e.target.value as any })}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                >
                  {SCALE_TYPES.map((scale) => (
                    <option key={scale.value} value={scale.value}>
                      {scale.label}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Root (MIDI)</label>
                <input
                  type="number"
                  value={autotuneConfig.root_midi}
                  onChange={(e) => setAutotuneConfig({ ...autotuneConfig, root_midi: parseInt(e.target.value) })}
                  min={0}
                  max={127}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Strength ({autotuneConfig.strength})</label>
                <input
                  type="range"
                  value={autotuneConfig.strength * 100}
                  onChange={(e) => setAutotuneConfig({ ...autotuneConfig, strength: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">Speed ({autotuneConfig.speed})</label>
                <input
                  type="range"
                  value={autotuneConfig.speed * 100}
                  onChange={(e) => setAutotuneConfig({ ...autotuneConfig, speed: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={autotuneConfig.formant_correction}
                  onChange={(e) => setAutotuneConfig({ ...autotuneConfig, formant_correction: e.target.checked })}
                  className="w-4 h-4"
                />
                <label className="text-sm text-gray-400">Formant Correction</label>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <AnimatePresence>
        {showPlugins && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-gray-800 rounded-lg p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-white font-medium flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Plugin Browser ({plugins.length} plugins)
              </h4>
              <button onClick={() => setShowPlugins(false)} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
              {plugins.map((plugin) => (
                <div
                  key={plugin.name}
                  className="bg-gray-700 rounded p-2 text-xs hover:bg-gray-600 cursor-pointer"
                  title={plugin.description}
                >
                  <div className="font-medium text-white truncate">{plugin.name}</div>
                  <div className="text-gray-400">{plugin.category}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {files.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm text-gray-400">Recordings ({files.length})</h4>
          <div className="space-y-2">
            {files.map((file) => (
              <div
                key={file.id}
                className={`flex items-center justify-between bg-gray-800 rounded-lg p-3 cursor-pointer transition-colors ${
                  selectedFile?.id === file.id ? "ring-2 ring-purple-500" : ""
                }`}
                onClick={() => setSelectedFile(file)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-700 rounded flex items-center justify-center">
                    <Mic className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <div className="text-white text-sm font-medium">{file.filename}</div>
                    <div className="text-gray-400 text-xs">{file.duration_sec.toFixed(1)}s</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAutotune(file);
                    }}
                    disabled={isProcessing}
                    className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50"
                    title="Apply Autotune"
                  >
                    <Wand2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleProcess(file);
                    }}
                    disabled={isProcessing}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50"
                    title="Process with Vocal Rack"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {isProcessing && (
        <div className="flex items-center justify-center gap-2 text-purple-400">
          <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          Processing...
        </div>
      )}
      
      <AnimatePresence>
        {showUploadDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
            onClick={() => !isUploading && setShowUploadDialog(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-gray-900 rounded-xl p-6 w-[480px] max-w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <FolderOpen className="w-5 h-5" />
                  Upload Audio Clip
                </h3>
                <button
                  onClick={() => setShowUploadDialog(false)}
                  disabled={isUploading}
                  className="text-gray-400 hover:text-white disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                  dragOver
                    ? "border-green-500 bg-green-900/20"
                    : "border-gray-600 hover:border-gray-500"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.webm"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                
                {isUploading ? (
                  <div className="space-y-4">
                    <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center">
                      <FileAudio className="w-8 h-8 text-green-400 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                      <div className="text-white font-medium">Uploading...</div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div
                          className="bg-green-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-4">
                      <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-300 font-medium mb-2">
                      Drag & drop audio file here
                    </p>
                    <p className="text-gray-500 text-sm mb-4">
                      or
                    </p>
                    <button
                      onClick={handleBrowseFiles}
                      className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                    >
                      Browse Files
                    </button>
                    <p className="text-gray-600 text-xs mt-4">
                      WAV, MP3, OGG, FLAC, M4A, AAC, WebM supported
                    </p>
                  </>
                )}
              </div>
              
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setShowUploadDialog(false)}
                  disabled={isUploading}
                  className="px-4 py-2 bg-gray-800 text-gray-400 rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
