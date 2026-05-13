import { NavLink } from "react-router-dom";
import { Activity, Cpu, Home, Sparkles } from "lucide-react";
import { DeepiriLogo } from "./DeepiriLogo";

export function TopNav() {
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
    </header>
  );
}
