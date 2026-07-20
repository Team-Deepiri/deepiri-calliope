import { useCallback, useEffect, useRef, useState } from "react";
import type { HandSignals } from "./deriveSignals";
import { EMPTY_SIGNALS } from "./deriveSignals";
import { GestureSynth } from "./gestureSynth";

/**
 * Live instrument preview. Call `onFrame(left, right)` from the tracker loop
 * so both voices update at camera rate (not React render rate).
 */
export function useGestureSynth(muted = false) {
  const synthRef = useRef<GestureSynth | null>(null);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const armedRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  armedRef.current = armed;

  useEffect(() => {
    synthRef.current = new GestureSynth();
    return () => {
      synthRef.current?.disarm();
      synthRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!armed) return;
    if (muted) {
      synthRef.current?.applyStereo(EMPTY_SIGNALS, EMPTY_SIGNALS);
    }
  }, [muted, armed]);

  const onFrame = useCallback((left: HandSignals, right: HandSignals) => {
    if (!armedRef.current || mutedRef.current) return;
    synthRef.current?.applyStereo(left, right);
  }, []);

  const arm = useCallback(async () => {
    setError(null);
    try {
      if (!synthRef.current) synthRef.current = new GestureSynth();
      await synthRef.current.arm();
      armedRef.current = true;
      setArmed(true);
    } catch (e) {
      armedRef.current = false;
      setArmed(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const disarm = useCallback(() => {
    synthRef.current?.disarm();
    armedRef.current = false;
    setArmed(false);
  }, []);

  return { armed, error, arm, disarm, onFrame };
}
