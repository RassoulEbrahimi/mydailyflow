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
      <div className="flex items-center justify-between mb-3">
        <div 
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-500/15 text-blue-400">
            <Droplets size={16} strokeWidth={2.5} />
          </div>
          <h2 className="text-[16px] font-bold text-white tracking-tight">Daily Essentials</h2>
          <span className="text-[13px] font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full ml-1">
            {completedCount}/{totalCount}
          </span>
          {isCollapsed ? (
            <ChevronDown size={18} className="text-slate-500 ml-1" />
          ) : (
            <ChevronUp size={18} className="text-slate-500 ml-1" />
          )}
        </div>
        
        <button
          onClick={onManageClick}
          className="text-[13px] font-medium text-blue-400 hover:text-blue-300 px-2 py-1 rounded-md hover:bg-blue-500/10 transition-colors flex items-center gap-1"
        >
          <Settings size={14} />
          <span>Manage</span>
        </button>
      </div>

      {/* List */}
      {!isCollapsed && (
        <div className="flex flex-col gap-2.5 bg-[#162032] p-3 rounded-[16px] border border-[#232f48]/50 shadow-sm">
          {essentials.length === 0 ? (
            <div className="text-center py-4 text-slate-400 text-[14px]">
              No essentials yet. <span className="text-blue-400 cursor-pointer" onClick={onManageClick}>Add one</span>
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
                      : 'bg-[#1e273b] border border-transparent hover:border-[#2a364d]'
                  }`}
                >
                  <span className={`text-[15px] font-medium transition-colors ${
                    isDone ? 'text-blue-400 line-through opacity-70' : 'text-slate-200'
                  }`}>
                    {essential.title}
                  </span>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isDone ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-500 text-transparent'
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
                    : 'bg-[#1e273b] border border-transparent'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <span className={`text-[15px] font-medium transition-colors ${
                    isDone ? 'text-blue-400 line-through opacity-70' : 'text-slate-200'
                  }`}>
                    {essential.title}
                  </span>
                  <span className="text-[12px] font-medium text-slate-400">
                    {progress} / {essential.targetCount}
                  </span>
                </div>
                
                <div className="flex items-center gap-1.5 bg-[#162032] p-1 rounded-lg border border-[#2a364d]">
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
                            ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' 
                            : 'bg-transparent text-slate-400 hover:bg-slate-800'
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
