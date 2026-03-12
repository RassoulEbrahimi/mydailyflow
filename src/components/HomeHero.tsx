import React, { useMemo, useRef, useLayoutEffect } from 'react';

// ─── Time-aware greeting ───────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 18) return 'Good afternoon';
  return 'Good evening';
}

// ─── Compact progress arc ──────────────────────────────────────────────────────
const MiniRing = ({ percentage, completed, total }: { percentage: number; completed: number; total: number }) => {
  const size   = 64;
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
          <span className="text-[15px] font-bold text-white leading-none">{percentage}%</span>
        </div>
      </div>
      <span className="text-[11px] text-white/50 font-medium leading-none">
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
  /** Whether to pin the hero (position:fixed) while content scrolls */
  stickyEnabled: boolean;
  /**
   * Pixel distance from the top of the viewport to position the fixed hero.
   * Should equal the measured height of the app bar above.
   */
  topOffset?: number;
  /**
   * Callback to report this hero panel's rendered height back to the parent
   * so it can set correct paddingTop on the scrollable content area.
   */
  onHeightChange?: (height: number) => void;
  userName?: string;
}

const HomeHero = ({
  completed,
  total,
  percentage,
  stickyEnabled,
  topOffset = 0,
  onHeightChange,
  userName = 'SolariuS',
}: HomeHeroProps) => {
  const greeting = useMemo(() => getGreeting(), []);
  const dateLabel = useMemo(() =>
    new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date()),
    [],
  );

  const panelRef = useRef<HTMLDivElement>(null);

  // Report panel height whenever it changes (initial render + any resize)
  useLayoutEffect(() => {
    if (!onHeightChange || !panelRef.current) return;
    const ro = new ResizeObserver(() => {
      if (panelRef.current) onHeightChange(panelRef.current.getBoundingClientRect().height);
    });
    ro.observe(panelRef.current);
    onHeightChange(panelRef.current.getBoundingClientRect().height);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const panel = (
    <div
      ref={panelRef}
      className="relative overflow-hidden rounded-b-[2rem] px-5 pt-5 pb-5"
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
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-widest mb-1.5">{dateLabel}</p>
          <h1 className="text-[22px] font-bold text-white leading-tight tracking-tight">
            {greeting},<br />
            <span className="text-primary/90">{userName}!</span>
          </h1>
        </div>
        <MiniRing percentage={percentage} completed={completed} total={total} />
      </div>
    </div>
  );

  if (stickyEnabled) {
    return (
      // Fixed container: pinned just below the app bar (topOffset from parent measurement)
      <div
        className="left-0 right-0 z-20"
        style={{ position: 'fixed', top: topOffset }}
      >
        {panel}
      </div>
    );
  }

  // Non-sticky: normal flow
  return <div>{panel}</div>;
};

export default HomeHero;
