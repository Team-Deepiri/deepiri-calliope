export const GESTURES_STUDIO_IMPORT_KEY = "calliope.gesturesStudioImport";

export type GesturesStudioImport = {
  sessionId: string;
  recordingId: string;
  name: string;
  durationSec: number;
  scoreLabel?: string;
};

export function stashGesturesStudioImport(payload: GesturesStudioImport): void {
  sessionStorage.setItem(GESTURES_STUDIO_IMPORT_KEY, JSON.stringify(payload));
}

export function takeGesturesStudioImport(): GesturesStudioImport | null {
  const raw = sessionStorage.getItem(GESTURES_STUDIO_IMPORT_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(GESTURES_STUDIO_IMPORT_KEY);
  try {
    return JSON.parse(raw) as GesturesStudioImport;
  } catch {
    return null;
  }
}
