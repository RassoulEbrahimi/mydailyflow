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
                    onClick={() => { setAllDateFilter(f); setAllDatePicker(''); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${allDateFilter === f
                            ? 'bg-primary text-white border-primary shadow-[0_0_10px_rgba(19,91,236,0.35)]'
                            : 'bg-[#1e273b] text-text-secondary border-[#232f48] hover:border-primary/50'
                        }`}
                >
                    {f === 'all' ? 'All dates' : f === 'today' ? 'Today' : 'Yesterday'}
                </button>
            ))}
        </div>
        {/* Row 2: date picker + Clear */}
        <div className="flex items-center gap-2">
            <input
                type="date"
                value={allDatePicker}
                onChange={e => {
                    const v = e.target.value;
                    setAllDatePicker(v);
                    setAllDateFilter(v || 'all');
                }}
                className="bg-[#1e273b] text-text-secondary border border-[#232f48] hover:border-primary/50 rounded-full px-3 py-1.5 text-xs font-semibold outline-none [color-scheme:dark] cursor-pointer transition-all"
            />
            {allDateFilter !== 'all' && (
                <button
                    onClick={() => { setAllDateFilter('all'); setAllDatePicker(''); }}
                    className="px-3 py-1.5 rounded-full text-xs font-semibold bg-[#1e273b] text-text-secondary border border-[#232f48] hover:border-red-400/50 hover:text-red-400 transition-all"
                >
                    Clear
                </button>
            )}
        </div>
    </div>
);

export default AllTasksFilterBar;
