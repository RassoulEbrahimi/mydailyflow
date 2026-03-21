import React, { useMemo } from 'react';

// ─── Time-aware greeting ───────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Compact progress arc ──────────────────────────────────────────────────────
const MiniRing = ({ percentage, completed, total }: { percentage: number; completed: number; total: number }) => {
  const size   = 54;
  const stroke = 5;
  const r      = (size - stroke) / 2;
  const circ   = 2 * Math.PI * r;
  const offset = circ - (percentage / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="transform -rotate-90"
          viewBox={`0 0 ${size} ${size}`}
        >
          <circle cx={size / 2} cy={size / 2} r={r} fill="transparent" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="transparent"
            stroke="url(#heroRingGradient)"
            strokeWidth={stroke}
            strokeDasharray={circ}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
          <defs>
            <linearGradient id="heroRingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#818cf8" />
              <stop offset="100%" stopColor="#135bec" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[13px] font-bold text-white leading-none">{percentage}%</span>
        </div>
      </div>
      <span className="text-[10px] text-white/50 font-medium leading-none mt-0.5">
        {completed}/{total}
      </span>
    </div>
  );
};

// ─── HomeHero ─────────────────────────────────────────────────────────────────

interface HomeHeroProps {
  completed: number;
  total: number;
  percentage: number;
  /** Whether to pin the hero with CSS sticky while content scrolls */
  stickyEnabled: boolean;
  userName?: string;
}

const HomeHero = ({
  completed,
  total,
  percentage,
  stickyEnabled,
  userName = 'SolariuS',
}: HomeHeroProps) => {
  const greeting = useMemo(() => getGreeting(), []);
  const dateLabel = useMemo(() =>
    new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date()),
    [],
  );

  const panel = (
    <div
      className="relative overflow-hidden rounded-b-[2rem] px-5 pt-4 pb-4"
      style={{
        background: 'linear-gradient(155deg, #1a2644 0%, #111827 60%, #0f1622 100%)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
      }}
    >
      {/* Decorative glow blob */}
      <div
        className="pointer-events-none absolute -top-8 -left-8 w-44 h-44 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #4f46e5 0%, transparent 70%)' }}
      />
      {/* Content row */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-widest mb-1">{dateLabel}</p>
          <h1 className="text-[20px] font-bold text-white leading-tight tracking-tight">
            {greeting},<br />
            <span className="text-primary/90">{userName}!</span>
          </h1>
        </div>
        <MiniRing percentage={percentage} completed={completed} total={total} />
      </div>
    </div>
  );

  if (stickyEnabled) {
    // Sticky container: sticks to top: -1px once the header above it has scrolled out of view.
    // This removes any sub-pixel gap lines above the hero while scrolling.
    return (
      <div
        className="left-0 right-0 z-20"
        style={{ position: 'sticky', top: '-1px' }}
      >
        {panel}
      </div>
    );
  }

  // Non-sticky: normal flow
  return <div>{panel}</div>;
};

export default HomeHero;
