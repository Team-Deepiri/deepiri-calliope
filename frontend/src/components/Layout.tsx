import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontWeight: 700, letterSpacing: "-0.03em", margin: 0 }}>Calliope</h1>
        <p style={{ opacity: 0.75, margin: "0.35rem 0 0" }}>Deepiri AI music workspace</p>
      </header>
      {children}
    </div>
  );
}
