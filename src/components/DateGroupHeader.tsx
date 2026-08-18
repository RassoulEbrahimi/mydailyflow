import React from 'react';
import { formatDateLabel } from '../utils/taskUtils';

interface DateGroupHeaderProps {
    date: string;
    count: number;
}

/**
 * Sticky date header shown above each date group in the All Tasks tab.
 *
 * Two things it must get right, both of which it previously got wrong:
 *
 *  - **It pins below whatever the shell has pinned**, by reading the same
 *    `--mdf-pinned-top` contract the scroll container publishes. Hard-coding
 *    `top-0` put it at the scroll-port edge, which is only correct on tabs that
 *    have no pinned hero.
 *  - **It is opaque.** `bg-page/95` let task titles show through as a smear as
 *    they scrolled underneath. The header sits above content by design, so it
 *    must actually hide what passes behind it.
 */
const DateGroupHeader = ({ date, count }: DateGroupHeaderProps) => (
    <div
        data-sticky-group
        className="sticky top-[var(--mdf-pinned-top,0px)] z-10 -mx-1 px-1 pt-1 pb-2 bg-page"
    >
        <div className="flex items-center gap-3">
            <div className="h-7 w-[3px] rounded-full bg-primary/70 shadow-[0_0_8px_rgba(19,91,236,0.5)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-fg tracking-wide">
                {formatDateLabel(date)}
                <span className="ml-2 text-fg-secondary font-normal">
                    · {count} Aufgabe{count !== 1 ? 'n' : ''}
                </span>
            </h2>
        </div>
    </div>
);

export default DateGroupHeader;
