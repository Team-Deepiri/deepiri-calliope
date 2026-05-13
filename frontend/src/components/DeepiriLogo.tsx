export function DeepiriLogo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="dg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="dg2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#dg1)" opacity="0.95" />
      <path
        d="M14 34V14h4l8 14V14h4v20h-4L18 20v14h-4z"
        fill="#f8fafc"
        opacity="0.95"
      />
      <path d="M32 10 L38 14 L32 18 Z" fill="url(#dg2)" />
    </svg>
  );
}
