import { CalendarCheck2, ChevronDown, ChevronUp } from 'lucide-react';

import type { Task } from '../types/task';
import { formatDateLabel } from '../utils/taskUtils';
import TaskCard from './TaskCard';

interface CarryOverSectionProps {
  tasks: Task[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onAcceptToday: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onToggleChecklistItem: (taskId: string, itemId: string) => void;
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  onMoveTomorrow: (id: string) => void;
  onStartFocus: (task: Task) => void;
}

const CarryOverSection = ({
  tasks,
  expanded,
  onExpandedChange,
  onAcceptToday,
  onToggleComplete,
  onDelete,
  onEdit,
  onToggleChecklistItem,
  openSwipeId,
  setOpenSwipeId,
  onMoveTomorrow,
  onStartFocus,
}: CarryOverSectionProps) => {
  if (tasks.length === 0) return null;

  return (
    <section aria-labelledby="morning-triage-heading" className="mx-5 mt-5">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        aria-controls="morning-triage-tasks"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-surface text-warning" aria-hidden="true">
            <CalendarCheck2 size={17} />
          </span>
          <span className="min-w-0">
            <span id="morning-triage-heading" className="block text-[16px] font-bold text-fg">Morgen-Check</span>
            <span className="block text-[12px] font-medium text-fg-secondary">{tasks.length} aus früheren Tagen</span>
          </span>
        </span>
        {expanded
          ? <ChevronUp size={19} className="shrink-0 text-fg-secondary" aria-hidden="true" />
          : <ChevronDown size={19} className="shrink-0 text-fg-secondary" aria-hidden="true" />}
      </button>

      {expanded && (
        <div id="morning-triage-tasks" className="mt-3">
          <p className="mb-3 text-[12px] leading-relaxed text-fg-secondary">
            Nichts wird automatisch in Heute verschoben. Entscheide bewusst, was in deinen Plan gehört.
          </p>
          <div className="flex flex-col gap-2.5">
            {tasks.map(task => (
              <div key={task.id} className="rounded-2xl bg-surface-raised p-2">
                <TaskCard
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
                <p className="px-2 pt-2 text-[11px] font-medium text-fg-secondary">
                  Ursprünglich {formatDateLabel(task.rolledOverFrom ?? task.date)}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onAcceptToday(task.id)}
                    aria-label={`${task.title} heute einplanen`}
                    className="min-h-11 rounded-xl bg-primary px-3 text-[13px] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
                  >
                    Heute einplanen
                  </button>
                  <button
                    type="button"
                    onClick={() => onEdit(task)}
                    aria-label={`${task.title} neu planen`}
                    className="min-h-11 rounded-xl border border-edge bg-surface px-3 text-[13px] font-semibold text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
                  >
                    Neu planen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default CarryOverSection;
