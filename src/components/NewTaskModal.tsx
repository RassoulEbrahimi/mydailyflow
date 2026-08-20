import React, { useState, useEffect, useRef } from 'react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Plus, Check, Trash2, CheckCircle2, ChevronDown, Mic, CalendarDays } from 'lucide-react';

import type { Task, ChecklistItem, Recurrence } from '../types/task';
import { deriveTimeBlock, formatDateLabel, getSmartDefaultTime, getTodayString, getTomorrowString } from '../utils/taskUtils';
import VoiceTaskModal from './VoiceTaskModal';

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Nie',
  daily: 'Täglich',
  every2days: 'Alle 2 Tage',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
};

const NewTaskModal = ({
  isOpen,
  onClose,
  onSave,
  taskToEdit,
  initialDraft,
  initialDate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt' | 'rolledOverFrom' | 'recurrenceAnchorDay'>) => void;
  taskToEdit?: Task | null;
  initialDraft?: Partial<Task> | null;
  /** Date inherited from the planning surface that opened the sheet. */
  initialDate?: string;
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [selectedTime, setSelectedTime] = useState('14:00');
  const [isTimeEnabled, setIsTimeEnabled] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [selectedDuration, setSelectedDuration] = useState('30m');
  const [isReminderEnabled, setIsReminderEnabled] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState('Medium');
  const [selectedRecurrence, setSelectedRecurrence] = useState<Recurrence>('none');
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const [showVoiceNoteModal, setShowVoiceNoteModal] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, sheetRef);

  useEffect(() => {
    if (isOpen) {
      if (taskToEdit) {
        setTitle(taskToEdit.title || '');
        const existingNotes = taskToEdit.notes || taskToEdit.description || '';
        setNotes(existingNotes);
        setShowNotes(!!existingNotes);
        const existing = taskToEdit.checklistItems ? [...taskToEdit.checklistItems] : [];
        setChecklistItems(existing);
        setShowChecklist(existing.length > 0);
        setNewChecklistText('');
        setSelectedTime(taskToEdit.time);
        setIsTimeEnabled(Boolean(taskToEdit.time));
        setSelectedDate(taskToEdit.date || getTodayString());
        setSelectedDuration(taskToEdit.duration);
        setSelectedPriority(taskToEdit.priority.charAt(0).toUpperCase() + taskToEdit.priority.slice(1));
        setSelectedRecurrence(taskToEdit.recurrence ?? 'none');
        setIsReminderEnabled(taskToEdit.reminderEnabled ?? true);
      } else if (initialDraft) {
        setTitle(initialDraft.title || '');
        const existingNotes = initialDraft.notes || initialDraft.description || '';
        setNotes(existingNotes);
        setShowNotes(!!existingNotes);
        setChecklistItems([]);
        setShowChecklist(false);
        setNewChecklistText('');
        setSelectedTime(initialDraft.time || getSmartDefaultTime());
        setIsTimeEnabled(initialDraft.time !== '');
        setSelectedDate(initialDraft.date || initialDate || getTodayString());
        setSelectedDuration(initialDraft.duration || '30m');
        setIsReminderEnabled(initialDraft.reminderEnabled ?? true);
        setSelectedPriority(initialDraft.priority ? initialDraft.priority.charAt(0).toUpperCase() + initialDraft.priority.slice(1) : 'Medium');
        setSelectedRecurrence(initialDraft.recurrence ?? 'none');
      } else {
        setTitle('');
        setNotes('');
        setShowNotes(false);
        setChecklistItems([]);
        setShowChecklist(false);
        setNewChecklistText('');
        setSelectedTime(getSmartDefaultTime());
        setIsTimeEnabled(true);
        setSelectedDate(initialDate || getTodayString());
        setSelectedDuration('30m');
        setIsReminderEnabled(true);
        setSelectedPriority('Medium');
        setSelectedRecurrence('none');
        setIsAdvancedExpanded(false);
      }
    }
  }, [isOpen, taskToEdit, initialDraft, initialDate]);

  const addChecklistItem = () => {
    const text = newChecklistText.trim();
    if (!text) return;
    const item: ChecklistItem = { id: Math.random().toString(36).substr(2, 9), text, completed: false };
    setChecklistItems(prev => [...prev, item]);
    setNewChecklistText('');
  };

  const removeChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.filter(i => i.id !== id));
  };

  const handleChecklistKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); }
  };

  const handleSaveClick = () => {
    if (!title.trim()) return; // Don't save empty tasks
    if (!selectedDate || selectedDate < getTodayString()) return;

    onSave({
      title: title.trim(),
      description: notes.trim(), // keep for backwards compat
      notes: notes.trim(),
      checklistItems: checklistItems.length > 0 ? checklistItems : undefined,
      time: isTimeEnabled ? selectedTime : '',
      duration: selectedDuration,
      timeBlock: deriveTimeBlock(isTimeEnabled ? selectedTime : ''),
      priority: selectedPriority.toLowerCase() as Task['priority'],
      recurrence: selectedRecurrence,
      reminderEnabled: isTimeEnabled && isReminderEnabled,
      date: selectedDate,
    });

    onClose();
  };

  const today = getTodayString();
  const tomorrow = getTomorrowString();
  const planningDateLabel = selectedDate === today
    ? 'Heute'
    : selectedDate === tomorrow
      ? 'Morgen'
      : selectedDate
        ? formatDateLabel(selectedDate)
        : 'Datum fehlt';
  const dateError = !selectedDate
    ? 'Bitte wähle ein Datum aus.'
    : selectedDate < today
      ? 'Vergangene Daten können nicht geplant werden.'
      : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet.
          The sheet stays mounted and is translated off-screen when closed, so
          without `inert` the Tab ring walks straight into a dialog the user
          cannot see. `inert` removes it from focus order *and* from the
          accessibility tree for exactly as long as it is closed. */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={taskToEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}
        inert={!isOpen}
        className={`fixed bottom-0 left-0 w-full bg-surface-overlay rounded-t-[2rem] z-50 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col max-h-[92vh] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
      >
        {/* ── Top handle + nav bar ── */}
        <div className="flex-none">
          <div className="w-10 h-1 bg-handle rounded-full mx-auto mt-3 mb-1" />
          <div className="flex items-center justify-between px-5 py-3">
            <button
              type="button"
              onClick={onClose}
              className="text-fg-secondary text-[15px] active:opacity-60 transition-opacity w-16 min-h-11 text-left"
            >
              Abbrechen
            </button>
            <h2 className="text-fg font-bold text-[16px]">{taskToEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={Boolean(dateError)}
              className="text-primary-text font-semibold text-[15px] active:opacity-60 transition-opacity w-16 min-h-11 text-right disabled:opacity-40"
            >
              Fertig
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-2 pb-4">

          {/* Task title */}
          <input
            type="text"
            id="task-title"
            aria-label="Aufgabentitel"
            dir="auto"
            placeholder="Aufgabentitel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus={isOpen && !taskToEdit}
            className="w-full bg-transparent text-fg text-[26px] font-bold placeholder:text-fg-placeholder mb-5 leading-tight"
          />

          {/* Add Note / Add Checklist pill buttons */}
          <div className="flex gap-3 mb-6">
            <button
              type="button"
              onClick={() => setShowNotes(v => !v)}
              aria-pressed={showNotes}
              className={`flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-full border text-[14px] font-medium transition-all ${
                showNotes
                  ? 'border-primary-border text-primary-text bg-primary-surface'
                  : 'border-edge-muted text-fg-secondary hover:border-primary/50 hover:text-fg'
              }`}
            >
              <Plus size={15} aria-hidden="true" />
              Notiz
            </button>
            <button
              type="button"
              onClick={() => setShowChecklist(v => !v)}
              aria-pressed={showChecklist}
              className={`flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-full border text-[14px] font-medium transition-all ${
                showChecklist
                  ? 'border-primary-border text-primary-text bg-primary-surface'
                  : 'border-edge-muted text-fg-secondary hover:border-primary/50 hover:text-fg'
              }`}
            >
              <Plus size={15} aria-hidden="true" />
              Checkliste
            </button>
          </div>

          {/* Notes inline section */}
          {showNotes && (
            <div className="mb-5 bg-surface-alt rounded-2xl px-4 py-3 border border-edge/50 relative group">
              <textarea
                rows={3}
                id="task-notes"
                aria-label="Notiz"
                dir="auto"
                placeholder="Notiz hinzufügen..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-fg placeholder:text-fg-placeholder text-[15px] resize-none leading-relaxed pb-6"
              />
              <button
                onClick={() => setShowVoiceNoteModal(true)}
                className="tap-target-44 absolute bottom-3 right-4 p-1.5 text-fg-secondary hover:text-primary-text bg-surface-inset hover:bg-surface-accent rounded-full transition-colors border border-transparent hover:border-primary/30"
                title="Sprachnotiz aufnehmen"
                aria-label="Sprachnotiz aufnehmen"
                type="button"
              >
                <Mic size={16} aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Checklist inline section */}
          {showChecklist && (
            <div className="mb-5">
              {checklistItems.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  {checklistItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-surface-alt rounded-2xl px-4 py-3">
                      <div className="flex-shrink-0 w-4 h-4 rounded border border-edge-strong flex items-center justify-center" aria-hidden="true">
                        {item.completed && <Check size={10} strokeWidth={3} className="text-primary-text" />}
                      </div>
                      <span dir="auto" className="min-w-0 flex-1 text-start break-words text-[14px] text-fg">{item.text}</span>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(item.id)}
                        className="tap-target-44 text-fg-secondary hover:text-danger transition-colors flex-shrink-0 p-0.5"
                        aria-label={`Checklistenpunkt entfernen: ${item.text}`}
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-surface-alt rounded-2xl px-4 py-3 border border-edge/50">
                <Plus size={16} className="text-fg-secondary flex-shrink-0" aria-hidden="true" />
                <input
                  type="text"
                  id="new-checklist-item"
                  aria-label="Checklistenpunkt hinzufügen"
                  dir="auto"
                  placeholder="Element hinzufügen..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={handleChecklistKeyDown}
                  className="flex-1 bg-transparent text-[14px] text-fg placeholder:text-fg-placeholder"
                />
                {newChecklistText.trim() && (
                  <button
                    type="button"
                    onClick={addChecklistItem}
                    className="text-primary-text text-[13px] font-semibold active:opacity-70 transition-opacity flex-shrink-0 min-h-11"
                  >
                    Hinzufügen
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Schedule card ── */}
          <div className="bg-surface-accent rounded-2xl p-4 mb-3 border border-edge-accent">
            <div className="flex items-center gap-2">
              <CalendarDays size={19} className="text-primary-text flex-shrink-0" aria-hidden="true" />
              <h3 className="text-fg font-bold text-[17px]">Zeitplan</h3>
            </div>

            <p
              role="status"
              className="mt-3 rounded-xl bg-primary-surface px-3 py-2 text-[13px] font-semibold text-primary-text"
            >
              {planningDateLabel} · {isTimeEnabled ? `${selectedTime} Uhr` : 'Ohne Zeit'}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSelectedDate(today)}
                aria-pressed={selectedDate === today}
                className={`min-h-11 rounded-xl border text-[14px] font-semibold transition-colors ${
                  selectedDate === today
                    ? 'bg-primary border-primary text-white'
                    : 'bg-surface-inset border-edge-muted text-fg-secondary'
                }`}
              >
                Heute
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(tomorrow)}
                aria-pressed={selectedDate === tomorrow}
                className={`min-h-11 rounded-xl border text-[14px] font-semibold transition-colors ${
                  selectedDate === tomorrow
                    ? 'bg-primary border-primary text-white'
                    : 'bg-surface-inset border-edge-muted text-fg-secondary'
                }`}
              >
                Morgen
              </button>
            </div>

            <label htmlFor="task-date" className="mt-3 block text-fg-muted text-[11px] font-semibold tracking-widest">
              DATUM WÄHLEN
            </label>
            <input
              type="date"
              id="task-date"
              aria-label="Aufgabendatum"
              value={selectedDate}
              min={today}
              aria-invalid={dateError ? 'true' : 'false'}
              aria-describedby={dateError ? 'task-date-error' : undefined}
              onChange={(e) => setSelectedDate(e.target.value)}
              className={`mt-2 w-full min-h-11 rounded-xl border bg-surface-inset px-3 text-[15px] font-semibold text-fg ${
                dateError ? 'border-danger' : 'border-edge-muted'
              }`}
            />
            {dateError && (
              <p id="task-date-error" role="alert" className="mt-2 text-[13px] font-medium text-danger">
                {dateError}
              </p>
            )}

            <div className="mt-4 border-t border-edge-accent pt-4">
              <span className="text-fg font-medium text-[15px]">Zeit</span>
              <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Zeitmodus">
                <button
                  type="button"
                  onClick={() => setIsTimeEnabled(true)}
                  aria-pressed={isTimeEnabled}
                  className={`min-h-11 rounded-xl border text-[14px] font-semibold transition-colors ${isTimeEnabled
                    ? 'bg-primary border-primary text-white'
                    : 'bg-surface-inset border-edge-muted text-fg-secondary'
                  }`}
                >
                  Mit Uhrzeit
                </button>
                <button
                  type="button"
                  onClick={() => setIsTimeEnabled(false)}
                  aria-pressed={!isTimeEnabled}
                  className={`min-h-11 rounded-xl border text-[14px] font-semibold transition-colors ${!isTimeEnabled
                    ? 'bg-primary border-primary text-white'
                    : 'bg-surface-inset border-edge-muted text-fg-secondary'
                  }`}
                >
                  Ohne Zeit
                </button>
              </div>
              {isTimeEnabled && (
                <div className="mt-3 flex items-center justify-between">
                  <label htmlFor="task-time" className="text-fg-secondary text-[14px]">Startzeit</label>
                  <input
                    type="time"
                    id="task-time"
                    aria-label="Startzeit"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="bg-surface-inset text-fg text-[24px] font-bold tabular-nums tracking-tight px-3 py-2 rounded-xl w-32 [&::-webkit-calendar-picker-indicator]:opacity-0 cursor-pointer text-center"
                  />
                </div>
              )}
            </div>

            {/* Collapsible Advanced Options */}
            <div className="mt-3 pt-4 border-t border-edge-accent">
              <button
                type="button"
                onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                aria-expanded={isAdvancedExpanded}
                className="w-full flex items-center justify-between text-left min-h-11 group"
              >
                <div>
                  <span className="text-fg font-medium text-[15px] block">Aufgabendetails</span>
                  {!isAdvancedExpanded && (
                    <span className="text-fg-muted text-[13px] mt-0.5 block">
                      {selectedDuration} • {RECURRENCE_LABELS[selectedRecurrence]} • {isTimeEnabled && isReminderEnabled ? 'Erinnerung an' : 'Erinnerung aus'} • {
                        selectedPriority === 'High' ? 'Hoch' : selectedPriority === 'Medium' ? 'Mittel' : 'Niedrig'
                      }
                    </span>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-edge-accent/50 flex items-center justify-center group-hover:bg-edge-accent transition-colors">
                  <ChevronDown className={`text-fg-muted transition-transform duration-300 ${isAdvancedExpanded ? 'rotate-180' : ''}`} size={18} aria-hidden="true" />
                </div>
              </button>

              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAdvancedExpanded ? 'max-h-[600px] opacity-100 mt-5' : 'max-h-0 opacity-0'}`}>
                {/* Duration chips */}
                <div className="mb-5">
                  <p className="text-fg-muted text-[11px] font-semibold tracking-widest mb-2">DAUER</p>
                  <div className="flex gap-2">
                    {['15m', '30m', '1h', '2h'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setSelectedDuration(d)}
                        aria-pressed={d === selectedDuration}
                        aria-label={`Dauer ${d}`}
                        className={`flex-1 py-2 min-h-11 rounded-full font-semibold text-[14px] border transition-all ${
                          d === selectedDuration
                            ? 'bg-primary border-primary text-white shadow-[0_0_12px_rgba(19,91,236,0.4)]'
                            : 'border-edge-muted text-fg-secondary hover:border-primary/40'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repeat row */}
                <div className="flex items-center justify-between py-3 border-t border-edge-accent">
                  <span className="text-fg text-[15px] font-medium">Wiederholen</span>
                  <div className="relative">
                    <select
                      id="task-recurrence"
                      aria-label="Wiederholung"
                      value={selectedRecurrence}
                      onChange={(e) => setSelectedRecurrence(e.target.value as Recurrence)}
                      className="appearance-none bg-transparent text-fg-secondary text-[14px] pr-5 min-h-11 cursor-pointer"
                    >
                      {(Object.entries(RECURRENCE_LABELS) as [Recurrence, string][]).map(([val, lbl]) => (
                        <option key={val} value={val} className="bg-surface-accent text-fg">{lbl}</option>
                      ))}
                    </select>
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-fg-secondary pointer-events-none text-[12px]" aria-hidden="true">▾</span>
                  </div>
                </div>

                {/* Remind me row */}
                <div className="flex items-center justify-between py-3 border-t border-edge-accent">
                  <span className="text-fg text-[15px] font-medium">Erinnern</span>
                  <div className="flex items-center gap-3">
                    <span className="text-fg-secondary text-[13px]">{isTimeEnabled && isReminderEnabled ? '10 Min vorher' : 'Aus'}</span>
                    <button
                      type="button"
                      onClick={() => setIsReminderEnabled(v => !v)}
                      role="switch"
                      aria-checked={isTimeEnabled && isReminderEnabled}
                      disabled={!isTimeEnabled}
                      aria-label="Erinnerung 10 Minuten vorher"
                      className={`tap-target-44 w-[46px] h-[26px] rounded-full relative transition-all duration-300 flex-shrink-0 ${
                        isTimeEnabled && isReminderEnabled ? 'bg-primary shadow-[0_0_10px_rgba(19,91,236,0.4)]' : 'bg-surface-control border border-edge-strong'
                      }`}
                    >
                      <div className={`absolute top-[2px] w-[22px] h-[22px] bg-white rounded-full shadow transition-all duration-300 ${
                        isTimeEnabled && isReminderEnabled ? 'left-[22px]' : 'left-[2px]'
                      }`} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Priority section */}
                <div className="pt-4 border-t border-edge-accent">
                  <p className="text-fg-muted text-[11px] font-semibold tracking-widest mb-3">PRIORITÄT</p>
                  <div className="flex gap-0 bg-surface-inset rounded-2xl p-1 shadow-inner border border-edge-accent/50">
                    {[
                      { value: 'Low',    label: 'Niedrig', activeColor: 'text-success' },
                      { value: 'Medium', label: 'Mittel',  activeColor: 'text-warning' },
                      { value: 'High',   label: 'Hoch',    activeColor: 'text-danger' },
                    ].map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setSelectedPriority(p.value)}
                        aria-pressed={p.value === selectedPriority}
                        aria-label={`Priorität ${p.label}`}
                        className={`flex-1 py-2.5 min-h-11 rounded-xl font-semibold text-[14px] transition-all ${
                          p.value === selectedPriority
                            ? `bg-surface-control ${p.activeColor} shadow-sm`
                            : 'text-fg-secondary hover:text-fg'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>{/* end scrollable body */}

        {/* ── Sticky Save button ── */}
        <div className="flex-none px-5 pb-8 pt-3 bg-surface-overlay">
          <button
            type="button"
            onClick={handleSaveClick}
            disabled={Boolean(dateError)}
            className="w-full bg-primary hover:brightness-110 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(19,91,236,0.45)] active:scale-[0.98] transition-all text-[16px] disabled:opacity-40 disabled:shadow-none"
          >
            <CheckCircle2 size={20} strokeWidth={2.5} aria-hidden="true" />
            <span>Speichern</span>
          </button>
        </div>
      </div>

      <VoiceTaskModal
        isOpen={showVoiceNoteModal}
        onClose={() => setShowVoiceNoteModal(false)}
        mode="note"
        onSuccess={(transcript: string) => {
          setNotes(prev => prev ? `${prev}\n${transcript}` : transcript);
          setShowVoiceNoteModal(false);
        }}
      />
    </>
  );
};

export default NewTaskModal;
