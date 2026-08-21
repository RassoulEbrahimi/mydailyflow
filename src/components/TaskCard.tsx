import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Check, Clock, Pencil, Trash2, RepeatIcon, RotateCcw, ArrowRight, MoreVertical, TimerReset } from 'lucide-react';
import type { Task } from '../types/task';
import { getRolloverLabel, hasTime, isTaskOverdue } from '../utils/taskUtils';

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
  onMoveTomorrow?: (id: string) => void;
  onStartFocus?: (task: Task) => void;
}

const TaskCard = ({
  task,
  onToggleComplete,
  onDelete,
  onEdit,
  onToggleChecklistItem,
  openSwipeId,
  setOpenSwipeId,
  onMoveTomorrow,
  onStartFocus,
}: TaskCardProps) => {
  const { id, title, time, duration, completed, priority } = task;

  const hasChecklist   = !!task.checklistItems && task.checklistItems.length > 0;
  const checklistDone  = hasChecklist ? task.checklistItems!.filter(i => i.completed).length : 0;
  const checklistTotal = hasChecklist ? task.checklistItems!.length : 0;
  const hasNotes       = !!task.notes && task.notes.trim().length > 0;

  const overdue = isTaskOverdue(task);
  const untimed = !hasTime(task);

  const isSwipeOpen = openSwipeId === id;
  const menuSurfaceId = `menu:${id}`;
  const isMenuOpen = openSwipeId === menuSurfaceId;

  // The swipe strip and the visible menu share `openSwipeId`, so opening any
  // action surface closes every other action surface in the task list.
  const cardRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeMenuIndex, setActiveMenuIndex] = useState(0);

  const showsFocus = !completed && Boolean(onStartFocus);
  const focusMenuIndex = showsFocus ? 0 : -1;
  const editMenuIndex = showsFocus ? 1 : 0;
  const tomorrowMenuIndex = editMenuIndex + 1;
  const menuItemCount = 2 + (showsFocus ? 1 : 0) + (!completed && onMoveTomorrow ? 1 : 0);

  const focusMenuItem = useCallback((index: number) => {
    const normalizedIndex = (index + menuItemCount) % menuItemCount;
    setActiveMenuIndex(normalizedIndex);
    menuItemRefs.current[normalizedIndex]?.focus();
  }, [menuItemCount]);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpenSwipeId(null);
    if (restoreFocus) {
      requestAnimationFrame(() => menuTriggerRef.current?.focus());
    }
  }, [setOpenSwipeId]);

  useEffect(() => {
    if (!isMenuOpen) return;

    setActiveMenuIndex(0);
    requestAnimationFrame(() => menuItemRefs.current[0]?.focus());

    const handleOutsidePointer = (event: PointerEvent) => {
      if (!cardRef.current?.contains(event.target as Node)) closeMenu();
    };

    document.addEventListener('pointerdown', handleOutsidePointer);
    return () => document.removeEventListener('pointerdown', handleOutsidePointer);
  }, [isMenuOpen, closeMenu]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      focusMenuItem(activeMenuIndex + 1);
    } else if (event.key === 'ArrowUp' || event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      focusMenuItem(activeMenuIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusMenuItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusMenuItem(menuItemCount - 1);
    }
  };

  const runMenuAction = (action: () => void) => {
    setOpenSwipeId(null);
    setDragX(0);
    action();
  };

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

  /**
   * Whether any part of the action strip is actually exposed.
   *
   * This is the containment fix, and it is deliberately not a colour trick.
   * At rest the strip used to paint at full opacity directly underneath the
   * card body. The body is a separately rasterised layer (it carries a
   * `transform` and `will-change: transform`), so its antialiased 16px corner
   * arcs never coincide exactly with the wrapper's own rounded clip. The
   * measured result was 31–47 strip-coloured pixels bleeding around each card's
   * right-hand corners at every device pixel ratio from 1 to 3 — the
   * blue/green/red sliver.
   *
   * Nothing that paints underneath a rounded, composited layer can be relied on
   * to stay hidden, so the strip simply does not paint until it is being
   * revealed. Its buttons stay in the DOM and in the tab ring, and focusing one
   * still opens the strip (PR3), so keyboard access is unchanged.
   */
  const isStripRevealed = isSwipeOpen || translateX !== 0;

  const closeSwipe = () => {
    setOpenSwipeId(null);
    setDragX(0);
  };

  /**
   * The swipe strip remains a fast touch shortcut. The persistent menu below is
   * now the discoverable pointer/keyboard route to the same task actions. Strip
   * focus still reveals it so the established keyboard path remains valid.
   */
  const handleStripFocus = () => setOpenSwipeId(id);

  const handleStripBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // relatedTarget is the element focus is moving *to*; staying inside the
    // strip must not close it.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    closeSwipe();
  };

  // ─── Priority colour ──────────────────────────────────────────────────────
  // `text-*` + `bg-current` so the glow (.dot-glow) can inherit the hue from
  // currentColor instead of a hardcoded rgba() literal that ignores the theme.
  const priorityDot = priority === 'high'
    ? 'text-priority-high bg-current dot-glow'
    : priority === 'medium'
    ? 'text-priority-medium bg-current dot-glow'
    : 'text-priority-low bg-current dot-glow';

  // The dot is the only *visual* carrier of priority, so the meaning has to be
  // available non-visually too — hence role="img" plus a real name.
  const priorityLabel = priority === 'high'
    ? 'Priorität: hoch'
    : priority === 'medium'
    ? 'Priorität: mittel'
    : 'Priorität: niedrig';

  return (
    <div
      ref={cardRef}
      data-task-card={id}
      className="relative rounded-2xl"
      style={{ touchAction: 'pan-y' }}
    >
      <div className="relative overflow-hidden rounded-2xl">

      {/* ── Action strip (revealed behind card by swipe) ────────────────────*/}
      <div
        className={`absolute inset-y-0 right-0 flex items-stretch rounded-2xl overflow-hidden transition-opacity duration-150 ${
          isStripRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{ width: ACTION_WIDTH }}
        onFocus={handleStripFocus}
        onBlur={handleStripBlur}
      >
        {/* Edit */}
        <button
          type="button"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); closeSwipe(); onEdit(task); }}
          className="flex flex-1 flex-col items-center justify-center bg-primary active:brightness-90 transition-all"
          style={{ minWidth: 0 }}
          aria-label="Bearbeiten"
        >
          <Pencil size={20} className="text-white" />
        </button>

        {overdue && onMoveTomorrow ? (
          <>
            {/* Tomorrow */}
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); closeSwipe(); onMoveTomorrow(id); }}
              className="flex flex-1 flex-col items-center justify-center bg-neutral-solid active:brightness-90 transition-all"
              style={{ minWidth: 0 }}
              aria-label="Morgen"
            >
              <ArrowRight size={20} className="text-white" />
            </button>

            {/* Done */}
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); closeSwipe(); onToggleComplete(id); }}
              className="flex flex-1 flex-col items-center justify-center bg-success-solid active:brightness-90 transition-all rounded-r-2xl"
              style={{ minWidth: 0 }}
              aria-label="Erledigt"
            >
              <Check size={20} className="text-white" />
            </button>
          </>
        ) : (
          <>
            {/* Done / Undo */}
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); closeSwipe(); onToggleComplete(id); }}
              className={`flex flex-1 flex-col items-center justify-center active:brightness-90 transition-all ${
                completed ? 'bg-warning-solid' : 'bg-success-solid'
              }`}
              style={{ minWidth: 0 }}
              aria-label={completed ? 'Rückgängig' : 'Erledigt'}
            >
              {completed
                ? <RotateCcw size={20} className="text-white" />
                : <Check size={20} className="text-white" />
              }
            </button>

            {/* Delete */}
            <button
              type="button"
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); closeSwipe(); onDelete(id); }}
              className="flex flex-1 flex-col items-center justify-center bg-danger-solid active:brightness-90 transition-all rounded-r-2xl"
              style={{ minWidth: 0 }}
              aria-label="Löschen"
            >
              <Trash2 size={20} className="text-white" />
            </button>
          </>
        )}
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
            ? 'bg-surface-overlay border-edge'
            : 'bg-surface border-edge active:border-primary/30'
        }`}
      >
        {/* ── Top row: checkbox · title · priority dot ──────────────────── */}
        <div className="flex items-start gap-3">
          {/* Checkbox — always directly tappable.
              `tap-target-44` grows the hit area to 44×44 without changing the
              painted 22px circle or the row's layout. */}
          <button
            type="button"
            onPointerDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); if (isSwipeOpen) { closeSwipe(); return; } onToggleComplete(id); }}
            className={`tap-target-44 flex-shrink-0 mt-[2px] w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all ${
              completed
                ? 'bg-primary border-primary'
                : 'border-2 border-edge-strong hover:border-primary/70'
            }`}
            style={{ border: completed ? 'none' : undefined }}
            role="checkbox"
            aria-checked={completed}
            aria-label={`${title} als erledigt markieren`}
          >
            {completed && <Check size={13} strokeWidth={3} className="text-white" aria-hidden="true" />}
          </button>

          {/* Title + meta.
              De-emphasis for a completed task is expressed with tokens, not a
              wrapper `opacity-50`: opacity composites the text toward the card
              and dropped the measured contrast to 1.56:1 in Light and 2.64:1 in
              Dark. */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              {/* Title — the user's own string decides its own direction.
                  `dir="auto"` gives this element its own `direction`, resolved
                  from the first *strong* character, so a leading emoji, digit or
                  bracket never decides. Because the direction lives on the
                  element (and Chromium isolates elements by default), it stays
                  here: it does not reorder the German metadata below or the
                  priority dot beside it. `text-start` then resolves the
                  alignment against the title's own direction rather than an
                  inherited physical `left`. */}
              <h3
                dir="auto"
                className={`flex-1 min-w-0 text-start font-semibold text-[15px] leading-relaxed break-words py-0.5 ${
                  completed ? 'line-through text-fg-secondary decoration-fg-faint' : 'text-fg'
                }`}
              >
                {title}
              </h3>
              {/* Priority dot — colour alone is not the only cue; the dot
                  carries an accessible name and a tooltip. */}
              <div
                className={`flex-shrink-0 mt-[5px] w-2 h-2 rounded-full ${priorityDot}`}
                role="img"
                aria-label={priorityLabel}
                title={priorityLabel}
              />
              <button
                ref={menuTriggerRef}
                type="button"
                onPointerDown={event => event.stopPropagation()}
                onClick={event => {
                  event.stopPropagation();
                  setDragX(0);
                  setOpenSwipeId(isMenuOpen ? null : menuSurfaceId);
                }}
                className="-my-2 -mr-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-fg-secondary transition-colors hover:bg-surface-control hover:text-fg focus-visible:bg-surface-control focus-visible:text-fg"
                aria-label={`Aktionen für ${title}`}
                aria-haspopup="menu"
                aria-expanded={isMenuOpen}
                aria-controls={`task-actions-${id}`}
              >
                <MoreVertical size={20} aria-hidden="true" />
              </button>
            </div>

            {/* Meta row — application chrome (time, duration, badges), never
                user-authored. Pinned to `ltr` so the German metadata keeps its
                order and reads left-to-right no matter which direction the
                title above it resolved to. */}
            <div dir="ltr" className="flex items-center gap-2 mt-1 flex-wrap">
              {/* A task without a time is a valid state, not a broken one. The
                  bullet is part of the time segment, so an untimed task shows
                  "Ohne Zeit • 30m" rather than a leading " • 30m". */}
              <span className="flex items-center gap-1.5 text-[11.5px] text-fg-meta font-medium">
                <Clock size={12} className="flex-shrink-0 opacity-70" aria-hidden="true" />
                {untimed ? 'Ohne Zeit' : time}
                {duration ? ` • ${duration}` : ''}
              </span>

              {/* Informational badges are deliberately neutral. Semantic badge
                  colour is reserved for overdue and carried-over state. */}
              {task.recurrence && task.recurrence !== 'none' && (
                <span
                  className="flex items-center gap-1 text-[10px] font-medium text-fg-meta bg-surface-raised border border-edge px-1.5 py-0.5 rounded-md leading-tight flex-shrink-0"
                  role="img"
                  aria-label="Wiederholende Aufgabe"
                  title="Wiederholende Aufgabe"
                >
                  <RepeatIcon size={9} aria-hidden="true" />
                </span>
              )}

              {/* Rollover badge */}
              {task.rolledOverFrom && !completed && (
                <span
                  className="flex items-center gap-1 text-[10px] font-medium text-warning bg-warning-surface px-1.5 py-0.5 rounded-md leading-tight flex-shrink-0"
                  aria-label={`${getRolloverLabel(task.rolledOverFrom)} übernommen`}
                >
                  ↩ {getRolloverLabel(task.rolledOverFrom)}
                </span>
              )}

              {/* Overdue badge */}
              {overdue && (
                <span className="flex items-center gap-1 text-[10px] font-medium text-danger bg-danger-surface px-1.5 py-0.5 rounded-md leading-tight flex-shrink-0">
                  Überfällig
                </span>
              )}

              {/* Checklist progress badge */}
              {hasChecklist && (
                <span
                  className="flex items-center gap-1 text-[10px] font-medium text-fg-meta bg-surface-raised border border-edge px-1.5 py-0.5 rounded-md leading-tight flex-shrink-0"
                  aria-label={`Checkliste: ${checklistDone} von ${checklistTotal} erledigt`}
                >
                  ☑ {checklistDone}/{checklistTotal}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Checklist items preview (inline, tappable) ─────────────────── */}
        {hasChecklist && (
          <div className="mt-2.5 ml-[34px] flex flex-col gap-0.5">
            {task.checklistItems!.slice(0, 4).map(item => (
              <button
                key={item.id}
                type="button"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); if (isSwipeOpen) { closeSwipe(); return; } onToggleChecklistItem(id, item.id); }}
                // 44px activation height, full row width. Rows are stacked with a
                // 2px gap, so the enlarged areas sit next to each other rather
                // than overlapping, and no pseudo-element is involved.
                className="flex w-full items-center gap-2 text-left group/ci min-h-11 py-1"
                role="checkbox"
                aria-checked={item.completed}
              >
                <div className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                  item.completed
                    ? 'bg-primary border-primary'
                    : 'border-edge-strong group-hover/ci:border-primary/60'
                }`}>
                  {item.completed && <Check size={8} strokeWidth={3} className="text-white" aria-hidden="true" />}
                </div>
                <span
                  dir="auto"
                  className={`min-w-0 flex-1 text-start break-words text-[11.5px] leading-relaxed ${
                    item.completed ? 'line-through text-fg-disabled' : 'text-fg-meta'
                  }`}
                >
                  {item.text}
                </span>
              </button>
            ))}
            {task.checklistItems!.length > 4 && (
              <span className="text-[11px] text-fg-disabled ml-[18px]">
                +{task.checklistItems!.length - 4} weitere
              </span>
            )}
          </div>
        )}

        {/* ── Notes preview (clamped 2 lines) ──────────────────────────────── */}
        {hasNotes && (
          <p
            dir="auto"
            className="mt-2 ml-[34px] text-start break-words text-[11.5px] leading-relaxed text-fg-meta line-clamp-2"
          >
            {task.notes}
          </p>
        )}
      </div>
      </div>

      {isMenuOpen && (
        <div
          id={`task-actions-${id}`}
          role="menu"
          aria-label={`Aktionen für ${title}`}
          className="absolute right-2 top-12 z-40 w-44 overflow-hidden rounded-xl border border-edge bg-surface-raised p-1.5 shadow-2xl"
          onKeyDown={handleMenuKeyDown}
        >
          {showsFocus && (
            <button
              ref={element => { menuItemRefs.current[focusMenuIndex] = element; }}
              type="button"
              role="menuitem"
              tabIndex={activeMenuIndex === focusMenuIndex ? 0 : -1}
              onClick={() => runMenuAction(() => onStartFocus!(task))}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-primary-text hover:bg-primary-surface focus-visible:bg-primary-surface"
            >
              <TimerReset size={17} aria-hidden="true" />
              Fokus starten
            </button>
          )}
          <button
            ref={element => { menuItemRefs.current[editMenuIndex] = element; }}
            type="button"
            role="menuitem"
            tabIndex={activeMenuIndex === editMenuIndex ? 0 : -1}
            onClick={() => runMenuAction(() => onEdit(task))}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-fg hover:bg-surface-control focus-visible:bg-surface-control"
          >
            <Pencil size={17} aria-hidden="true" />
            Bearbeiten
          </button>

          {!completed && onMoveTomorrow && (
            <button
              ref={element => { menuItemRefs.current[tomorrowMenuIndex] = element; }}
              type="button"
              role="menuitem"
              tabIndex={activeMenuIndex === tomorrowMenuIndex ? 0 : -1}
              onClick={() => runMenuAction(() => onMoveTomorrow(id))}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-fg hover:bg-surface-control focus-visible:bg-surface-control"
            >
              <ArrowRight size={17} aria-hidden="true" />
              Morgen
            </button>
          )}

          <button
            ref={element => { menuItemRefs.current[menuItemCount - 1] = element; }}
            type="button"
            role="menuitem"
            tabIndex={activeMenuIndex === menuItemCount - 1 ? 0 : -1}
            onClick={() => runMenuAction(() => onDelete(id))}
            className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-danger hover:bg-danger-surface focus-visible:bg-danger-surface"
          >
            <Trash2 size={17} aria-hidden="true" />
            Löschen
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskCard;
