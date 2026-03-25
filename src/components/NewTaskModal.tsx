import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, CheckCircle2, ChevronDown } from 'lucide-react';

import type { Task, ChecklistItem, Recurrence } from '../types/task';
import { deriveTimeBlock } from '../utils/taskUtils';

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Never',
  daily: 'Daily',
  every2days: 'Every 2 days',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const NewTaskModal = ({
  isOpen,
  onClose,
  onSave,
  taskToEdit,
  initialDraft,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom'>) => void;
  taskToEdit?: Task | null;
  initialDraft?: Partial<Task> | null;
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [selectedTime, setSelectedTime] = useState('14:00');
  const [selectedDuration, setSelectedDuration] = useState('30m');
  const [isReminderEnabled, setIsReminderEnabled] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState('Medium');
  const [selectedRecurrence, setSelectedRecurrence] = useState<Recurrence>('none');
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);

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
        setSelectedTime(initialDraft.time || '14:00');
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
        setSelectedTime('14:00');
        setSelectedDuration('30m');
        setIsReminderEnabled(true);
        setSelectedPriority('Medium');
        setSelectedRecurrence('none');
      }
    }
  }, [isOpen, taskToEdit, initialDraft]);

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

    onSave({
      title: title.trim(),
      description: notes.trim(), // keep for backwards compat
      notes: notes.trim(),
      checklistItems: checklistItems.length > 0 ? checklistItems : undefined,
      time: selectedTime,
      duration: selectedDuration,
      timeBlock: deriveTimeBlock(selectedTime),
      priority: selectedPriority.toLowerCase() as Task['priority'],
      recurrence: selectedRecurrence,
      reminderEnabled: isReminderEnabled,
    });

    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/70 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div className={`fixed bottom-0 left-0 w-full bg-[#141923] rounded-t-[2rem] z-50 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] flex flex-col max-h-[92vh] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        {/* ── Top handle + nav bar ── */}
        <div className="flex-none">
          <div className="w-10 h-1 bg-[#2a364f] rounded-full mx-auto mt-3 mb-1" />
          <div className="flex items-center justify-between px-5 py-3">
            <button
              onClick={onClose}
              className="text-text-secondary text-[15px] active:opacity-60 transition-opacity w-16"
            >
              Cancel
            </button>
            <h2 className="text-white font-bold text-[16px]">{taskToEdit ? 'Edit Task' : 'New Task'}</h2>
            <button
              onClick={handleSaveClick}
              className="text-primary font-semibold text-[15px] active:opacity-60 transition-opacity w-16 text-right"
            >
              Done
            </button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-2 pb-4">

          {/* Task title */}
          <input
            type="text"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus={isOpen && !taskToEdit}
            className="w-full bg-transparent text-white text-[26px] font-bold placeholder:text-[#384666] focus:outline-none mb-5 leading-tight"
          />

          {/* Add Note / Add Checklist pill buttons */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={() => setShowNotes(v => !v)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-[14px] font-medium transition-all ${
                showNotes
                  ? 'border-primary/70 text-primary bg-primary/10'
                  : 'border-[#2e3d58] text-text-secondary hover:border-primary/50 hover:text-white'
              }`}
            >
              <Plus size={15} />
              Add Note
            </button>
            <button
              onClick={() => setShowChecklist(v => !v)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-[14px] font-medium transition-all ${
                showChecklist
                  ? 'border-primary/70 text-primary bg-primary/10'
                  : 'border-[#2e3d58] text-text-secondary hover:border-primary/50 hover:text-white'
              }`}
            >
              <Plus size={15} />
              Add Checklist
            </button>
          </div>

          {/* Notes inline section */}
          {showNotes && (
            <div className="mb-5 bg-[#1a2336] rounded-2xl px-4 py-3 border border-[#232f48]/50">
              <textarea
                rows={3}
                placeholder="Add a note..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                autoFocus
                className="w-full bg-transparent text-slate-300 placeholder:text-text-secondary/50 focus:outline-none text-[15px] resize-none leading-relaxed"
              />
            </div>
          )}

          {/* Checklist inline section */}
          {showChecklist && (
            <div className="mb-5">
              {checklistItems.length > 0 && (
                <div className="flex flex-col gap-2 mb-2">
                  {checklistItems.map(item => (
                    <div key={item.id} className="flex items-center gap-3 bg-[#1a2336] rounded-2xl px-4 py-3">
                      <div className="flex-shrink-0 w-4 h-4 rounded border border-[#384666] flex items-center justify-center">
                        {item.completed && <Check size={10} strokeWidth={3} className="text-primary" />}
                      </div>
                      <span className="flex-1 text-[14px] text-slate-300">{item.text}</span>
                      <button
                        onClick={() => removeChecklistItem(item.id)}
                        className="text-text-secondary hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
                        aria-label="Remove item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 bg-[#1a2336] rounded-2xl px-4 py-3 border border-[#232f48]/50">
                <Plus size={16} className="text-text-secondary flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Add item..."
                  value={newChecklistText}
                  onChange={(e) => setNewChecklistText(e.target.value)}
                  onKeyDown={handleChecklistKeyDown}
                  className="flex-1 bg-transparent text-[14px] text-white placeholder:text-text-secondary/60 focus:outline-none"
                />
                {newChecklistText.trim() && (
                  <button
                    onClick={addChecklistItem}
                    className="text-primary text-[13px] font-semibold active:opacity-70 transition-opacity flex-shrink-0"
                  >
                    Add
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Schedule card ── */}
          <div className="bg-[#1a2a47] rounded-2xl p-4 mb-5 border border-[#243356]">
            <h3 className="text-white font-bold text-[17px] mb-4">Schedule</h3>

            {/* Start Time */}
            <p className="text-[#6f89b0] text-[11px] font-semibold tracking-widest mb-2">START TIME</p>
            <div>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="bg-[#141e30] text-white text-[26px] font-bold tabular-nums tracking-tight px-3 py-3 rounded-xl outline-none w-36 [&::-webkit-calendar-picker-indicator]:opacity-0 cursor-pointer"
              />
            </div>

            {/* Collapsible Advanced Options */}
            <div className="mt-5 pt-4 border-t border-[#243356]">
              <button
                onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                className="w-full flex items-center justify-between text-left focus:outline-none group"
              >
                <div>
                  <span className="text-white font-medium text-[15px] block">Task details</span>
                  {!isAdvancedExpanded && (
                    <span className="text-[#6f89b0] text-[13px] mt-0.5 block">
                      {selectedDuration} • {RECURRENCE_LABELS[selectedRecurrence]} • {isReminderEnabled ? 'Reminder on' : 'Reminder off'} • {selectedPriority}
                    </span>
                  )}
                </div>
                <div className="w-8 h-8 rounded-full bg-[#243356]/50 flex items-center justify-center group-hover:bg-[#243356] transition-colors">
                  <ChevronDown className={`text-[#6f89b0] transition-transform duration-300 ${isAdvancedExpanded ? 'rotate-180' : ''}`} size={18} />
                </div>
              </button>

              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isAdvancedExpanded ? 'max-h-[600px] opacity-100 mt-5' : 'max-h-0 opacity-0'}`}>
                {/* Duration chips */}
                <div className="mb-5">
                  <p className="text-[#6f89b0] text-[11px] font-semibold tracking-widest mb-2">DURATION</p>
                  <div className="flex gap-2">
                    {['15m', '30m', '1h', '2h'].map((d) => (
                      <button
                        key={d}
                        onClick={() => setSelectedDuration(d)}
                        className={`flex-1 py-2 rounded-full font-semibold text-[14px] border transition-all ${
                          d === selectedDuration
                            ? 'bg-primary border-primary text-white shadow-[0_0_12px_rgba(19,91,236,0.4)]'
                            : 'border-[#2e3d58] text-text-secondary hover:border-primary/40'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Repeat row */}
                <div className="flex items-center justify-between py-3 border-t border-[#243356]">
                  <span className="text-white text-[15px] font-medium">Repeat</span>
                  <div className="relative">
                    <select
                      value={selectedRecurrence}
                      onChange={(e) => setSelectedRecurrence(e.target.value as Recurrence)}
                      className="appearance-none bg-transparent text-text-secondary text-[14px] pr-5 focus:outline-none cursor-pointer"
                    >
                      {(Object.entries(RECURRENCE_LABELS) as [Recurrence, string][]).map(([val, lbl]) => (
                        <option key={val} value={val} className="bg-[#1a2a47] text-white">{lbl}</option>
                      ))}
                    </select>
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none text-[12px]">▾</span>
                  </div>
                </div>

                {/* Remind me row */}
                <div className="flex items-center justify-between py-3 border-t border-[#243356]">
                  <span className="text-white text-[15px] font-medium">Remind me</span>
                  <div className="flex items-center gap-3">
                    <span className="text-text-secondary text-[13px]">{isReminderEnabled ? '10 min before' : 'Off'}</span>
                    <button
                      onClick={() => setIsReminderEnabled(v => !v)}
                      className={`w-[46px] h-[26px] rounded-full relative transition-all duration-300 flex-shrink-0 ${
                        isReminderEnabled ? 'bg-primary shadow-[0_0_10px_rgba(19,91,236,0.4)]' : 'bg-[#2a3650]'
                      }`}
                    >
                      <div className={`absolute top-[2px] w-[22px] h-[22px] bg-white rounded-full shadow transition-all duration-300 ${
                        isReminderEnabled ? 'left-[22px]' : 'left-[2px]'
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Priority section */}
                <div className="pt-4 border-t border-[#243356]">
                  <p className="text-[#6f89b0] text-[11px] font-semibold tracking-widest mb-3">PRIORITY</p>
                  <div className="flex gap-0 bg-[#141e30] rounded-2xl p-1 shadow-inner border border-[#243356]/50">
                    {[
                      { label: 'Low',    activeColor: 'text-emerald-400' },
                      { label: 'Medium', activeColor: 'text-amber-400' },
                      { label: 'High',   activeColor: 'text-red-400' },
                    ].map((p) => (
                      <button
                        key={p.label}
                        onClick={() => setSelectedPriority(p.label)}
                        className={`flex-1 py-2.5 rounded-xl font-semibold text-[14px] transition-all ${
                          p.label === selectedPriority
                            ? `bg-[#2a3650] ${p.activeColor} shadow-sm`
                            : 'text-text-secondary hover:text-white'
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
        <div className="flex-none px-5 pb-8 pt-3 bg-[#141923]">
          <button
            onClick={handleSaveClick}
            className="w-full bg-primary hover:bg-blue-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_6px_20px_rgba(19,91,236,0.45)] active:scale-[0.98] transition-all text-[16px]"
          >
            <CheckCircle2 size={20} strokeWidth={2.5} />
            <span>Save Changes</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default NewTaskModal;
