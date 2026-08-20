import React from 'react';
import { CalendarPlus } from 'lucide-react';

export type AllTasksDateFilter = 'all' | 'today' | 'upcoming' | 'past' | 'date';

interface AllTasksFilterBarProps {
    allDateFilter: AllTasksDateFilter;
    setAllDateFilter: (v: AllTasksDateFilter) => void;
    allDatePicker: string;
    setAllDatePicker: (v: string) => void;
    planningDateLabel: string;
    onPlanTask: () => void;
}

/** Date filter bar for the All Tasks tab: quick-select pills + date picker + clear. */
const AllTasksFilterBar = ({
    allDateFilter,
    setAllDateFilter,
    allDatePicker,
    setAllDatePicker,
    planningDateLabel,
    onPlanTask,
}: AllTasksFilterBarProps) => (
    <div className="pt-2 flex flex-col gap-2">
        {/* Row 1: quick-select pills */}
        <div className="flex flex-wrap items-center gap-2">
            {(['all', 'today', 'upcoming', 'past'] as const).map(f => (
                <button
                    key={f}
                    type="button"
                    onClick={() => { setAllDateFilter(f); setAllDatePicker(''); }}
                    aria-pressed={allDateFilter === f}
                    className={`px-3 py-1.5 min-h-11 rounded-full text-xs font-semibold transition-all border ${allDateFilter === f
                            ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(19,91,236,0.35)]'
                            : 'bg-surface-raised text-fg-secondary border-edge hover:border-primary/50'
                        }`}
                >
                    {f === 'all'
                        ? 'Alle Daten'
                        : f === 'today'
                            ? 'Heute'
                            : f === 'upcoming'
                                ? 'Kommend'
                                : 'Vergangen'}
                </button>
            ))}
        </div>
        {/* Row 2: date picker + Clear */}
        <div className="flex items-center gap-2">
            <input
                type="date"
                id="all-tasks-date-filter"
                aria-label="Nach Datum filtern"
                value={allDatePicker}
                onChange={e => {
                    const v = e.target.value;
                    setAllDatePicker(v);
                    setAllDateFilter(v ? 'date' : 'all');
                }}
                className="bg-surface-raised text-fg-secondary border border-edge hover:border-primary/50 rounded-full px-3 py-1.5 min-h-11 text-xs font-semibold cursor-pointer transition-all"
            />
            {allDateFilter !== 'all' && (
                <button
                    type="button"
                    onClick={() => { setAllDateFilter('all'); setAllDatePicker(''); }}
                    aria-label="Datumsfilter löschen"
                    className="px-3 py-1.5 min-h-11 rounded-full text-xs font-semibold bg-surface-raised text-fg-secondary border border-edge hover:border-danger hover:text-danger transition-all"
                >
                    Löschen
                </button>
            )}
        </div>
        <div className="mt-1 flex items-center gap-3 rounded-2xl border border-edge bg-surface-raised p-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <CalendarPlus size={20} className="flex-shrink-0 text-primary-text" aria-hidden="true" />
                <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Planungsziel</p>
                    <p className="truncate text-[14px] font-semibold text-fg">{planningDateLabel}</p>
                </div>
            </div>
            <button
                type="button"
                onClick={onPlanTask}
                className="min-h-11 flex-shrink-0 rounded-xl bg-primary-surface px-3 text-[13px] font-semibold text-primary-text hover:bg-primary/15"
            >
                Hier planen
            </button>
        </div>
    </div>
);

export default AllTasksFilterBar;
