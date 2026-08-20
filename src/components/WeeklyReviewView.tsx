import { ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, RotateCcw, Sparkles } from 'lucide-react';
import type { DailyEssential, EssentialHistoryDay } from '../types/essential';
import type { Task } from '../types/task';
import { addCalendarDays, buildWeeklyReview, startOfLocalWeek } from '../utils/weeklyReview';

interface WeeklyReviewViewProps {
    tasks: Task[];
    essentialHistory: EssentialHistoryDay[];
    essentials: DailyEssential[];
    progressById: Record<string, number>;
    today: string;
    referenceDate: string;
    onReferenceDateChange: (date: string) => void;
    onClose: () => void;
}

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions): string => {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('de-DE', options).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const shortDay = (date: string): string => dateLabel(date, { weekday: 'short', day: '2-digit' });

export default function WeeklyReviewView({
    tasks,
    essentialHistory,
    essentials,
    progressById,
    today,
    referenceDate,
    onReferenceDateChange,
    onClose,
}: WeeklyReviewViewProps) {
    const currentWeek = startOfLocalWeek(today);
    const selectedWeek = startOfLocalWeek(referenceDate);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const review = buildWeeklyReview(
        tasks,
        essentialHistory,
        referenceDate,
        today,
        timeZone,
        { date: today, essentials, progressById },
    );
    const isCurrentWeek = selectedWeek === currentWeek;
    const hasHistoricalEssentials = review.historicalEssentialDays > 0;

    return (
        <div className="px-4 pb-8 sm:px-5" data-weekly-review>
            <div className="mb-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg-secondary hover:bg-fg/5"
                    aria-label="Wochenrückblick schließen"
                >
                    <ArrowLeft size={22} aria-hidden="true" />
                </button>
                <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary-text">Phase 2</p>
                    <h1 className="text-xl font-bold text-fg">Wochenrückblick</h1>
                </div>
            </div>

            <section className="rounded-2xl border border-edge bg-surface-raised p-4" aria-label="Woche auswählen">
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => onReferenceDateChange(addCalendarDays(selectedWeek, -7))}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-edge-muted text-fg-secondary"
                        aria-label="Vorherige Woche"
                    >
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <div className="min-w-0 text-center">
                        <p className="text-[15px] font-bold text-fg">
                            {dateLabel(review.startDate, { day: '2-digit', month: 'short' })}
                            {' – '}
                            {dateLabel(review.endDate, { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="mt-0.5 text-[12px] text-fg-secondary">{isCurrentWeek ? 'Diese Woche' : 'Vergangene Woche'}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onReferenceDateChange(addCalendarDays(selectedWeek, 7))}
                        disabled={isCurrentWeek}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-edge-muted text-fg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Nächste Woche"
                    >
                        <ChevronRight size={20} aria-hidden="true" />
                    </button>
                </div>
            </section>

            <section className="mt-4 grid grid-cols-3 gap-2" aria-label="Wochensummen">
                {[
                    { label: 'Geplant', value: review.plannedTotal, icon: CalendarDays, tone: 'text-primary-text bg-primary-surface' },
                    { label: 'Erledigt', value: review.completedTotal, icon: CheckCircle2, tone: 'text-success bg-success-surface' },
                    { label: 'Übernommen', value: review.carriedTotal, icon: RotateCcw, tone: 'text-warning bg-warning-surface' },
                ].map(({ label, value, icon: Icon, tone }) => (
                    <div key={label} className="min-w-0 rounded-2xl border border-edge bg-surface p-3 text-center">
                        <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                            <Icon size={18} aria-hidden="true" />
                        </div>
                        <strong className="mt-2 block text-xl text-fg">{value}</strong>
                        <span className="block truncate text-[11px] font-medium text-fg-secondary">{label}</span>
                    </div>
                ))}
            </section>

            <section className="mt-6" aria-labelledby="weekly-work-heading">
                <h2 id="weekly-work-heading" className="text-[17px] font-bold text-fg">Arbeit pro Tag</h2>
                <p className="mt-1 text-[13px] leading-5 text-fg-secondary">Geplant und tatsächlich abgeschlossen bleiben getrennt.</p>
                <div className="mt-3 flex flex-col gap-2">
                    {review.days.map(day => {
                        const scale = Math.max(1, day.planned, day.completed, day.carried);
                        return (
                            <div key={day.date} data-week-task-day={day.date} className="rounded-xl border border-edge bg-surface px-3 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-[13px] font-semibold text-fg">{shortDay(day.date)}</span>
                                    <span className="text-[12px] text-fg-secondary">
                                        {day.planned} geplant · {day.completed} erledigt{day.carried ? ` · ${day.carried} übernommen` : ''}
                                    </span>
                                </div>
                                <div className="mt-2 grid grid-cols-3 gap-1" aria-hidden="true">
                                    <div className="h-1.5 rounded-full bg-primary" style={{ width: `${Math.max(8, day.planned / scale * 100)}%` }} />
                                    <div className="h-1.5 rounded-full bg-success" style={{ width: `${Math.max(8, day.completed / scale * 100)}%` }} />
                                    <div className="h-1.5 rounded-full bg-warning" style={{ width: `${Math.max(8, day.carried / scale * 100)}%` }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="mt-6 rounded-2xl border border-edge bg-surface p-4" aria-labelledby="essentials-trend-heading">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 id="essentials-trend-heading" className="text-[17px] font-bold text-fg">Essentials</h2>
                        <p className="mt-1 text-[13px] text-fg-secondary">{review.trackedEssentialDays} von 7 Tagen erfasst</p>
                    </div>
                    <Sparkles size={21} className="text-primary-text" aria-hidden="true" />
                </div>
                <div className="mt-4 grid grid-cols-7 gap-1.5">
                    {review.essentialDays.map(day => {
                        const ratio = day.total > 0 ? day.completed / day.total : 0;
                        return (
                            <div key={day.date} data-week-essential-day={day.date} className="text-center">
                                <div className="flex h-20 items-end overflow-hidden rounded-lg bg-surface-inset" title={day.source ? `${day.completed} von ${day.total}` : 'Keine Daten'}>
                                    <div
                                        className={`w-full rounded-lg ${day.source ? 'bg-primary' : 'bg-edge-muted'}`}
                                        style={{ height: day.source ? `${Math.max(8, ratio * 100)}%` : '4px' }}
                                    />
                                </div>
                                <span className="mt-1 block text-[10px] font-medium text-fg-secondary">{dateLabel(day.date, { weekday: 'narrow' })}</span>
                                <span className="block text-[10px] text-fg-faint">{day.source ? `${day.completed}/${day.total}` : '–'}</span>
                            </div>
                        );
                    })}
                </div>
                {!hasHistoricalEssentials && (
                    <p className="mt-4 rounded-xl bg-surface-inset p-3 text-[13px] leading-5 text-fg-secondary">
                        Noch keine abgeschlossene Tageshistorie. Der heutige Live-Stand erscheint hier, ältere Tage werden nicht als null erfunden.
                    </p>
                )}
                {review.migratedEssentialDays > 0 && (
                    <p className="mt-3 rounded-xl bg-warning-surface p-3 text-[12px] leading-5 text-warning">
                        {review.migratedEssentialDays} Tag{review.migratedEssentialDays !== 1 ? 'e' : ''} stammt aus der Migration und ist als Momentaufnahme markiert.
                    </p>
                )}
            </section>

            <section className="mt-6" aria-labelledby="completion-moments-heading">
                <h2 id="completion-moments-heading" className="text-[17px] font-bold text-fg">Abschlussmomente</h2>
                <p className="mt-1 text-[13px] leading-5 text-fg-secondary">Nur echte gespeicherte Zeitpunkte – keine Schätzung.</p>
                {review.completionMoments.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-2">
                        {review.completionMoments.map(moment => (
                            <div key={moment.taskId} className="flex items-center gap-3 rounded-xl border border-edge bg-surface p-3">
                                <Clock3 size={18} className="flex-shrink-0 text-success" aria-hidden="true" />
                                <span dir="auto" className="min-w-0 flex-1 text-start text-[14px] font-semibold text-fg">{moment.title}</span>
                                <span className="flex-shrink-0 text-[12px] text-fg-secondary">{shortDay(moment.date)} · {moment.time}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 rounded-xl bg-surface-inset p-4 text-[13px] text-fg-secondary">In dieser Woche wurde noch kein verlässlicher Abschlusszeitpunkt gespeichert.</p>
                )}
                {review.legacyCompletionCount > 0 && (
                    <p className="mt-3 text-[12px] leading-5 text-warning">
                        {review.legacyCompletionCount} ältere erledigte Aufgabe{review.legacyCompletionCount !== 1 ? 'n haben' : ' hat'} keinen gespeicherten Abschlusszeitpunkt und wird hier nicht zeitlich eingeordnet.
                    </p>
                )}
            </section>

            <section className="mt-6" aria-labelledby="unfinished-decisions-heading">
                <h2 id="unfinished-decisions-heading" className="text-[17px] font-bold text-fg">Neu entscheiden</h2>
                <p className="mt-1 text-[13px] leading-5 text-fg-secondary">Offene Arbeit bis heute, die eine bewusste Entscheidung braucht.</p>
                {review.unfinishedTasks.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-2">
                        {review.unfinishedTasks.map(task => (
                            <div key={task.id} className="rounded-xl border border-edge bg-surface p-3">
                                <p dir="auto" className="text-start text-[14px] font-semibold text-fg">{task.title}</p>
                                <p className="mt-1 text-[12px] text-fg-secondary">{shortDay(task.date)} · {task.time || 'Ohne Zeit'}</p>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 rounded-xl bg-success-surface p-4 text-[13px] text-success">Keine offene Arbeit aus dieser Woche braucht gerade eine neue Entscheidung.</p>
                )}
            </section>
        </div>
    );
}
