import type { ReactNode, RefObject } from 'react';
import { CalendarPlus, CheckCircle2 } from 'lucide-react';

import type { TodayPlanModel } from '../hooks/useTodayPlanModel';
import type { DailyEssential } from '../types/essential';
import type { Task } from '../types/task';
import CarryOverSection from './CarryOverSection';
import DailyEssentialsSection from './DailyEssentialsSection';
import HomeHero from './HomeHero';
import NowFocusCard from './NowFocusCard';
import PlanningCapacityCard from './PlanningCapacityCard';
import TaskCard from './TaskCard';
import TodayCompletedSection from './TodayCompletedSection';

interface TaskActions {
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onToggleChecklistItem: (taskId: string, itemId: string) => void;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  onMoveTomorrow: (id: string) => void;
  onStartFocus: (task: Task) => void;
}

interface TodayViewProps extends TaskActions {
  model: TodayPlanModel;
  currentTime: string;
  stickyHeroEnabled: boolean;
  pinnedRef: RefObject<HTMLElement | null>;
  carryOverExpanded: boolean;
  onCarryOverExpandedChange: (expanded: boolean) => void;
  onAcceptToday: (id: string) => void;
  essentials: DailyEssential[];
  progressById: Record<string, number>;
  onUpdateProgress: (id: string, progress: number) => void;
  onManageEssentials: () => void;
  todayCompletedExpanded: boolean;
  onTodayCompletedExpandedChange: (expanded: boolean) => void;
  onPlanTomorrow: () => void;
  onShowUpcoming: () => void;
}

const TaskSection = ({
  title,
  timeRange,
  accentClass,
  children,
}: {
  title: string;
  timeRange?: string;
  accentClass: string;
  children: ReactNode;
}) => (
  <section aria-label={timeRange ? `${title} (${timeRange})` : title}>
    <div className="flex items-center gap-2.5 mb-3">
      <div className={`h-7 w-[3px] rounded-full bg-current accent-glow ${accentClass}`} aria-hidden="true" />
      <div className="flex items-baseline gap-2.5">
        <h2 className="text-[16px] font-bold text-fg tracking-tight">{title}</h2>
        {timeRange && <span className="text-[12px] font-medium text-fg-secondary">{timeRange}</span>}
      </div>
    </div>
    <div className="flex flex-col gap-2.5">{children}</div>
  </section>
);

