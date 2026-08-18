import React from 'react';

interface AllTasksFilterBarProps {
    allDateFilter: string;
    setAllDateFilter: (v: string) => void;
    allDatePicker: string;
    setAllDatePicker: (v: string) => void;
}

/** Date filter bar for the All Tasks tab: quick-select pills + date picker + clear. */
const AllTasksFilterBar = ({
    allDateFilter,
    setAllDateFilter,
    allDatePicker,
    setAllDatePicker,
}: AllTasksFilterBarProps) => (
    <div className="pt-2 flex flex-col gap-2">
        {/* Row 1: quick-select pills */}
        <div className="flex flex-wrap items-center gap-2">
            {(['all', 'today', 'yesterday'] as const).map(f => (
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
                    {f === 'all' ? 'Alle Daten' : f === 'today' ? 'Heute' : 'Gestern'}
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
                    setAllDateFilter(v || 'all');
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
    </div>
);

export default AllTasksFilterBar;
