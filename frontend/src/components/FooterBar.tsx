import { DeepiriLogo } from "./DeepiriLogo";

export function FooterBar() {
  return (
    <footer className="footer-bar">
      <div className="footer-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <DeepiriLogo size={28} />
          <span>
            © {new Date().getFullYear()} Team Deepiri · Calliope is Apache-2.0 licensed.
          </span>
        </div>
        <div className="footer-links">
          <a href="https://github.com/Team-Deepiri/deepiri-calliope" target="_blank" rel="noreferrer">
            Repository
          </a>
          <a href="https://github.com/Team-Deepiri/deepiri-platform" target="_blank" rel="noreferrer">
            Platform monorepo
          </a>
        </div>
      </div>
    </footer>
  );
}
