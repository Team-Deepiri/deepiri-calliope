type CameraStageProps = {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  active: boolean;
};

export function CameraStage({ videoRef, canvasRef, active }: CameraStageProps) {
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
      {!active && (
        <div className="gestures-stage__placeholder">
          <span>Camera off</span>
          <small>Start tracking to map your hands to performance signals</small>
        </div>
      )}
    </div>
  );
}
