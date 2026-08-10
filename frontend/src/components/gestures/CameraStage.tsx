type CameraStageProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  active: boolean;
  children?: React.ReactNode;
};

export function CameraStage({ videoRef, canvasRef, active, children }: CameraStageProps) {
  return (
    <div className={"gestures-stage" + (active ? " gestures-stage--live" : "")}>
      <video
        ref={videoRef as React.RefObject<HTMLVideoElement>}
        className="gestures-stage__video"
        playsInline
        muted
        autoPlay
      />
      <canvas
        ref={canvasRef as React.RefObject<HTMLCanvasElement>}
        className="gestures-stage__canvas"
      />
      {children ? <div className="gestures-stage__overlay">{children}</div> : null}
      {!active && (
        <div className="gestures-stage__placeholder">
          <span>Orchestra dark</span>
          <small>Start tracking to light the stage — your camera stays hidden</small>
        </div>
      )}
    </div>
  );
}
