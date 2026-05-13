import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { Home } from "./pages/Home";
import { Studio } from "./pages/Studio";
import { Pipeline } from "./pages/Pipeline";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/studio" element={<Studio />} />
        <Route path="/pipeline" element={<Pipeline />} />
      </Routes>
    </AppShell>
  );
}
