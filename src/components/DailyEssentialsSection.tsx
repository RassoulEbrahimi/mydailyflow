import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Settings, Check, Droplets, Minus, Plus } from 'lucide-react';
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
  const incompleteEssentials = essentials.filter(essential => {
    const progress = progressById[essential.id] || 0;
    return progress < essential.targetCount;
  });
  const summaryEssentials = incompleteEssentials.slice(0, 2);
  const remainingSummaryCount = Math.max(0, incompleteEssentials.length - summaryEssentials.length);

  return (
    <section className="px-5 pt-3 pb-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 select-none min-w-0 min-h-11 text-left"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-expanded={!isCollapsed}
          aria-label={`Tägliche Essentials, ${completedCount} von ${totalCount} erledigt`}
        >
          <div className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full bg-primary-surface text-primary-text" aria-hidden="true">
            <Droplets size={16} strokeWidth={2.5} />
          </div>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-2">
              <h2 className="text-[16px] font-bold text-fg tracking-tight truncate">Tägliche Essentials</h2>
              <span className="text-[13px] font-medium text-fg-secondary bg-surface-raised px-2 py-0.5 rounded-full flex-shrink-0">
                {completedCount}/{totalCount}
              </span>
              {isCollapsed ? (
                <ChevronDown size={18} className="text-fg-secondary flex-shrink-0" aria-hidden="true" />
              ) : (
                <ChevronUp size={18} className="text-fg-secondary flex-shrink-0" aria-hidden="true" />
              )}
            </span>

            {isCollapsed && totalCount > 0 && (
              <span
                data-testid="essentials-collapsed-summary"
                className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-[12px] text-fg-secondary"
              >
                {incompleteEssentials.length === 0 ? (
                  <span className="truncate">Alles für heute erledigt</span>
                ) : (
                  <>
                    {summaryEssentials.map((essential, index) => {
                      const progress = progressById[essential.id] || 0;
                      return (
                        <React.Fragment key={essential.id}>
                          {index > 0 && <span aria-hidden="true">·</span>}
                          <span className="flex min-w-0 items-center gap-1 truncate">
                            <span dir="auto" className="truncate text-start">{essential.title}</span>
                            {essential.targetCount > 1 && (
                              <span dir="ltr" className="flex-shrink-0 tabular-nums">
                                {progress}/{essential.targetCount}
                              </span>
                            )}
                          </span>
                        </React.Fragment>
                      );
                    })}
                    {remainingSummaryCount > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr" className="flex-shrink-0">+{remainingSummaryCount} offen</span>
                      </>
                    )}
                  </>
                )}
              </span>
            )}
          </span>
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
        <div className="flex flex-col gap-1.5 bg-surface-dim p-2 rounded-[16px] border border-edge/50 shadow-sm">
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
                  data-essential-id={essential.id}
                  data-essential-type="simple"
                  onClick={() => onUpdateProgress(essential.id, isDone ? 0 : 1)}
                  role="checkbox"
                  aria-checked={isDone}
                  className={`w-full text-left flex items-center justify-between gap-3 px-3 py-1.5 min-h-11 rounded-xl transition-all active:scale-[0.98] ${
                    isDone 
                      ? 'bg-primary-surface border border-primary-border'
                      : 'bg-surface-raised border border-transparent hover:border-edge-subtle'
                  }`}
                >
                  <span
                    dir="auto"
                    className={`min-w-0 flex-1 text-start break-words text-[15px] font-medium transition-colors ${
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
              // A compact stepper keeps both controls at the 44px touch-target
              // minimum while leaving enough title width at 360px. Five separate
              // 44px chips alone need 220px and cannot share that row safely.
              <div
                key={essential.id}
                data-essential-id={essential.id}
                data-essential-type="multiple"
                className={`flex min-h-11 items-center gap-2 rounded-xl px-2 py-1 transition-all ${
                    isDone 
                      ? 'bg-primary-surface border border-primary-border'
                      : 'bg-surface-raised border border-transparent'
                }`}
              >
                <span
                  dir="auto"
                  className={`min-w-0 flex-1 text-start break-words text-[15px] font-medium transition-colors ${
                    isDone ? 'text-fg line-through opacity-70' : 'text-fg'
                  }`}
                >
                  {essential.title}
                </span>

                <div
                  dir="ltr"
                  role="group"
                  aria-label={`${essential.title}: ${progress} von ${essential.targetCount}`}
                  className="flex shrink-0 items-center gap-0.5 rounded-xl border border-edge-subtle bg-surface-dim p-0.5"
                >
                  <button
                    type="button"
                    onClick={() => onUpdateProgress(essential.id, Math.max(0, progress - 1))}
                    disabled={progress === 0}
                    aria-label={`${essential.title}: Fortschritt verringern`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-fg-secondary transition-colors hover:bg-surface-control disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Minus size={17} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                  <span
                    dir="ltr"
                    role="status"
                    aria-live="polite"
                    className="min-w-10 text-center text-[13px] font-bold tabular-nums text-fg"
                  >
                    {progress}/{essential.targetCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateProgress(essential.id, Math.min(essential.targetCount, progress + 1))}
                    disabled={isDone}
                    aria-label={`${essential.title}: Fortschritt erhöhen`}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-primary-text transition-colors hover:bg-primary-surface disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Plus size={17} strokeWidth={2.5} aria-hidden="true" />
                  </button>
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
