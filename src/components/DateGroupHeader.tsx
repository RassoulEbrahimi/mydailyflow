import React from 'react';
import { formatDateLabel } from '../utils/taskUtils';

interface DateGroupHeaderProps {
    date: string;
    count: number;
}

/** Sticky date header shown above each date group in the All Tasks tab. */
const DateGroupHeader = ({ date, count }: DateGroupHeaderProps) => (
    <div className="sticky top-0 z-10 -mx-1 px-1 pt-0.5 pb-2 bg-background-dark/95 backdrop-blur-sm">
        <div className="flex items-center gap-3">
            <div className="h-7 w-[3px] rounded-full bg-primary/70 shadow-[0_0_8px_rgba(19,91,236,0.5)]" />
            <h2 className="text-sm font-semibold text-white tracking-wide">
                {formatDateLabel(date)}
                <span className="ml-2 text-text-secondary font-normal">
                    · {count} task{count !== 1 ? 's' : ''}
                </span>
            </h2>
        </div>
    </div>
);

export default DateGroupHeader;
