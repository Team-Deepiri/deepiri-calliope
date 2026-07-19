import { useCallback, useEffect, useRef, useState } from "react";
import type { HandSignals } from "./deriveSignals";
import { GestureSynth } from "./gestureSynth";

export function useGestureSynth(signals: HandSignals) {
  const synthRef = useRef<GestureSynth | null>(null);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    synthRef.current = new GestureSynth();
    return () => {
      synthRef.current?.disarm();
      synthRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!armed) return;
    synthRef.current?.apply(signals);
  }, [signals, armed]);

  const arm = useCallback(async () => {
    setError(null);
    try {
      if (!synthRef.current) synthRef.current = new GestureSynth();
      await synthRef.current.arm();
      setArmed(true);
      synthRef.current.apply(signals);
    } catch (e) {
      setArmed(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [signals]);

  const disarm = useCallback(() => {
    synthRef.current?.disarm();
    setArmed(false);
  }, []);

  return { armed, error, arm, disarm };
}
