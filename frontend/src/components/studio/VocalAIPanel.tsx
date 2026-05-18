import React, { useState } from "react";
import { motion } from "framer-motion";
import { Mic2, Music2, Sparkles, Send } from "lucide-react";

export function VocalAIPanel() {
  const [lyrics, setLyrics] = useState("Floating through the neon sky, AI singing high");
  const [voice, setVoice] = useState("soprano");
  const [tuning, setTuning] = useState(0.8);
  const [generating, setGenerating] = useState(false);

  return (
    <div className="vocal-ai-panel bg-gray-950 p-8 rounded-3xl border border-gray-800 shadow-2xl space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-3 bg-red-500/10 rounded-2xl">
          <Mic2 className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">AI Vocal Synthesis</h2>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest">Neural SVS Engine v3.5</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Lyrics / Prompt</label>
        <textarea
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
          className="w-full bg-black/50 border border-gray-800 rounded-2xl p-6 text-gray-200 focus:border-red-500 outline-none transition-colors min-h-[120px]"
          placeholder="Enter lyrics for the AI to sing..."
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4">
           <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">AI Voice Model</label>
            <select 
              value={voice} 
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-gray-900 border border-gray-800 rounded-xl p-3 text-white font-bold"
            >
              <option value="soprano">Soprano (Aura)</option>
              <option value="tenor">Tenor (Atlas)</option>
              <option value="alt">Alt (Nova)</option>
              <option value="custom">Custom (Upload RVC...)</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
           <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Neural Tuning Strength</label>
            <div className="flex items-center gap-4">
              <input 
                type="range" 
                min="0" max="1" step="0.01" 
                value={tuning} 
                onChange={(e) => setTuning(parseFloat(e.target.value))}
                className="flex-1 h-1 bg-gray-800 appearance-none rounded-full accent-red-500"
              />
              <span className="text-red-500 font-mono text-sm">{(tuning * 100).toFixed(0)}%</span>
            </div>
          </div>
        </div>
      </div>

      <button 
        onClick={() => setGenerating(true)}
        disabled={generating}
        className="w-full bg-gradient-to-r from-red-600 to-pink-600 text-white font-black py-5 rounded-2xl shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-3"
      >
        {generating ? (
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          >
            <Sparkles size={20} />
          </motion.div>
        ) : <Send size={20} />}
        {generating ? "SYNTHESIZING NEURAL VOCALS..." : "GENERATE AI VOCAL TRACK"}
      </button>

      <div className="bg-gray-900/30 p-4 rounded-2xl border border-gray-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] font-bold text-gray-500 uppercase">Neural Vocoder Active</span>
        </div>
        <div className="text-[10px] font-bold text-gray-600 uppercase">Latency: 142ms</div>
      </div>
    </div>
  );
}
