import type { ArrangementTrack } from "./TimelineView";

export type MixerTrack = ArrangementTrack & {
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
};

type MixerConsoleProps = {
  tracks: MixerTrack[];
  onUpdateTrack: (trackId: string, updates: Partial<MixerTrack>) => void;
};

function ChannelStrip({
  channel,
  busses,
  vcaGroups,
  auxSends,
  onUpdate,
  allChannels,
}: {
  channel: MixerChannel;
  busses: Array<{ id: string; name: string }>;
  vcaGroups: Array<{ id: string; name: string }>;
  auxSends: Array<{ id: string; name: string }>;
  onUpdate: (updates: Partial<MixerChannel>) => void;
  allChannels: MixerChannel[];
}) {
  const [expanded, setExpanded] = useState<Record<SectionKey, boolean>>({ sends: false, routing: false, eq: false });
  const [eqModalOpen, setEqModalOpen] = useState(false);
  const faderRef = useRef<HTMLDivElement>(null);
  const faderStart = useRef({ y: 0, val: 0 });

  const isMaster = channel.type === "master";

  const eqBands = useMemo(() => {
    const freqs = [30, 100, 300, 1000, 3000, 8000, 16000];
    return freqs.map((freq) => {
      const logFreq = Math.log10(freq / 1000);
      const gain = Math.sin(logFreq * Math.PI * 2 + channel.volume * 0.05) * 0.3 + 0.5;
      return { freq, gain: Math.max(0, Math.min(1, gain)) };
    });
  }, [channel.volume]);

  const toggleSection = (key: SectionKey) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleFaderPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isMaster) return;
      e.preventDefault();
      faderStart.current = { y: e.clientY, val: channel.volume };
      const onMove = (ev: PointerEvent) => {
        const dy = faderStart.current.y - ev.clientY;
        const newVal = Math.max(-60, Math.min(6, faderStart.current.val + dy * 0.3));
        onUpdate({ volume: Math.round(newVal * 10) / 10 });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [channel.volume, onUpdate, isMaster],
  );

  const channelLabel = channel.type.charAt(0).toUpperCase() + channel.type.slice(1);

  return (
    <div className="daw-mixer">
      <div className="daw-mixer__head">
        <span className="daw-mixer__title">Mixer</span>
        <span className="daw-mixer__master">Master · −0.3 dBFS</span>
      </div>
      <div className="daw-mixer__strips">
        {tracks.map((track) => {
          const level = Math.min(100, Math.max(12, 55 + track.volume * 2 + (track.solo ? 15 : 0)));
          return (
            <div key={track.id} className="daw-strip">
              <div className="daw-strip__meter">
                <div className="daw-strip__meter-fill" style={{ height: `${level}%` }} />
              </div>
              <div className="daw-strip__fader-wrap">
                <input
                  type="range"
                  className="daw-strip__fader"
                  min={-60}
                  max={6}
                  step={0.1}
                  value={track.volume}
                  onChange={(e) => onUpdateTrack(track.id, { volume: parseFloat(e.target.value) })}
                  aria-label={`${track.name} volume`}
                />
              </div>
              <div className="daw-strip__btns">
                <button
                  type="button"
                  className={`daw-strip__btn${track.muted ? " is-on-mute" : ""}`}
                  onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                >
                  M
                </button>
                <button
                  type="button"
                  className={`daw-strip__btn${track.solo ? " is-on-solo" : ""}`}
                  onClick={() => onUpdateTrack(track.id, { solo: !track.solo })}
                >
                  S
                </button>
              </div>
              <span className="daw-strip__name" title={track.name}>
                {track.name}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mixer-strips-container flex gap-2 overflow-x-auto pb-2 custom-scrollbar items-start">
        {audioChannels.map((channel) => (
          <ChannelStrip
            key={channel.id}
            channel={channel}
            busses={busses}
            vcaGroups={vcaGroups}
            auxSends={auxSends}
            onUpdate={(updates) => onUpdateChannel(channel.id, updates)}
            allChannels={channels}
          />
        ))}

        {masterChannel && (
          <div className="shrink-0 pl-2 border-l border-gray-800/50 ml-1">
            <ChannelStrip
              channel={masterChannel}
              busses={[]}
              vcaGroups={[]}
              auxSends={[]}
              onUpdate={(updates) => onUpdateChannel(masterChannel.id, updates)}
              allChannels={channels}
            />
          </div>
        )}
      </div>
    </div>
  );
}