export default function TodayView({
  model,
  currentTime,
  stickyHeroEnabled,
  pinnedRef,
  carryOverExpanded,
  onCarryOverExpandedChange,
  onAcceptToday,
  essentials,
  progressById,
  onUpdateProgress,
  onManageEssentials,
  todayCompletedExpanded,
  onTodayCompletedExpandedChange,
  onPlanTomorrow,
  onShowUpcoming,
  onToggleComplete,
  onDelete,
  onEdit,
  onToggleChecklistItem,
  openSwipeId,
  setOpenSwipeId,
  onMoveTomorrow,
  onStartFocus,
}: TodayViewProps) {
  const renderTaskCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      onToggleComplete={onToggleComplete}
      onDelete={onDelete}
      onEdit={onEdit}
      onToggleChecklistItem={onToggleChecklistItem}
      openSwipeId={openSwipeId}
      setOpenSwipeId={setOpenSwipeId}
      onMoveTomorrow={onMoveTomorrow}
      onStartFocus={onStartFocus}
    />
  );

  return (
    <>
      <HomeHero
        completed={model.todaySummary.completedPlanned}
        total={model.todaySummary.totalPlanned}
        percentage={model.todaySummary.percentage}
        needsTriage={model.morningTriageTasks.length}
        stickyEnabled={stickyHeroEnabled}
        panelRef={pinnedRef}
      />

      {model.nowTask && (
        <NowFocusCard
          task={model.nowTask}
          openCount={model.todaySummary.openPlanned}
          currentTime={currentTime}
          onComplete={onToggleComplete}
          onEdit={onEdit}
          onStartFocus={onStartFocus}
        />
      )}

      <CarryOverSection
        tasks={model.morningTriageTasks}
        expanded={carryOverExpanded}
        onExpandedChange={onCarryOverExpandedChange}
        onAcceptToday={onAcceptToday}
        onToggleComplete={onToggleComplete}
        onDelete={onDelete}
        onEdit={onEdit}
        onToggleChecklistItem={onToggleChecklistItem}
        openSwipeId={openSwipeId}
        setOpenSwipeId={setOpenSwipeId}
        onMoveTomorrow={onMoveTomorrow}
        onStartFocus={onStartFocus}
      />

      <DailyEssentialsSection
        essentials={essentials}
        progressById={progressById}
        onUpdateProgress={onUpdateProgress}
        onManageClick={onManageEssentials}
      />

      <div className="flex flex-col gap-8 px-5 pt-2">
        {model.plannedOpenTasks.length > 0 && <PlanningCapacityCard tasks={model.plannedOpenTasks} />}

        {model.morningTasks.length > 0 && (
          <TaskSection title="Morgen" timeRange="06:00 – 12:00" accentClass="text-block-morning">
            {model.morningTasks.map(renderTaskCard)}
          </TaskSection>
        )}
        {model.afternoonTasks.length > 0 && (
          <TaskSection title="Nachmittag" timeRange="12:00 – 18:00" accentClass="text-block-afternoon">
            {model.afternoonTasks.map(renderTaskCard)}
          </TaskSection>
        )}
        {model.eveningTasks.length > 0 && (
          <TaskSection title="Abend" timeRange="18:00 – 23:00" accentClass="text-block-evening">
            {model.eveningTasks.map(renderTaskCard)}
          </TaskSection>
        )}
        {model.untimedTasks.length > 0 && (
          <TaskSection title="Ohne Zeit" accentClass="text-fg-secondary">
            {model.untimedTasks.map(renderTaskCard)}
          </TaskSection>
        )}

        {model.plannedOpenTasks.length === 0 && (
          <div
            data-testid="today-plan-empty"
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-edge-subtle bg-surface-inset px-3 py-2 text-center text-[13px] font-medium text-fg-secondary"
          >
            <CheckCircle2 size={18} className="shrink-0 text-fg-faint" aria-hidden="true" />
            <span>{model.pendingTaskCount === 0 && model.morningTriageTasks.length === 0
              ? 'Alle Aufgaben für heute erledigt!'
              : 'Noch keine Aufgaben für heute eingeplant.'}</span>
          </div>
        )}

        <TodayCompletedSection
          tasks={model.completedTodayTasks}
          expanded={todayCompletedExpanded}
          onExpandedChange={onTodayCompletedExpandedChange}
          onToggleComplete={onToggleComplete}
          onDelete={onDelete}
          onEdit={onEdit}
          onToggleChecklistItem={onToggleChecklistItem}
          openSwipeId={openSwipeId}
          setOpenSwipeId={setOpenSwipeId}
          onMoveTomorrow={onMoveTomorrow}
        />

        <section aria-labelledby="tomorrow-planning-heading" className="rounded-2xl border border-edge bg-surface-raised p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary-surface text-primary-text">
              <CalendarPlus size={22} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id="tomorrow-planning-heading" className="text-[16px] font-bold text-fg">Morgen planen</h2>
              <p className="mt-1 text-[13px] leading-5 text-fg-secondary">
                Nächste Aufgabe festlegen oder den kommenden Plan prüfen.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" onClick={onPlanTomorrow} className="min-h-11 rounded-xl bg-primary px-3 text-[13px] font-semibold text-white">
              Aufgabe für morgen
            </button>
            <button type="button" onClick={onShowUpcoming} className="min-h-11 rounded-xl border border-edge-muted bg-surface-inset px-3 text-[13px] font-semibold text-fg-secondary">
              Kommende ansehen
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
