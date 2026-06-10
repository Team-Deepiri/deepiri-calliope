import { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { Activity, Cpu, Home, Sparkles, Clock, Music } from "lucide-react";
import { DeepiriLogo } from "./DeepiriLogo";
import { getRecentSessions } from "../api/client";

export function TopNav() {
  const [recentOpen, setRecentOpen] = useState(false);
  const [recent, setRecent] = useState<Array<{ id: string; name: string; bpm: number; key: string; track_count: number; updated_at: string }>>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recentOpen) {
      getRecentSessions(5).then(r => setRecent(r.recent)).catch(() => {});
    }
  }, [recentOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setRecentOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="top-nav">
      <NavLink to="/" className="top-nav__brand">
        <DeepiriLogo size={36} />
        <div>
          <div className="top-nav__title">
            Deepiri <span>Calliope</span>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: 2 }}>AI music studio</div>
        </div>
      </NavLink>
      <nav className="top-nav__links">
        <NavLink className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")} to="/">
          <Home size={16} />
          Overview
        </NavLink>
        <NavLink className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")} to="/studio">
          <Sparkles size={16} />
          Studio
        </NavLink>
        <NavLink className={({ isActive }) => "nav-link" + (isActive ? " nav-link--active" : "")} to="/pipeline">
          <Cpu size={16} />
          Pipeline
        </NavLink>
        <a className="nav-link" href="https://github.com/Team-Deepiri" target="_blank" rel="noreferrer">
          <Activity size={16} />
          Org
        </a>
      </nav>

      <div className="flex items-center gap-2 ml-auto" ref={dropdownRef}>
        <div className="relative">
          <button
            onClick={() => setRecentOpen(!recentOpen)}
            className="nav-link flex items-center gap-1.5 text-xs"
          >
            <Clock size={14} />
            Recent
          </button>
          {recentOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="p-3 border-b border-gray-800">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recent Projects</span>
              </div>
              {recent.length === 0 ? (
                <div className="p-4 text-center text-gray-600 text-xs">No recent projects</div>
              ) : (
                <div className="max-h-60 overflow-y-auto">
                  {recent.map(p => (
                    <NavLink
                      key={p.id}
                      to="/studio"
                      className="flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-0"
                    >
                      <Music size={14} className="text-gray-600 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-gray-300 truncate">{p.name}</div>
                        <div className="text-[10px] text-gray-600">{p.bpm} BPM · {p.key} · {p.track_count} tracks</div>
                      </div>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
