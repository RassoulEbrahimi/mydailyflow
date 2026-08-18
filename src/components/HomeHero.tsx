import React, { useMemo } from 'react';

// ─── Time-aware greeting ───────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Guten Morgen';
  if (hour >= 12 && hour < 18) return 'Guten Tag';
  return 'Guten Abend';
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
          role="img"
          aria-label={`Tagesfortschritt: ${percentage} Prozent, ${completed} von ${total} Aufgaben erledigt`}
        >
          {/* `--ring-track` was never declared — the token is `--color-ring-track`
              — so this stroke resolved to nothing and the ring had no track at
              all. Baseline §10 assigns the fix to this PR. */}
          <circle cx={size / 2} cy={size / 2} r={r} fill="transparent" stroke="var(--color-ring-track)" strokeWidth={stroke} />
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
              <stop offset="0%" stopColor="var(--color-hero-glow)" />
              <stop offset="100%" stopColor="var(--color-primary)" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[13px] font-bold text-fg leading-none" aria-hidden="true">{percentage}%</span>
        </div>
      </div>
      {/* The ring already carries the full figure as its accessible name, so
          this duplicate readout is hidden from assistive technology. */}
      <span className="text-[10px] text-fg-secondary font-medium leading-none mt-0.5" aria-hidden="true">
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
    new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date()),
    [],
  );

  const panel = (
    <div
      className="relative overflow-hidden rounded-b-[2rem] px-5 pt-4 pb-4 hero-gradient"
    >
      {/* Decorative glow blob */}
      <div
        className="pointer-events-none absolute -top-8 -left-8 w-44 h-44 rounded-full opacity-20 hero-glow"
      />
      {/* Content row */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-fg-secondary uppercase tracking-widest mb-1">{dateLabel}</p>
          <h1 className="text-[20px] font-bold text-fg leading-tight tracking-tight">
            {greeting},<br />
            <span className="text-primary-text">{userName}!</span>
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
