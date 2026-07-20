import { useCallback, useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import {
  deriveStereoHandSignals,
  EMPTY_SIGNALS,
  type HandSignals,
  type Landmark,
} from "./deriveSignals";

const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const HAND_COLORS: Record<"Left" | "Right" | "Unknown", { line: string; point: string; fill: string }> = {
  Left: { line: "#34d399", point: "#2dd4bf", fill: "#14b8a6" },
  Right: { line: "#818cf8", point: "#f97316", fill: "#f59e0b" },
  Unknown: { line: "#94a3b8", point: "#cbd5e1", fill: "#64748b" },
};

export type TrackerStatus = "idle" | "starting" | "running" | "error";

export type HandTrackerState = {
  status: TrackerStatus;
  error: string | null;
  signals: HandSignals;
  left: HandSignals;
  right: HandSignals;
  hands: HandSignals[];
  fps: number;
};

type UseHandTrackerOptions = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Unordered hands (legacy). Prefer onStereoHands for composition. */
  onHands?: (hands: Landmark[][]) => void;
  /** Stable Left/Right landmark slots for pose detection. */
  onStereoHands?: (left: Landmark[] | null, right: Landmark[] | null) => void;
  /** Fired every tracking frame with stable Left/Right signal slots (instrument). */
  onStereoFrame?: (left: HandSignals, right: HandSignals) => void;
};

export function useHandTracker({
  videoRef,
  canvasRef,
  onHands,
  onStereoHands,
  onStereoFrame,
}: UseHandTrackerOptions) {
  const [state, setState] = useState<HandTrackerState>({
    status: "idle",
    error: null,
    signals: { ...EMPTY_SIGNALS },
    left: { ...EMPTY_SIGNALS, label: "Left" },
    right: { ...EMPTY_SIGNALS, label: "Right" },
    hands: [],
    fps: 0,
  });

  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const runningRef = useRef(false);
  const lastTsRef = useRef(-1);
  const fpsAccRef = useRef({ frames: 0, t0: 0 });
  const onHandsRef = useRef(onHands);
  const onStereoHandsRef = useRef(onStereoHands);
  const onStereoRef = useRef(onStereoFrame);
  onHandsRef.current = onHands;
  onStereoHandsRef.current = onStereoHands;
  onStereoRef.current = onStereoFrame;

  const stop = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
    setState({
      status: "idle",
      error: null,
      signals: { ...EMPTY_SIGNALS },
      left: { ...EMPTY_SIGNALS, label: "Left" },
      right: { ...EMPTY_SIGNALS, label: "Right" },
      hands: [],
      fps: 0,
    });
  }, [videoRef, canvasRef]);

  const start = useCallback(async () => {
    if (runningRef.current) return;
    setState((s) => ({ ...s, status: "starting", error: null }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error("Video element missing");

      video.srcObject = stream;
      await video.play();

      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      let landmarker: HandLandmarker;
      try {
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      } catch {
        landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "CPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
        });
      }
      landmarkerRef.current = landmarker;
      runningRef.current = true;
      lastTsRef.current = -1;
      fpsAccRef.current = { frames: 0, t0: performance.now() };
      setState((s) => ({ ...s, status: "running", error: null }));

      let drawer: DrawingUtils | null = null;

      const loop = () => {
        if (!runningRef.current) return;
        const v = videoRef.current;
        const c = canvasRef.current;
        const lm = landmarkerRef.current;
        if (!v || !c || !lm || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        if (c.width !== v.videoWidth || c.height !== v.videoHeight) {
          c.width = v.videoWidth;
          c.height = v.videoHeight;
          drawer = null;
        }

        const now = performance.now();
        if (now <= lastTsRef.current) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        lastTsRef.current = now;

        const result = lm.detectForVideo(v, now);
        const rawHands = result.landmarks ?? [];
        const handedness = (result.handedness ?? []) as Array<Array<{ categoryName?: string; score?: number }>>;
        const { left, right, list, leftLandmarks, rightLandmarks } = deriveStereoHandSignals(
          rawHands as Landmark[][],
          handedness,
        );

        const ctx = c.getContext("2d");
        if (ctx) {
          if (!drawer) drawer = new DrawingUtils(ctx);
          ctx.clearRect(0, 0, c.width, c.height);
          rawHands.forEach((hand, i) => {
            const name = handedness[i]?.[0]?.categoryName;
            const side: "Left" | "Right" | "Unknown" =
              name === "Left" || name === "Right"
                ? name
                : (() => {
                    const wristX = hand[0]?.x ?? 0.5;
                    const otherX = rawHands.find((_, j) => j !== i)?.[0]?.x;
                    if (otherX == null) return wristX >= 0.5 ? "Left" : "Right";
                    return wristX >= otherX ? "Left" : "Right";
                  })();
            const colors = HAND_COLORS[side];
            drawer!.drawConnectors(hand, HandLandmarker.HAND_CONNECTIONS, {
              color: colors.line,
              lineWidth: 3,
            });
            drawer!.drawLandmarks(hand, {
              color: colors.point,
              fillColor: colors.fill,
              lineWidth: 1,
              radius: 4,
            });
          });
        }

        onStereoHandsRef.current?.(leftLandmarks, rightLandmarks);
        onHandsRef.current?.(rawHands as Landmark[][]);
        onStereoRef.current?.(left, right);

        fpsAccRef.current.frames += 1;
        const elapsed = now - fpsAccRef.current.t0;
        let fps = 0;
        if (elapsed >= 500) {
          fps = Math.round((fpsAccRef.current.frames * 1000) / elapsed);
          fpsAccRef.current = { frames: 0, t0: now };
        }

        const signals = left.detected && right.detected
          ? {
              detected: true,
              label: "Unknown" as const,
              height: (left.height + right.height) / 2,
              pinch: Math.min(left.pinch, right.pinch),
              openness: (left.openness + right.openness) / 2,
              fist: left.fist && right.fist,
            }
          : left.detected
            ? left
            : right.detected
              ? right
              : EMPTY_SIGNALS;

        setState((s) => ({
          ...s,
          signals,
          left,
          right,
          hands: list.filter((h) => h.detected),
          fps: fps || s.fps,
          status: "running",
        }));

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    } catch (e) {
      stop();
      const message = e instanceof Error ? e.message : String(e);
      setState({
        status: "error",
        error: message,
        signals: { ...EMPTY_SIGNALS },
        left: { ...EMPTY_SIGNALS, label: "Left" },
        right: { ...EMPTY_SIGNALS, label: "Right" },
        hands: [],
        fps: 0,
      });
    }
  }, [videoRef, canvasRef, stop]);

  useEffect(() => () => stop(), [stop]);

  return { ...state, start, stop };
}
