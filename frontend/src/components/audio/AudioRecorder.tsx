import { useState, useRef, useEffect, useCallback } from "react";
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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createRecordingSession,
  uploadRecordingFile,
  listSessionFiles,
  applyAutotune,
  processRecording,
  listPlugins,
} from "../api/client";
import type {
  RecordingSession,
  RecordingFile,
  PluginInfo,
  AutotuneConfig,
} from "../types/audio";
import {
  DEFAULT_AUTOTUNE_CONFIG,
  SCALE_TYPES,
  AUTOTUNE_MODES,
  PLUGIN_CATEGORIES,
} from "../types/audio";
import type { VocalRackPayload } from "../types/vocalRack";

interface AudioRecorderProps {
  onRecordingComplete?: (file: RecordingFile, sessionId: string) => void;
  onProcessedAudio?: (outputFile: string, metrics: Record<string, number>) => void;
}

export function AudioRecorder({
  onRecordingComplete,
  onProcessedAudio,
}: AudioRecorderProps) {
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
  const [waveformData, setWaveformData] = useState<number[]>([]);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
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
    if (!currentSession) {
      const session = await createRecordingSession("Recording " + new Date().toLocaleTimeString());
      setCurrentSession(session);
    }
    
    const file = new File([blob], "recording.webm", { type: "audio/webm" });
    
    try {
      const result = await uploadRecordingFile(
        currentSession?.id || "",
        file,
        "vocal"
      );
      
      const newFile: RecordingFile = {
        id: result.recording_id,
        filename: result.filename,
        original_name: "recording.webm",
        format: "webm",
        duration_sec: result.duration_sec,
        track_type: "vocal",
        uploaded_at: new Date().toISOString(),
      };
      
      setFiles((prev) => [...prev, newFile]);
      setSelectedFile(newFile);
      onRecordingComplete?.(newFile, currentSession?.id || "");
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
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      if (!analyser) return;
      
      animationRef.current = requestAnimationFrame(draw);
      
      analyser.getByteTimeDomainData(dataArray);
      
      ctx.fillStyle = "rgb(20, 20, 30)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = isRecording ? "rgb(239, 68, 68)" : "rgb(100, 100, 200)";
      ctx.beginPath();
      
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        
        x += sliceWidth;
      }
      
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      
      const peaks: number[] = [];
      for (let i = 0; i < bufferLength; i += 64) {
        peaks.push((dataArray[i] / 128.0) - 1);
      }
      setWaveformData(peaks);
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
  
  return (
    <div className="bg-gray-900 rounded-xl p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Mic className="w-5 h-5" />
          Vocal Recording Studio
        </h3>
        
        <div className="flex items-center gap-2">
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
    </div>
  );
}