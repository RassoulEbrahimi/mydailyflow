import { Check, Clock3, Pencil } from 'lucide-react';

import type { Task } from '../types/task';

interface NowFocusCardProps {
  task: Task;
  openCount: number;
  currentTime: string;
  onComplete: (id: string) => void;
  onEdit: (task: Task) => void;
}

const NowFocusCard = ({ task, openCount, currentTime, onComplete, onEdit }: NowFocusCardProps) => {
  const timing = task.time >= currentTime ? `ab ${task.time}` : `offen seit ${task.time}`;

  return (
    <section
      aria-label={`Jetzt: ${task.title}`}
      className="mx-5 mt-4 rounded-[20px] border border-edge-accent bg-surface-accent p-4"
    >
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-text">
          Jetzt · {timing}
        </p>
        <p className="shrink-0 text-[12px] font-medium text-fg-secondary">
          {openCount} offen heute
        </p>
      </div>

      <h2 dir="auto" className="text-start text-[18px] font-bold leading-snug text-fg break-words">
        {task.title}
      </h2>
      <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium text-fg-secondary" dir="ltr">
        <Clock3 size={14} aria-hidden="true" />
        <span>{task.time} · {task.duration}</span>
      </p>

      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => onComplete(task.id)}
          className="min-h-11 rounded-[14px] bg-primary px-3 text-[14px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          aria-label={`Aufgabe erledigen: ${task.title}`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Check size={17} aria-hidden="true" />
            Erledigt
          </span>
        </button>
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="min-h-11 rounded-[14px] border border-edge-strong px-3 text-[14px] font-semibold text-fg-secondary transition-colors hover:bg-surface-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
          aria-label={`Aufgabe bearbeiten: ${task.title}`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Pencil size={16} aria-hidden="true" />
            Bearbeiten
          </span>
        </button>
      </div>
    </section>
  );
};

export default NowFocusCard;
