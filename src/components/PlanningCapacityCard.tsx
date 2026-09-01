import { AlertTriangle, Gauge } from 'lucide-react';
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
            className="rounded-2xl border border-edge bg-surface-raised p-3"
            data-planning-capacity
        >
            <div className="flex min-h-11 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary-surface text-primary-text">
                        <Gauge size={19} aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h2 id="planning-capacity-heading" className="text-[16px] font-bold text-fg">Tagesrahmen</h2>
                        <p className="truncate text-[11px] text-fg-secondary">
                            {taskCountLabel(summary.fixedCommitments.length, 'fester Termin', 'feste Termine')}
                            {' · '}
                            {taskCountLabel(summary.flexibleTasks.length, 'flexible Aufgabe', 'flexible Aufgaben')}
                            {' · 8 Std. Orientierung'}
                        </p>
                    </div>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    overCapacity ? 'bg-warning-surface text-warning' : 'bg-primary-surface text-primary-text'
                }`}>
                    {formatPlanningMinutes(summary.totalMinutes)}
                </span>
            </div>

            <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-control"
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

            <p className="sr-only">
                Mit Uhrzeit = fester Termin. Ohne Zeit = flexibel. Der Rahmen warnt nur und verschiebt nichts.
            </p>

            {(overCapacity || summary.conflicts.length > 0) && (
                <div role="status" aria-live="polite" className="mt-2 space-y-1.5 rounded-xl bg-warning-surface p-2.5 text-[12px] leading-5 text-warning">
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
