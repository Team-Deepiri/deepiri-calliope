import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Home } from "./pages/Home";
import { Studio } from "./pages/Studio";
import { Gestures } from "./pages/Gestures";
import { Pipeline } from "./pages/Pipeline";
import { Setup } from "./pages/Setup";
import { isDesktopRuntime, runPreflight } from "./desktop/preflight";

function DesktopGate({ children }: { children: ReactNode }) {
  const desktop = isDesktopRuntime();
  const [ready, setReady] = useState<boolean | null>(desktop ? null : true);

  useEffect(() => {
    if (!desktop) return;
    void (async () => {
      try {
        const result = await runPreflight();
        setReady(result.allRequiredPassed && result.apiHealthy);
      } catch {
        setReady(false);
      }
    })();
  }, [desktop]);

  if (!desktop) return <>{children}</>;
  if (ready !== true) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DesktopGate><Home /></DesktopGate>} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/studio" element={<DesktopGate><Studio /></DesktopGate>} />
        <Route path="/gestures" element={<DesktopGate><Gestures /></DesktopGate>} />
        <Route path="/pipeline" element={<DesktopGate><Pipeline /></DesktopGate>} />
      </Routes>
    </AppShell>
  );
}
