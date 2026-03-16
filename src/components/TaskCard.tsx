import React, { useRef, useState, useCallback } from 'react';
import { Check, Clock, Pencil, Trash2, RepeatIcon, RotateCcw } from 'lucide-react';
import type { Task } from '../types/task';
import { getRolloverLabel } from '../utils/taskUtils';

// ─── Swipe constants ──────────────────────────────────────────────────────────
const SWIPE_THRESHOLD = 60;   // px — must drag this far before actions reveal
const ACTION_WIDTH    = 176;  // px — total width of revealed action strip

interface TaskCardProps {
  task: Task;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  onToggleChecklistItem: (taskId: string, itemId: string) => void;
  /** Shared state to ensure only one card is swiped open at once */
  openSwipeId: string | null;
  setOpenSwipeId: (id: string | null) => void;
  /** React key — declared to satisfy stricter tsconfig settings */
  key?: React.Key;
}

const TaskCard = ({
  task,
  onToggleComplete,
  onDelete,
  onEdit,
  onToggleChecklistItem,
  openSwipeId,
  setOpenSwipeId,
}: TaskCardProps) => {
  const { id, title, time, duration, completed, priority } = task;

  const hasChecklist   = !!task.checklistItems && task.checklistItems.length > 0;
  const checklistDone  = hasChecklist ? task.checklistItems!.filter(i => i.completed).length : 0;
  const checklistTotal = hasChecklist ? task.checklistItems!.length : 0;
  const hasNotes       = !!task.notes && task.notes.trim().length > 0;

  const isSwipeOpen = openSwipeId === id;

  // ─── Touch swipe state ────────────────────────────────────────────────────
  const touchStartX   = useRef<number>(0);
  const touchStartY   = useRef<number>(0);
  const isDragging    = useRef<boolean>(false);
  const [dragX, setDragX] = useState(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current  = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // Decide axis on first significant movement
    if (!isDragging.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (Math.abs(dy) > Math.abs(dx)) {
          // Primarily vertical → let the scroll happen, ignore swipe
          return;
        }
        isDragging.current = true;
      } else {
        return; // wait for threshold
      }
    }

    if (!isDragging.current) return;

    // Prevent vertical scroll while swiping horizontally
    e.preventDefault();

    if (isSwipeOpen) {
      // Already open — track offset relative to fully-open position
      const raw = -ACTION_WIDTH + dx;
      setDragX(Math.min(0, Math.max(-ACTION_WIDTH, raw)));
    } else {
      if (dx < 0) {
        // Swiping left — clamp to ACTION_WIDTH
        setDragX(Math.max(-ACTION_WIDTH, dx));
      }
    }
  }, [isSwipeOpen]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (isSwipeOpen) {
      // If dragged back far enough toward right, close
      if (dragX > -ACTION_WIDTH + SWIPE_THRESHOLD) {
        setOpenSwipeId(null);
        setDragX(0);
      } else {
        // Stay open
        setDragX(0);
      }
    } else {
      // If dragged left past threshold, open
      if (dragX < -SWIPE_THRESHOLD) {
        setOpenSwipeId(id);
        setDragX(0);
      } else {
        setDragX(0);
      }
    }
  }, [isSwipeOpen, dragX, id, setOpenSwipeId]);

  // Computed translateX for the card body
  const translateX = isSwipeOpen
    ? dragX - ACTION_WIDTH   // dragging from open position
    : dragX;                 // dragging from closed position

  const closeSwipe = () => {
    setOpenSwipeId(null);
    setDragX(0);
  };

  // ─── Priority colour ──────────────────────────────────────────────────────
  const priorityDot = priority === 'high'
    ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]'
    : priority === 'medium'
    ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.7)]'
    : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]';

  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ touchAction: 'pan-y' }}>

      {/* ── Action strip (revealed behind card by swipe) ────────────────────*/}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: ACTION_WIDTH }}
      >
        {/* Edit */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); closeSwipe(); onEdit(task); }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-[#1d4aba] active:brightness-90 transition-all"
          style={{ minWidth: 0 }}
        >
          <Pencil size={18} className="text-white" />
          <span className="text-[11px] font-semibold text-white">Edit</span>
        </button>

        {/* Done / Undo */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); closeSwipe(); onToggleComplete(id); }}
          className={`flex flex-1 flex-col items-center justify-center gap-1 active:brightness-90 transition-all ${
            completed ? 'bg-amber-600' : 'bg-emerald-600'
          }`}
          style={{ minWidth: 0 }}
        >
          {completed
            ? <RotateCcw size={18} className="text-white" />
            : <Check size={18} className="text-white" />
          }
          <span className="text-[11px] font-semibold text-white">
            {completed ? 'Undo' : 'Done'}
          </span>
        </button>

        {/* Delete */}
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); closeSwipe(); onDelete(id); }}
          className="flex flex-1 flex-col items-center justify-center gap-1 bg-red-600 active:brightness-90 transition-all rounded-r-2xl"
          style={{ minWidth: 0 }}
        >
          <Trash2 size={18} className="text-white" />
          <span className="text-[11px] font-semibold text-white">Delete</span>
        </button>
      </div>

      {/* ── Card body (slides left to reveal actions) ───────────────────────*/}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => { if (isSwipeOpen) closeSwipe(); }}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isDragging.current ? 'none' : 'transform 0.22s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
        }}
        className={`relative flex flex-col p-4 rounded-2xl border transition-colors ${
          completed
            ? 'bg-[#141c2e] border-[#1e2b40]'
            : 'bg-[#192233] border-[#232f48] active:border-primary/30'
        }`}
      >
        {/* ── Top row: checkbox · title · priority dot ──────────────────── */}
        <div className="flex items-start gap-3">
          {/* Checkbox — always directly tappable */}
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); if (isSwipeOpen) { closeSwipe(); return; } onToggleComplete(id); }}
            className={`flex-shrink-0 mt-[2px] w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all ${
              completed
                ? 'bg-primary border-primary'
                : 'border-2 border-[#3a4e72] hover:border-primary/70'
            }`}
            style={{ border: completed ? 'none' : undefined }}
          >
            {completed && <Check size={13} strokeWidth={3} className="text-white" />}
          </button>

          {/* Title + meta */}
          <div className={`flex-1 min-w-0 ${completed ? 'opacity-50' : ''}`}>
            <div className="flex items-start gap-2">
              {/* Title — dir="auto" so Persian renders RTL */}
              <h3
                dir="auto"
                className={`flex-1 min-w-0 font-semibold text-[15px] leading-snug break-words ${
                  completed ? 'line-through text-slate-400 decoration-slate-500' : 'text-white'
                }`}
              >
                {title}
              </h3>
              {/* Priority dot */}
              <div className={`flex-shrink-0 mt-[5px] w-2 h-2 rounded-full ${priorityDot}`} title={`${priority} priority`} />
            </div>

            {/* Meta row */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-[12px] text-text-secondary">
                <Clock size={12} className="flex-shrink-0" />
                {time}
              </span>
              <span className="w-0.5 h-0.5 rounded-full bg-[#3a4e72]" />
              <span className="text-[12px] text-text-secondary">{duration}</span>

              {/* Recurrence badge */}
              {task.recurrence && task.recurrence !== 'none' && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/80 bg-violet-400/10 px-1.5 py-0.5 rounded-full leading-tight flex-shrink-0">
                  <RepeatIcon size={9} />
                </span>
              )}

              {/* Rollover badge */}
              {task.rolledOverFrom && !completed && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400/80 bg-amber-400/10 px-1.5 py-0.5 rounded-full leading-tight flex-shrink-0">
                  ↩ {getRolloverLabel(task.rolledOverFrom)}
                </span>
              )}

              {/* Checklist progress badge */}
              {hasChecklist && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full leading-tight flex-shrink-0">
                  ☑ {checklistDone}/{checklistTotal}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Checklist items preview (inline, tappable) ─────────────────── */}
        {hasChecklist && (
          <div className={`mt-3 ml-[34px] flex flex-col gap-1 ${completed ? 'opacity-40' : ''}`}>
            {task.checklistItems!.slice(0, 4).map(item => (
              <button
                key={item.id}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); if (isSwipeOpen) { closeSwipe(); return; } onToggleChecklistItem(id, item.id); }}
                className="flex items-center gap-2 text-left group/ci"
              >
                <div className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                  item.completed
                    ? 'bg-primary/80 border-primary'
                    : 'border-[#384666] group-hover/ci:border-primary/60'
                }`}>
                  {item.completed && <Check size={8} strokeWidth={3} className="text-white" />}
                </div>
                <span
                  dir="auto"
                  className={`text-[12px] leading-tight ${
                    item.completed ? 'line-through text-[#4a5a78]' : 'text-[#8fa3c8]'
                  }`}
                >
                  {item.text}
                </span>
              </button>
            ))}
            {task.checklistItems!.length > 4 && (
              <span className="text-[11px] text-[#4a5a78] ml-[18px]">
                +{task.checklistItems!.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* ── Notes preview (clamped 2 lines) ──────────────────────────────── */}
        {hasNotes && (
          <p
            dir="auto"
            className={`mt-2.5 ml-[34px] text-[12px] leading-relaxed text-[#6a7f9e] line-clamp-2 ${completed ? 'opacity-40' : ''}`}
          >
            {task.notes}
          </p>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
