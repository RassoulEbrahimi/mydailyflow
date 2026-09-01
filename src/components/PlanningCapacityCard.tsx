import { AlertTriangle, CalendarClock, Gauge, ListTodo } from 'lucide-react';
import type { Task } from '../types/task';
import { buildPlanningCapacity, formatPlanningMinutes } from '../utils/planningCapacity';

interface PlanningCapacityCardProps {
    tasks: Task[];
}

const taskCountLabel = (count: number, singular: string, plural: string): string =>
    `${count} ${count === 1 ? singular : plural}`;

export default function PlanningCapacityCard({ tasks }: PlanningCapacityCardProps) {
    const summary = buildPlanningCapacity(tasks);
    const overCapacity = summary.overByMinutes > 0;

    return (
        <section
            aria-labelledby="planning-capacity-heading"
            className="rounded-2xl border border-edge bg-surface-raised p-4"
            data-planning-capacity
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-surface text-primary-text">
                        <Gauge size={20} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h2 id="planning-capacity-heading" className="text-[16px] font-bold text-fg">Tagesrahmen</h2>
                        <p className="text-[11px] text-fg-secondary">Unverbindliche Orientierung: 8 Std.</p>
                    </div>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    overCapacity ? 'bg-warning-surface text-warning' : 'bg-primary-surface text-primary-text'
                }`}>
                    {formatPlanningMinutes(summary.totalMinutes)}
                </span>
            </div>

            <div
                className="mt-3 h-2 overflow-hidden rounded-full bg-surface-control"
                role="progressbar"
                aria-label="Geplante Tageskapazität"
                aria-valuemin={0}
                aria-valuemax={summary.capacityMinutes}
                aria-valuenow={Math.min(summary.totalMinutes, summary.capacityMinutes)}
                aria-valuetext={`${formatPlanningMinutes(summary.totalMinutes)} von ${formatPlanningMinutes(summary.capacityMinutes)}`}
            >
                <div
                    className={`h-full rounded-full ${overCapacity ? 'bg-warning' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, summary.utilizationPercent)}%` }}
                />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-inset px-3 text-fg-secondary">
                    <CalendarClock size={16} className="flex-shrink-0 text-primary-text" aria-hidden="true" />
                    <span>{taskCountLabel(summary.fixedCommitments.length, 'fester Termin', 'feste Termine')}</span>
                </div>
                <div className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-inset px-3 text-fg-secondary">
                    <ListTodo size={16} className="flex-shrink-0 text-primary-text" aria-hidden="true" />
                    <span>{taskCountLabel(summary.flexibleTasks.length, 'flexible Aufgabe', 'flexible Aufgaben')}</span>
                </div>
            </div>

            <p className="mt-3 text-[11px] leading-4 text-fg-secondary">
                Mit Uhrzeit = fester Termin. Ohne Zeit = flexibel. Der Rahmen warnt nur und verschiebt nichts.
            </p>

            {(overCapacity || summary.conflicts.length > 0) && (
                <div role="status" aria-live="polite" className="mt-3 space-y-2 rounded-xl bg-warning-surface p-3 text-[12px] leading-5 text-warning">
                    {overCapacity && (
                        <p className="flex items-start gap-2">
                            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span>{formatPlanningMinutes(summary.overByMinutes)} über dem Orientierungsrahmen. Der Plan bleibt unverändert.</span>
                        </p>
                    )}
                    {summary.conflicts.map(({ first, second }) => (
                        <p key={`${first.id}:${second.id}`} className="flex items-start gap-2">
                            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span>
                                Zeitkonflikt {first.time}: <b dir="auto">{first.title}</b> / <b dir="auto">{second.title}</b>
                            </span>
                        </p>
                    ))}
                </div>
            )}
        </section>
    );
}
