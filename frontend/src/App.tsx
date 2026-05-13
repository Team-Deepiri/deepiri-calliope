import { Link, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { Studio } from "./pages/Studio";
import { Layout } from "./components/Layout";

export default function App() {
  return (
    <Layout>
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <Link to="/">Home</Link>
        <Link to="/studio">Studio</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/studio" element={<Studio />} />
      </Routes>
    </Layout>
  );
}
