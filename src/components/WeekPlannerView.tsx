import { useRef, useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    closestCenter,
    useDraggable,
    useDroppable,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragStartEvent,
} from '@dnd-kit/core';
import {
    ArrowLeft,
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    Clock3,
    GripVertical,
    Move,
    RepeatIcon,
} from 'lucide-react';
import type { Task } from '../types/task';
import { startOfLocalWeek } from '../utils/weeklyReview';
import {
    buildWeekPlan,
    canMoveTaskToPlannerDestination,
    nextPlannerWeek,
    PLANNER_LANES,
    PLANNER_LANE_LABELS,
    plannerLaneForTask,
    previousPlannerWeek,
    type PlannerDestination,
    type PlannerLane,
} from '../utils/weekPlanner';
import MoveTaskModal from './MoveTaskModal';

interface WeekPlannerViewProps {
    tasks: Task[];
    today: string;
    referenceDate: string;
    onReferenceDateChange: (date: string) => void;
    onMoveTask: (taskId: string, destination: PlannerDestination) => void;
    onClose: () => void;
}

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions): string => {
    const [year, month, day] = date.split('-').map(Number);
    return new Intl.DateTimeFormat('de-DE', options).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const laneId = (date: string, lane: PlannerLane): string => `planner:${date}:${lane}`;

const decodeLaneId = (value: string): PlannerDestination | null => {
    const match = /^planner:(\d{4}-\d{2}-\d{2}):(morning|afternoon|evening|untimed)$/.exec(value);
    return match ? { date: match[1], lane: match[2] as PlannerLane } : null;
};

function PlannerTask({ task, onMoveClick }: { task: Task; onMoveClick: (task: Task, trigger: HTMLButtonElement) => void; key?: string }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: task.id,
        data: { task },
    });
    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
        : undefined;

    return (
        <article
            ref={setNodeRef}
            style={style}
            data-planner-task={task.id}
            className={`relative z-[1] rounded-xl border border-edge bg-surface-raised p-2.5 shadow-sm ${isDragging ? 'opacity-50' : ''}`}
        >
            <div className="flex items-start gap-1.5">
                <button
                    type="button"
                    {...attributes}
                    {...listeners}
                    className="-ml-1 flex min-h-11 min-w-11 cursor-grab touch-none items-center justify-center rounded-lg text-fg-faint hover:bg-surface-control hover:text-fg active:cursor-grabbing"
                    aria-label={`Ziehen: ${task.title}`}
                >
                    <GripVertical size={19} aria-hidden="true" />
                </button>
                <div className="min-w-0 flex-1 py-1">
                    <h3 dir="auto" className="text-start text-[13px] font-semibold leading-5 text-fg break-words">{task.title}</h3>
                    <div dir="ltr" className="mt-1 flex items-center gap-1.5 text-[11px] text-fg-secondary">
                        <Clock3 size={12} aria-hidden="true" />
                        <span>{task.time || 'Ohne Zeit'}</span>
                        {task.recurrence && task.recurrence !== 'none' && (
                            <span role="img" className="flex items-center gap-1 rounded-md border border-edge px-1 py-0.5" aria-label="Wiederholende Aufgabe">
                                <RepeatIcon size={9} aria-hidden="true" />
                            </span>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={event => onMoveClick(task, event.currentTarget)}
                    className="-mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-primary-text hover:bg-primary-surface"
                    aria-label={`Verschieben: ${task.title}`}
                >
                    <Move size={18} aria-hidden="true" />
                </button>
            </div>
        </article>
    );
}

function PlannerLaneSection({
    date,
    lane,
    tasks,
    onMoveClick,
}: {
    date: string;
    lane: PlannerLane;
    tasks: Task[];
    onMoveClick: (task: Task, trigger: HTMLButtonElement) => void;
    key?: PlannerLane;
}) {
    const id = laneId(date, lane);
    const { isOver, setNodeRef } = useDroppable({ id, data: { date, lane } });
    return (
        <section
            ref={setNodeRef}
            data-planner-lane={id}
            aria-label={`${dateLabel(date, { weekday: 'long', day: '2-digit', month: '2-digit' })}, ${PLANNER_LANE_LABELS[lane]}, ${tasks.length} Aufgabe${tasks.length !== 1 ? 'n' : ''}`}
            className={`rounded-xl border p-2 transition-colors ${
                isOver ? 'border-primary bg-primary-surface' : 'border-edge bg-surface-inset'
            }`}
        >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h3 className="text-[12px] font-bold text-fg">{PLANNER_LANE_LABELS[lane]}</h3>
                <span className="text-[11px] text-fg-faint">{tasks.length}</span>
            </div>
            <div className="flex min-h-12 flex-col gap-2">
                {tasks.length > 0 ? tasks.map(task => (
                    <PlannerTask key={task.id} task={task} onMoveClick={onMoveClick} />
                )) : (
                    <p className="flex min-h-12 items-center justify-center rounded-lg border border-dashed border-edge-muted px-2 text-center text-[11px] text-fg-faint">
                        Hier ablegen
                    </p>
                )}
            </div>
        </section>
    );
}

export default function WeekPlannerView({
    tasks,
    today,
    referenceDate,
    onReferenceDateChange,
    onMoveTask,
    onClose,
}: WeekPlannerViewProps) {
    const [moveTask, setMoveTask] = useState<Task | null>(null);
    const [activeTask, setActiveTask] = useState<Task | null>(null);
    const [announcement, setAnnouncement] = useState('');
    const moveTriggerRef = useRef<HTMLButtonElement | null>(null);
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
    const startDate = startOfLocalWeek(referenceDate);
    const days = buildWeekPlan(tasks, referenceDate);
    const dates = days.map(day => day.date);
    const openCount = days.reduce((sum, day) => sum + day.tasks.length, 0);

    const move = (taskId: string, destination: PlannerDestination) => {
        const task = tasks.find(candidate => candidate.id === taskId);
        if (!task) return;
        if (!canMoveTaskToPlannerDestination(task, destination)) {
            setAnnouncement(`${task.title} wurde nicht verschoben. Den Wochentag einer wiederholenden Aufgabe änderst du bewusst über Bearbeiten.`);
            return;
        }
        onMoveTask(taskId, destination);
        setAnnouncement(`${task.title} nach ${dateLabel(destination.date, { weekday: 'long', day: '2-digit', month: '2-digit' })}, ${PLANNER_LANE_LABELS[destination.lane]} verschoben.`);
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveTask(tasks.find(task => task.id === String(event.active.id)) ?? null);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        setActiveTask(null);
        if (!event.over) return;
        const destination = decodeLaneId(String(event.over.id));
        if (!destination) return;
        move(String(event.active.id), destination);
    };

    const openMoveDialog = (task: Task, trigger: HTMLButtonElement) => {
        moveTriggerRef.current = trigger;
        setMoveTask(task);
    };

    const closeMoveDialog = () => {
        setMoveTask(null);
        requestAnimationFrame(() => moveTriggerRef.current?.focus());
    };

    return (
        <div className="px-4 pb-8 sm:px-5" data-week-planner>
            <div className="mb-4 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onClose}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg-secondary hover:bg-fg/5"
                    aria-label="Wochenplaner schließen"
                >
                    <ArrowLeft size={22} aria-hidden="true" />
                </button>
                <div className="min-w-0">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary-text">Phase 2</p>
                    <h1 className="text-xl font-bold text-fg">Wochenplaner</h1>
                </div>
            </div>

            <section className="rounded-2xl border border-edge bg-surface-raised p-3" aria-label="Planungswoche auswählen">
                <div className="flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => onReferenceDateChange(previousPlannerWeek(referenceDate))}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-edge-muted text-fg-secondary"
                        aria-label="Vorherige Planungswoche"
                    >
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <div className="min-w-0 text-center">
                        <p className="text-[14px] font-bold text-fg">
                            {dateLabel(startDate, { day: '2-digit', month: 'short' })}
                            {' – '}
                            {dateLabel(dates[6], { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="mt-0.5 text-[11px] text-fg-secondary">{openCount} offene Aufgabe{openCount !== 1 ? 'n' : ''}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => onReferenceDateChange(nextPlannerWeek(referenceDate))}
                        className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-edge-muted text-fg-secondary"
                        aria-label="Nächste Planungswoche"
                    >
                        <ChevronRight size={20} aria-hidden="true" />
                    </button>
                </div>
                {startDate !== startOfLocalWeek(today) && (
                    <button
                        type="button"
                        onClick={() => onReferenceDateChange(today)}
                        className="mt-2 min-h-11 w-full rounded-xl bg-primary-surface text-[13px] font-semibold text-primary-text"
                    >
                        Zu dieser Woche
                    </button>
                )}
            </section>

            <div className="mt-4 rounded-xl border border-primary-border bg-primary-surface p-3 text-[12px] leading-5 text-primary-text">
                <div className="flex items-start gap-2">
                    <CalendarClock size={18} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <p>Ziehen oder „Verschieben“ wählen. Ohne-Zeit-Aufgaben behalten ihren Zustand. Bei Wiederholungen bleibt der Serientag geschützt.</p>
                </div>
            </div>

            <p role="status" aria-live="polite" className="sr-only">{announcement}</p>

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragCancel={() => setActiveTask(null)}
                onDragEnd={handleDragEnd}
            >
                <div className="mt-5 flex flex-col gap-5">
                    {days.map(day => {
                        const isToday = day.date === today;
                        return (
                            <section key={day.date} data-planner-day={day.date} aria-labelledby={`planner-day-${day.date}`}>
                                <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-edge pb-2">
                                    <h2 id={`planner-day-${day.date}`} className="text-[15px] font-bold text-fg">
                                        {dateLabel(day.date, { weekday: 'long', day: '2-digit', month: '2-digit' })}
                                        {isToday && <span className="ml-2 rounded-full bg-primary-surface px-2 py-0.5 text-[10px] text-primary-text">Heute</span>}
                                    </h2>
                                    <span className="flex-shrink-0 text-[11px] text-fg-secondary">{day.tasks.length} offen</span>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {PLANNER_LANES.map(lane => (
                                        <PlannerLaneSection
                                            key={lane}
                                            date={day.date}
                                            lane={lane}
                                            tasks={day.lanes[lane]}
                                            onMoveClick={openMoveDialog}
                                        />
                                    ))}
                                </div>
                            </section>
                        );
                    })}
                </div>
                <DragOverlay>
                    {activeTask ? (
                        <div className="max-w-[18rem] rounded-xl border border-primary bg-surface-raised px-3 py-2 shadow-2xl">
                            <p dir="auto" className="text-start text-[13px] font-bold text-fg">{activeTask.title}</p>
                            <p className="mt-1 text-[11px] text-fg-secondary">{PLANNER_LANE_LABELS[plannerLaneForTask(activeTask)]}</p>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            <MoveTaskModal
                task={moveTask}
                weekDates={dates}
                onClose={closeMoveDialog}
                onMove={move}
            />
        </div>
    );
}
