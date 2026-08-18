import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Settings, Check, Droplets } from 'lucide-react';
import type { DailyEssential } from '../types/essential';

interface DailyEssentialsSectionProps {
  essentials: DailyEssential[];
  progressById: Record<string, number>;
  onUpdateProgress: (id: string, progress: number) => void;
  onManageClick: () => void;
}

export default function DailyEssentialsSection({
  essentials,
  progressById,
  onUpdateProgress,
  onManageClick
}: DailyEssentialsSectionProps) {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('myDailyFlow_essentialsCollapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('myDailyFlow_essentialsCollapsed', String(isCollapsed));
  }, [isCollapsed]);

  const completedCount = essentials.filter(e => {
    const p = progressById[e.id] || 0;
    return p >= e.targetCount;
  }).length;
  const totalCount = essentials.length;

  return (
    <section className="px-5 pt-3 pb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <button
          type="button"
          className="flex items-center gap-2 select-none min-w-0 min-h-11 text-left"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-expanded={!isCollapsed}
          aria-label={`Tägliche Essentials, ${completedCount} von ${totalCount} erledigt`}
        >
          <div className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full bg-primary-surface text-primary-text" aria-hidden="true">
            <Droplets size={16} strokeWidth={2.5} />
          </div>
          <h2 className="text-[16px] font-bold text-fg tracking-tight truncate">Tägliche Essentials</h2>
          <span className="text-[13px] font-medium text-fg-secondary bg-surface-raised px-2 py-0.5 rounded-full flex-shrink-0">
            {completedCount}/{totalCount}
          </span>
          {isCollapsed ? (
            <ChevronDown size={18} className="text-fg-secondary flex-shrink-0" aria-hidden="true" />
          ) : (
            <ChevronUp size={18} className="text-fg-secondary flex-shrink-0" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onManageClick}
          className="text-primary-text hover:opacity-80 min-w-11 min-h-11 rounded-md hover:bg-primary-surface transition-colors flex items-center justify-center flex-shrink-0"
          aria-label="Essentials verwalten"
        >
          <Settings size={18} aria-hidden="true" />
        </button>
      </div>

      {/* List */}
      {!isCollapsed && (
        <div className="flex flex-col gap-2.5 bg-surface-dim p-3 rounded-[16px] border border-edge/50 shadow-sm">
          {essentials.length === 0 ? (
            <div className="text-center py-4 text-fg-secondary text-[14px]">
              Noch keine Essentials.{' '}
              <button
                type="button"
                onClick={onManageClick}
                className="text-primary-text font-semibold underline underline-offset-2 min-h-11 px-1"
              >
                Hinzufügen
              </button>
            </div>
          ) : (
            essentials.map(essential => {
              const progress = progressById[essential.id] || 0;
              const isDone = progress >= essential.targetCount;
              const isSimple = essential.targetCount === 1;

              if (isSimple) {
              return (
                <button
                  type="button"
                  key={essential.id}
                  onClick={() => onUpdateProgress(essential.id, isDone ? 0 : 1)}
                  role="checkbox"
                  aria-checked={isDone}
                  className={`w-full text-left flex items-center justify-between gap-3 p-3 min-h-11 rounded-xl transition-all active:scale-[0.98] ${
                    isDone 
                      ? 'bg-primary-surface border border-primary-border'
                      : 'bg-surface-raised border border-transparent hover:border-edge-subtle'
                  }`}
                >
                  <span
                    dir="auto"
                    className={`text-[15px] font-medium transition-colors ${
                      isDone ? 'text-fg line-through opacity-70' : 'text-fg'
                    }`}
                  >
                    {essential.title}
                  </span>
                  <div className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isDone ? 'bg-primary border-primary text-white' : 'border-edge-strong text-transparent'
                  }`} aria-hidden="true">
                    <Check size={14} strokeWidth={3} />
                  </div>
                </button>
              );
            }

            return (
              // Stacked, not side-by-side. Five 44x44 counters need 244px plus
              // their container padding; at 360 the row only offers ~272px
              // inside the card, which leaves nothing for the title. Putting the
              // counters on their own full-width line below the title is what
              // makes 44x44 fit at the narrowest supported width, and `flex-wrap`
              // covers targets above five without ever overflowing the card.
              <div
                key={essential.id}
                className={`flex flex-col gap-2 p-3 rounded-xl transition-all ${
                    isDone 
                      ? 'bg-primary-surface border border-primary-border'
                      : 'bg-surface-raised border border-transparent'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 min-w-0">
                  <span
                    dir="auto"
                    className={`text-[15px] font-medium transition-colors min-w-0 break-words ${
                      isDone ? 'text-fg line-through opacity-70' : 'text-fg'
                    }`}
                  >
                    {essential.title}
                  </span>
                  <span className="text-[12px] font-medium text-fg-secondary flex-shrink-0 tabular-nums">
                    {progress} / {essential.targetCount}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 bg-surface-dim p-1 rounded-lg border border-edge-subtle">
                  {Array.from({ length: essential.targetCount }).map((_, i) => {
                    const chipValue = i + 1;
                    const isActive = progress >= chipValue;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          // If clicking the current exact progress, toggle it down by 1
                          if (progress === chipValue) {
                            onUpdateProgress(essential.id, chipValue - 1);
                          } else {
                            onUpdateProgress(essential.id, chipValue);
                          }
                        }}
                        aria-pressed={isActive}
                        aria-label={`${essential.title}: ${chipValue} von ${essential.targetCount}`}
                        className={`w-11 h-11 rounded-md flex items-center justify-center text-[14px] font-bold transition-all active:scale-90 ${
                          isActive
                            ? 'bg-primary text-white shadow-[0_0_10px_rgba(19,91,236,0.3)]'
                            : 'bg-transparent text-fg-secondary hover:bg-surface-control'
                        }`}
                      >
                        {chipValue}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
          )}
        </div>
      )}
    </section>
  );
}
