import React, { useMemo } from 'react';

// ─── Time-aware greeting ───────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Guten Morgen';
  if (hour >= 12 && hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

// ─── Compact progress arc ──────────────────────────────────────────────────────
const MiniRing = ({ percentage, completed, total, carried }: { percentage: number; completed: number; total: number; carried: number }) => {
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
          aria-label={`Tagesfortschritt: ${percentage} Prozent, ${completed} von ${total} geplanten Aufgaben erledigt${carried > 0 ? `, ${carried} übernommen` : ''}`}
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
  /** Open tasks automatically carried over from earlier days. */
  carried: number;
  /** Whether to pin the hero with CSS sticky while content scrolls */
  stickyEnabled: boolean;
  userName?: string;
  /**
   * Attached to the outermost element so the shell can measure the pinned
   * height. The shell owns the layout contract (`--mdf-pinned-top`); the hero
   * only reports its own box, and never hard-codes an offset.
   */
  panelRef?: React.Ref<HTMLDivElement>;
}

const HomeHero = ({
  completed,
  total,
  percentage,
  carried,
  stickyEnabled,
  userName = 'SolariuS',
  panelRef,
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
          <p className="mt-1.5 text-[11px] font-medium text-fg-secondary" aria-hidden="true">
            {completed} von {total} geplant{carried > 0 ? ` · ${carried} übernommen` : ''}
          </p>
        </div>
        <MiniRing percentage={percentage} completed={completed} total={total} carried={carried} />
      </div>
    </div>
  );

  if (stickyEnabled) {
    // Sticky container.
    //
    // `top` is -1px so no sub-pixel gap line appears above the hero while
    // scrolling, and it is offset by the top safe-area inset so the pinned
    // surface clears a notch or status bar instead of sliding under it.
    //
    // The wrapper — not just the gradient panel — carries an opaque page
    // background: the panel is `rounded-b-[2rem]`, so without it, content
    // scrolling underneath shows through the two bottom corner arcs.
    return (
      <div
        ref={panelRef}
        className="left-0 right-0 z-20 bg-page"
        style={{ position: 'sticky', top: 'calc(env(safe-area-inset-top, 0px) - 1px)' }}
      >
        {panel}
      </div>
    );
  }

  // Non-sticky: normal flow, and no pinned height for the shell to reserve.
  return <div ref={panelRef}>{panel}</div>;
};

export default HomeHero;
