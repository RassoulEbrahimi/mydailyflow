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
        <div 
          className="flex items-center gap-2 cursor-pointer select-none min-w-0"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full bg-blue-500/15 text-blue-400">
            <Droplets size={16} strokeWidth={2.5} />
          </div>
          <h2 className="text-[16px] font-bold text-fg tracking-tight truncate">Tägliche Essentials</h2>
          <span className="text-[13px] font-medium text-fg-secondary bg-surface-raised px-2 py-0.5 rounded-full flex-shrink-0">
            {completedCount}/{totalCount}
          </span>
          {isCollapsed ? (
            <ChevronDown size={18} className="text-fg-secondary flex-shrink-0" />
          ) : (
            <ChevronUp size={18} className="text-fg-secondary flex-shrink-0" />
          )}
        </div>
        
        <button
          onClick={onManageClick}
          className="text-blue-400 hover:text-blue-300 p-1.5 rounded-md hover:bg-blue-500/10 transition-colors flex items-center justify-center flex-shrink-0"
          aria-label="Verwalten"
        >
          <Settings size={18} />
        </button>
      </div>

      {/* List */}
      {!isCollapsed && (
        <div className="flex flex-col gap-2.5 bg-surface-dim p-3 rounded-[16px] border border-edge/50 shadow-sm">
          {essentials.length === 0 ? (
            <div className="text-center py-4 text-fg-secondary text-[14px]">
              Noch keine Essentials. <span className="text-primary cursor-pointer" onClick={onManageClick}>Hinzufügen</span>
            </div>
          ) : (
            essentials.map(essential => {
              const progress = progressById[essential.id] || 0;
              const isDone = progress >= essential.targetCount;
              const isSimple = essential.targetCount === 1;

              if (isSimple) {
              return (
                <div 
                  key={essential.id}
                  onClick={() => onUpdateProgress(essential.id, isDone ? 0 : 1)}
                  className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98] ${
                    isDone 
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'bg-surface-raised border border-transparent hover:border-edge-subtle'
                  }`}
                >
                  <span className={`text-[15px] font-medium transition-colors ${
                    isDone ? 'text-fg line-through opacity-70' : 'text-fg'
                  }`}>
                    {essential.title}
                  </span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isDone ? 'bg-primary border-primary text-white' : 'border-edge-strong text-transparent'
                  }`}>
                    <Check size={14} strokeWidth={3} />
                  </div>
                </div>
              );
            }

            return (
              <div 
                key={essential.id}
                className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                    isDone 
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : 'bg-surface-raised border border-transparent'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className={`text-[15px] font-medium transition-colors ${
                    isDone ? 'text-fg line-through opacity-70' : 'text-fg'
                  }`}>
                    {essential.title}
                  </span>
                  <span className="text-[12px] font-medium text-fg-secondary">
                    {progress} / {essential.targetCount}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 bg-surface-dim p-1 rounded-lg border border-edge-subtle">
                  {Array.from({ length: essential.targetCount }).map((_, i) => {
                    const chipValue = i + 1;
                    const isActive = progress >= chipValue;
                    return (
                      <button
                        key={i}
                        onClick={(e) => {
                          e.stopPropagation();
                          // If clicking the current exact progress, toggle it down by 1
                          if (progress === chipValue) {
                            onUpdateProgress(essential.id, chipValue - 1);
                          } else {
                            onUpdateProgress(essential.id, chipValue);
                          }
                        }}
                        className={`w-8 h-8 rounded-md flex items-center justify-center text-[14px] font-bold transition-all active:scale-90 ${
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
