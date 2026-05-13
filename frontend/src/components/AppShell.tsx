import type { ReactNode } from "react";
import { TopNav } from "./TopNav";
import { FooterBar } from "./FooterBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <div className="app-shell__backdrop" aria-hidden>
        <div className="animated-bg" style={{ position: "absolute", inset: 0, opacity: 0.35 }} />
        <div className="bg-pattern-overlay" style={{ position: "absolute", inset: 0, opacity: 0.4 }} />
        <div className="orb orb-a" />
        <div className="orb orb-b" />
        <div className="orb orb-c" />
      </div>
      <TopNav />
      <div className="app-shell__main">
        <div className="site-container">{children}</div>
      </div>
      <FooterBar />
    </div>
  );
}
