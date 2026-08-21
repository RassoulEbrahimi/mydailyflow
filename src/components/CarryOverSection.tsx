import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';

import type { Task } from '../types/task';
import TaskCard from './TaskCard';

interface CarryOverSectionProps {
  tasks: Task[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
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
    <section aria-labelledby="carry-over-heading" className="mx-5 mt-5">
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[14px] text-start focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
        aria-controls="carry-over-tasks"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning-surface text-warning" aria-hidden="true">
            <RotateCcw size={17} />
          </span>
          <span className="min-w-0">
            <span id="carry-over-heading" className="block text-[16px] font-bold text-fg">Übernommen</span>
            <span className="block text-[12px] font-medium text-fg-secondary">{tasks.length} von früher</span>
          </span>
        </span>
        {expanded
          ? <ChevronUp size={19} className="shrink-0 text-fg-secondary" aria-hidden="true" />
          : <ChevronDown size={19} className="shrink-0 text-fg-secondary" aria-hidden="true" />}
      </button>

      {expanded && (
        <div id="carry-over-tasks" className="mt-3">
          <p className="mb-3 text-[12px] leading-relaxed text-fg-secondary">
            Automatisch übertragen, weil sie offen geblieben sind. Neu einplanen oder abschließen.
          </p>
          <div className="flex flex-col gap-2.5">
            {tasks.map(task => (
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
            ))}
          </div>
        </div>
      )}
    </section>
  );
};

export default CarryOverSection;
