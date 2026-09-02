import { useEffect, useRef, useState } from "react";
import { fetchHealth } from "../../api/client";

type SplashStage = "boot" | "exit" | "done";

const MIN_SPLASH_MS = 2600;
const HEALTH_TIMEOUT_MS = 2200;

/** Stylized Calliope mark: ring + waveform, drawn via stroke animation. */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle className="splash-logo__ring" cx="60" cy="60" r="46" />
      <path
        className="splash-logo__wave"
        d="M22 60 L34 60 L40 38 L50 82 L58 30 L66 74 L72 52 L80 60 L98 60"
      />
      <circle className="splash-logo__dot" cx="60" cy="60" r="3.5" />
    </svg>
  );
}

const WORDMARK = "CALLIOPE".split("");

export function SplashIntro({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<SplashStage>("boot");
  const [progress, setProgress] = useState(8);
  const [statusLine, setStatusLine] = useState("Waking the pipes…");
  const doneRef = useRef(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Real boot work: backend health (best-effort), padded to a cinematic minimum.
    const health = fetchHealth()
      .then(() => {
        setStatusLine("Backend online");
        return true;
      })
      .catch(() => {
        setStatusLine("Offline mode — local only");
        return false;
      });
    const timeout = new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), HEALTH_TIMEOUT_MS),
    );

    const started = performance.now();
    const tickId = window.setInterval(() => {
      setProgress((p) => Math.min(92, p + 3 + Math.random() * 5));
    }, 90);

    void Promise.race([health, timeout]).then(() => {
      if (cancelled) return;
      const elapsed = performance.now() - started;
      const wait = Math.max(0, MIN_SPLASH_MS - elapsed);
      window.setTimeout(() => {
        if (cancelled) return;
        window.clearInterval(tickId);
        setProgress(100);
        beginExit();
      }, wait);
    });

    function beginExit() {
      if (doneRef.current) return;
      doneRef.current = true;
      setStage("exit");
      exitTimer.current = window.setTimeout(() => {
        if (!cancelled) {
          setStage("done");
          onDone();
        }
      }, 700);
    }

    const skip = (e: KeyboardEvent | MouseEvent) => {
      e.preventDefault();
      window.clearInterval(tickId);
      beginExit();
    };
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);

    return () => {
      cancelled = true;
      window.clearInterval(tickId);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
      if (exitTimer.current != null) window.clearTimeout(exitTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (stage === "done") return null;

  return (
    <div className={`splash${stage === "exit" ? " splash--exit" : ""}`} role="presentation">
      <div className="splash__glow" aria-hidden="true" />
      <div className="splash__center">
        <LogoMark className="splash-logo" />
        <h1 className="splash-wordmark" aria-label="Calliope">
          {WORDMARK.map((ch, i) => (
            <span key={i} style={{ ["--i" as string]: String(i) }}>
              {ch}
            </span>
          ))}
        </h1>
        <p className="splash-tagline">DEEPIRI · AI MUSIC STUDIO</p>
        <div
          className="splash-progress"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="splash-progress__fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="splash-status">{statusLine}</p>
      </div>
      <p className="splash-skip">click anywhere to skip</p>
    </div>
  );
}
