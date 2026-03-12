import { Waves, Search, Bell, Check, Plus, Sun, List, CheckCircle2, Trash2, Settings, LogOut } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import LoginPage from './components/LoginPage';


import type { Task, ChecklistItem, Recurrence } from './types/task';
import { isValidTaskArray, isStorageWrapper } from './types/task';
import type { StorageWrapper } from './types/task';
import {
  getTodayString,
  getYesterdayString,
  getRolloverLabel,
  filterTasksBySearch,
  groupTasksByDate,
  nextRecurrenceDate,
  deriveTimeBlock,
} from './utils/taskUtils';
import DateGroupHeader from './components/DateGroupHeader';
import AllTasksFilterBar from './components/AllTasksFilterBar';
import TaskCard from './components/TaskCard';
import HomeHero from './components/HomeHero';

const ProgressRing = ({ percentage, completed, total }: { percentage: number, completed: number, total: number }) => {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative w-48 h-48 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            className="text-card-dark"
            cx="96"
            cy="96"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
          />
          <circle
            className="text-primary shadow-[0_0_15px_rgba(19,91,236,0.5)] transition-all duration-1000 ease-out"
            cx="96"
            cy="96"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth="12"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-4xl font-bold text-white">{percentage}%</span>
          <span className="text-sm text-text-secondary font-medium mt-1">
            {completed}/{total} tasks
          </span>
        </div>
      </div>
    </div>
  );
};

const TaskSection = ({ title, timeRange, colorClass, shadowClass, children }: { title: string, timeRange?: string, colorClass: string, shadowClass: string, children: React.ReactNode }) => {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`h-7 w-[3px] rounded-full ${colorClass} ${shadowClass}`}></div>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[16px] font-bold text-white tracking-tight">{title}</h2>
          {timeRange && <span className="text-[11px] font-medium text-[#5a7299]">{timeRange}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {children}
      </div>
    </section>
  );
};



// ─── Recurrence label helper for the dropdown ─────────────────────────────
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
  taskToEdit
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom'>, reminderEnabled: boolean) => void;
  taskToEdit?: Task | null;
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

  useEffect(() => {
    if (isOpen) {
      if (taskToEdit) {
        setTitle(taskToEdit.title);
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
        setIsReminderEnabled(false);
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
  }, [isOpen, taskToEdit]);

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
    }, isReminderEnabled);

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
            <div className="mb-4">
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="bg-[#141e30] text-white text-[28px] font-bold tracking-wider px-4 py-3 rounded-xl outline-none w-36 [&::-webkit-calendar-picker-indicator]:opacity-0 cursor-pointer"
              />
            </div>

            {/* Duration chips */}
            <p className="text-[#6f89b0] text-[11px] font-semibold tracking-widest mb-2">DURATION</p>
            <div className="flex gap-2 mb-5">
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
          </div>

          {/* Priority section */}
          <div className="mb-6">
            <p className="text-[#6f89b0] text-[11px] font-semibold tracking-widest mb-3">PRIORITY</p>
            <div className="flex gap-0 bg-[#1a2336] rounded-2xl p-1">
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
                      ? `bg-[#2a3650] ${p.activeColor}`
                      : 'text-text-secondary hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
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

// ─── Settings Modal ──────────────────────────────────────────────────────────

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  remindersEnabled: boolean;
  onRemindersEnabledChange: (val: boolean) => void;
  permission: NotificationPermission;
  onPermissionChange: (p: NotificationPermission) => void;
  onLogout: () => void;
  stickyHeroEnabled: boolean;
  onStickyHeroChange: (val: boolean) => void;
}

const SettingsModal = ({
  isOpen,
  onClose,
  remindersEnabled,
  onRemindersEnabledChange,
  permission,
  onPermissionChange,
  onLogout,
  stickyHeroEnabled,
  onStickyHeroChange,
}: SettingsModalProps) => {
  const [requesting, setRequesting] = React.useState(false);

  const handleEnableClick = async () => {
    if (!('Notification' in window)) return;
    setRequesting(true);
    const result = await Notification.requestPermission();
    onPermissionChange(result);
    if (result === 'granted') {
      onRemindersEnabledChange(true);
    }
    setRequesting(false);
  };

  const permissionLabel: Record<NotificationPermission, string> = {
    granted: 'Granted',
    denied: 'Denied',
    default: 'Not set',
  };

  const permissionColor: Record<NotificationPermission, string> = {
    granted: 'text-emerald-400',
    denied: 'text-red-400',
    default: 'text-amber-400',
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div className={`fixed bottom-0 left-0 w-full bg-[#151c2c] rounded-t-[2.5rem] z-50 p-6 pb-10 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="w-12 h-1.5 bg-[#2a364f] rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-center mb-8 relative">
          <button onClick={onClose} className="text-text-secondary active:opacity-70 transition-opacity absolute left-0 text-[15px]">Close</button>
          <h2 className="text-white font-bold text-lg w-full text-center">Settings</h2>
        </div>

        {/* ── Home section ─────────────────────────────────────────────── */}
        <div className="mb-6">
          <h3 className="text-text-secondary text-xs font-semibold tracking-wider mb-3">HOME</h3>
          <button
            onClick={() => onStickyHeroChange(!stickyHeroEnabled)}
            className="w-full bg-[#1e273b] p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-[#232f48]/50 active:scale-[0.98] transition-transform"
          >
            <div>
              <span className="text-white font-semibold text-[16px]">Sticky header</span>
              <p className="text-text-secondary text-[12px] mt-0.5">Keeps progress visible while scrolling</p>
            </div>
            <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 flex-shrink-0 ml-3 ${
              stickyHeroEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-[#232f48]'
            }`}>
              <div className={`absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform duration-300 ${
                stickyHeroEnabled ? 'right-1' : 'left-1'
              }`} />
            </div>
          </button>
        </div>

        {/* Notification Permission Status */}
        <div className="mb-6">
          <h3 className="text-text-secondary text-xs font-semibold tracking-wider mb-3">NOTIFICATION PERMISSION</h3>
          <div className="bg-[#1e273b] rounded-[1.5rem] p-4 px-5 border border-[#232f48]/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-orange-500 opacity-90 drop-shadow-[0_0_4px_rgba(249,115,22,0.4)]">
                <Bell size={22} strokeWidth={2.5} className="fill-current" />
              </div>
              <span className="text-white font-semibold text-[16px]">Browser notifications</span>
            </div>
            <span className={`text-sm font-semibold ${permissionColor[permission]}`}>
              {permissionLabel[permission]}
            </span>
          </div>
        </div>

        {/* Denied warning */}
        {permission === 'denied' && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
            <p className="text-amber-400 text-sm font-semibold mb-1">Notifications are blocked</p>
            <p className="text-text-secondary text-sm">To enable reminders, open your browser's site settings and allow notifications for this page, then refresh.</p>
          </div>
        )}

        {/* Granted: show success + toggle */}
        {permission === 'granted' && (
          <div className="mb-6">
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 mb-4">
              <p className="text-emerald-400 text-sm font-semibold">Reminders enabled ✓</p>
              <p className="text-text-secondary text-sm mt-1">Browser notifications are allowed for this site.</p>
            </div>
            {/* Reminders on/off toggle */}
            <button
              onClick={() => onRemindersEnabledChange(!remindersEnabled)}
              className="w-full bg-[#1e273b] p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-[#232f48]/50 active:scale-[0.98] transition-transform"
            >
              <span className="text-white font-semibold text-[16px]">Schedule reminders</span>
              <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 ${remindersEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-[#232f48]'}`}>
                <div className={`absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform duration-300 ${remindersEnabled ? 'right-1 translate-x-0' : 'left-1 translate-x-0'}`} />
              </div>
            </button>
          </div>
        )}

        {/* Enable button (shown for default or denied) */}
        {permission !== 'granted' && (
          <button
            onClick={handleEnableClick}
            disabled={requesting || permission === 'denied'}
            className="w-full bg-primary hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(19,91,236,0.4)] active:scale-[0.98] transition-all text-[17px]"
          >
            <Bell size={22} strokeWidth={2.5} />
            {requesting ? 'Requesting…' : 'Enable Reminders'}
          </button>
        )}

        {/* ── Logout ── */}
        <div className="mt-8 pt-6 border-t border-[#1e273b]">
          <button
            onClick={() => { onClose(); onLogout(); }}
            className="w-full bg-[#1e273b] hover:bg-red-500/10 border border-[#232f48]/50 hover:border-red-500/30 text-text-secondary hover:text-red-400 font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-[16px]"
          >
            <LogOut size={20} strokeWidth={2.5} />
            Log out
          </button>
          <p className="text-center text-[11px] text-[#384666] mt-3">Demo environment · Not secure</p>
        </div>
      </div>
    </>
  );
};

function AppInner({ logout }: { logout: () => void }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  /** ID of the task card currently swiped open — only one allowed at a time */
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  /** Sticky hero header preference — default on */
  const [stickyHeroEnabled, setStickyHeroEnabled] = useState<boolean>(
    () => localStorage.getItem('stickyHeroEnabled') !== 'false'
  );

  // ─── Service Worker update banner ──────────────────────────────────────────
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let newWorker: ServiceWorker | null = null;

    const handleStateChange = () => {
      if (newWorker && newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        waitingWorkerRef.current = newWorker;
        setUpdateAvailable(true);
      }
    };

    const handleUpdateFound = (reg: ServiceWorkerRegistration) => {
      newWorker = reg.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', handleStateChange);
      }
    };

    let reg: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      reg = registration;
      reg.addEventListener('updatefound', () => handleUpdateFound(reg!));
    });

    return () => {
      if (reg) {
        reg.removeEventListener('updatefound', () => handleUpdateFound(reg!));
      }
      if (newWorker) {
        newWorker.removeEventListener('statechange', handleStateChange);
      }
    };
  }, []);

  const handleRefresh = () => {
    const waiting = waitingWorkerRef.current;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
  };

  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() =>
    localStorage.getItem('remindersEnabled') === 'true'
  );

  // Persist sticky hero preference
  useEffect(() => {
    localStorage.setItem('stickyHeroEnabled', String(stickyHeroEnabled));
  }, [stickyHeroEnabled]);



  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  const openNewTaskModal = () => {
    setTaskToEdit(null);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setTaskToEdit(task);
    setIsModalOpen(true);
  };

  const [tasks, setTasks] = useState<Task[]>(() => {
    const today = getTodayString();
    // Helper: ensure every task has a `date` field (migration for old data).
    const withDate = (rawTasks: Task[]): Task[] =>
      rawTasks.map(t => t.date ? t : { ...t, date: today });

    const saved = localStorage.getItem('myDailyFlowTasks');
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);

        // Handle new versioned format
        if (isStorageWrapper(parsed)) {
          return withDate(parsed.data);
        }

        // Auto-migrate legacy array format
        if (isValidTaskArray(parsed)) {
          console.log('Migrating legacy tasks array to versioned storage');
          return withDate(parsed);
        }

        console.warn('Invalid task data format in localStorage, clearing corrupted data');
        localStorage.removeItem('myDailyFlowTasks');
        return [];
      } catch (e) {
        console.error('Failed to parse saved tasks, clearing corrupted data', e);
        localStorage.removeItem('myDailyFlowTasks');
        return [];
      }
    }

    // Initial dummy state for local development demonstration
    if ((import.meta as any).env?.DEV) {
      return [
        { id: '1', title: 'Drink water', time: '07:00', duration: '5m', completed: true, timeBlock: 'morning', priority: 'medium', createdAt: new Date().toISOString(), date: today },
        { id: '2', title: 'Going to work', time: '07:30', duration: '45m', completed: true, timeBlock: 'morning', priority: 'high', createdAt: new Date().toISOString(), date: today },
        { id: '3', title: 'Eat lunch', time: '12:30', duration: '45m', completed: false, timeBlock: 'afternoon', priority: 'low', createdAt: new Date().toISOString(), date: today },
        { id: '4', title: 'Gym', time: '17:00', duration: '1h', completed: false, timeBlock: 'afternoon', priority: 'high', createdAt: new Date().toISOString(), date: today },
        { id: '5', title: 'Grocery shopping', time: '18:30', duration: '30m', completed: false, timeBlock: 'afternoon', priority: 'medium', createdAt: new Date().toISOString(), date: today },
        { id: '6', title: 'Call mom', time: '20:00', duration: '15m', completed: false, timeBlock: 'evening', priority: 'high', createdAt: new Date().toISOString(), date: today },
        { id: '7', title: 'Read book', time: '21:00', duration: '30m', completed: false, timeBlock: 'evening', priority: 'low', createdAt: new Date().toISOString(), date: today },
      ];
    }

    return [];
  });

  const [activeTab, setActiveTab] = useState<'today' | 'all' | 'done'>('today');

  // ─── All Tasks date filter ─────────────────────────────────────────────────
  // 'all' | 'today' | 'yesterday' | YYYY-MM-DD
  const [allDateFilter, setAllDateFilter] = useState<string>('all');
  const [allDatePicker, setAllDatePicker] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');





  // Sync to local storage on change
  useEffect(() => {
    try {
      if (isValidTaskArray(tasks)) {
        const wrapper: StorageWrapper = { version: 1, data: tasks };
        localStorage.setItem('myDailyFlowTasks', JSON.stringify(wrapper));
      } else {
        console.error('Invalid tasks state detected, skipping save to protect localStorage');
      }
    } catch (e) {
      console.error('Failed to stringify tasks for saving', e);
    }
  }, [tasks]);

  // Persist remindersEnabled preference
  useEffect(() => {
    localStorage.setItem('remindersEnabled', String(remindersEnabled));
  }, [remindersEnabled]);

  // ─── Rollover: once per day, move unfinished past tasks to today ──────────
  useEffect(() => {
    const today = getTodayString();
    if (localStorage.getItem('lastRolloverDate') === today) return;

    setTasks(prev => prev.map(t => {
      if (!t.completed && t.date < today) {
        return { ...t, date: today, rolledOverFrom: t.rolledOverFrom ?? t.date };
      }
      return t;
    }));

    localStorage.setItem('lastRolloverDate', today);
  }, []); // run once on mount

  const handleSaveTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom'>, reminderEnabled: boolean) => {
    let savedTask: Task;

    if (taskToEdit) {
      savedTask = { ...taskToEdit, ...taskData };
      setTasks(prev => prev.map(t => t.id === taskToEdit.id ? savedTask : t));
    } else {
      savedTask = {
        ...taskData,
        id: Math.random().toString(36).substr(2, 9),
        completed: false,
        createdAt: new Date().toISOString(),
        date: getTodayString(),
      };
      setTasks(prev => [...prev, savedTask]);
    }

    // Only schedule reminder if user has explicitly enabled reminders AND browser permission is granted
    if (reminderEnabled && remindersEnabled && 'Notification' in window && Notification.permission === 'granted') {
      const [hours, minutes] = savedTask.time.split(':').map(Number);
      const now = new Date();
      const taskDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);

      // 10 minutes before
      const reminderTime = new Date(taskDate.getTime() - 10 * 60000);
      let timeToWait = reminderTime.getTime() - now.getTime();

      if (timeToWait < 0) {
        // For testing, schedule immediately if time is already past
        timeToWait = 2000;
      }

      setTimeout(() => {
        new Notification(`🔔 Reminder: ${savedTask.title}`, {
          body: `Your task is scheduled for ${savedTask.time}`
        });
      }, timeToWait);
    }
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;

      const nowCompleted = !target.completed;
      const updated = prev.map(t => t.id === id ? { ...t, completed: nowCompleted } : t);

      // ── Completion-triggered recurrence generation ──────────────────────────
      if (
        nowCompleted &&
        target.recurrence &&
        target.recurrence !== 'none'
      ) {
        // Dedup: if any task already has recurrenceSourceId === target.id, skip
        const alreadySpawned = updated.some(t => t.recurrenceSourceId === target.id);
        if (!alreadySpawned) {
          const nextDate = nextRecurrenceDate(target.date, target.recurrence);
          const nextTask: Task = {
            id: Math.random().toString(36).substr(2, 9),
            createdAt: new Date().toISOString(),
            completed: false,
            date: nextDate,
            title: target.title,
            description: target.description,
            notes: target.notes,
            time: target.time,
            duration: target.duration,
            timeBlock: target.timeBlock,
            priority: target.priority,
            recurrence: target.recurrence,
            recurrenceSourceId: target.id,
            // Reset checklist items — keep text, clear completion
            checklistItems: target.checklistItems
              ? target.checklistItems.map(ci => ({ ...ci, completed: false }))
              : undefined,
          };
          return [...updated, nextTask];
        }
      }

      return updated;
    });
  };

  const toggleChecklistItem = (taskId: string, itemId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId || !t.checklistItems) return t;
      return {
        ...t,
        checklistItems: t.checklistItems.map(ci =>
          ci.id === itemId ? { ...ci, completed: !ci.completed } : ci
        ),
      };
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // Derived state
  const today = getTodayString();
  const filteredTasks = filterTasksBySearch(tasks, searchQuery);

  // Today tab: only tasks dated today
  const todayTasks = filteredTasks.filter(t => t.date === today);
  const totalTasksCount = todayTasks.length;
  const completedTasksCount = todayTasks.filter(t => t.completed).length;
  const progressPercentage = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const pendingTasks = todayTasks.filter(t => !t.completed);
  // Done tab: all completed tasks, regardless of date
  const doneTasks = filteredTasks.filter(t => t.completed).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const morningTasks = pendingTasks.filter(t => t.timeBlock === 'morning');
  const afternoonTasks = pendingTasks.filter(t => t.timeBlock === 'afternoon');
  const eveningTasks = pendingTasks.filter(t => t.timeBlock === 'evening');

  // ─── All Tasks tab: resolve the effective date string for filtering ─────────
  const resolvedDateFilter: string | null = (() => {
    if (allDateFilter === 'all') return null;
    if (allDateFilter === 'today') return today;
    if (allDateFilter === 'yesterday') return getYesterdayString();
    return allDateFilter; // specific YYYY-MM-DD
  })();

  // Apply search + date filter, then group by date
  const allFilteredTasks = filteredTasks.filter(t =>
    resolvedDateFilter === null || t.date === resolvedDateFilter
  );
  const allTaskGroups = groupTasksByDate(allFilteredTasks, today);

  return (
    <div className="bg-background-dark font-display text-slate-100 h-screen flex flex-col overflow-hidden relative selection:bg-primary selection:text-white">
      {/* SW Update Banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between gap-3 px-4 py-3 bg-[#1e273b] border-b border-primary/40 shadow-lg">
          <span className="text-sm font-medium text-white">🚀 New version available</span>
          <button
            onClick={handleRefresh}
            className="text-sm font-semibold text-primary hover:text-blue-300 transition-colors flex-shrink-0 px-3 py-1 rounded-lg hover:bg-primary/10 active:scale-95"
          >
            Refresh
          </button>
        </div>
      )}

      {/* ── Single scrollable container — header + hero scroll with content ── */}
      <main className="flex-1 overflow-y-auto pb-24 custom-scrollbar">        {/* ── Top app bar — scrolls away naturally ─────────────────────────── */}
        <header className="px-5 pt-5 pb-2 flex items-center justify-between gap-3">
          {/* Left: logo or search */}
          {isSearchActive ? (
            <div className="flex-1 flex items-center bg-[#1e273b] rounded-full px-4 py-2 border border-[#232f48]/50 overflow-hidden">
              <Search size={18} className="text-text-secondary mr-2 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search tasks..."
                className="bg-transparent border-none outline-none text-white text-[15px] w-full placeholder:text-text-secondary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                onClick={() => { setIsSearchActive(false); setSearchQuery(''); }}
                className="text-text-secondary hover:text-white ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Waves size={24} strokeWidth={2.5} className="text-primary" />
              <span className="font-bold text-[17px] tracking-tight text-white">My Daily Flow</span>
            </div>
          )}

          {/* Right: search + settings icons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!isSearchActive && (
              <button
                onClick={() => setIsSearchActive(true)}
                className="text-[#4e6285] hover:text-white transition-colors"
                aria-label="Search"
              >
                <Search size={22} />
              </button>
            )}
            <button
              onClick={() => {
                setNotifPermission('Notification' in window ? Notification.permission : 'denied');
                setIsSettingsOpen(true);
              }}
              className="text-[#4e6285] hover:text-white transition-colors"
              aria-label="Settings"
            >
              <Settings size={22} />
            </button>
          </div>
        </header>

        {/* Hero — only on Today tab; sticks to top once header scrolls off */}
        {activeTab === 'today' && (
          <HomeHero
            completed={completedTasksCount}
            total={totalTasksCount}
            percentage={progressPercentage}
            stickyEnabled={stickyHeroEnabled}
          />
        )}


        {activeTab === 'today' ? (
          <div className="flex flex-col gap-8 px-5 pt-5">
            <TaskSection title="Morning" timeRange="06:00 – 12:00" colorClass="bg-blue-400" shadowClass="shadow-[0_0_10px_rgba(96,165,250,0.5)]">
              {morningTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} />)}
            </TaskSection>
            <TaskSection title="Afternoon" timeRange="12:00 – 18:00" colorClass="bg-orange-400" shadowClass="shadow-[0_0_10px_rgba(251,146,60,0.5)]">
              {afternoonTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} />)}
            </TaskSection>
            <TaskSection title="Evening" timeRange="18:00 – 23:00" colorClass="bg-indigo-400" shadowClass="shadow-[0_0_10px_rgba(129,140,248,0.5)]">
              {eveningTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} />)}
            </TaskSection>

            {pendingTasks.length === 0 && (
              <div className="text-center py-12 text-text-secondary mt-10">
                <CheckCircle2 size={48} className="mx-auto mb-4 opacity-30" />
                <p>All tasks completed for today!</p>
              </div>
            )}
            </div>
        ) : activeTab === 'all' ? (
          <div className="flex flex-col gap-2 px-5">
            <AllTasksFilterBar
              allDateFilter={allDateFilter}
              setAllDateFilter={setAllDateFilter}
              allDatePicker={allDatePicker}
              setAllDatePicker={setAllDatePicker}
            />

            {/* Task groups */}
            {allTaskGroups.length > 0 ? (
              <div className="flex flex-col mt-2">
                {allTaskGroups.map((group, idx) => (
                  <div
                    key={group.date}
                    className={`flex flex-col gap-3 py-5 ${idx < allTaskGroups.length - 1
                      ? 'border-b border-[#1e273b]'
                      : ''
                      }`}
                  >
                    <DateGroupHeader date={group.date} count={group.tasks.length} />
                    {/* Task cards */}
                    <div className="flex flex-col gap-2.5">
                      {group.tasks.map(t => (
                        <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-16 mt-6 gap-3">
                <List size={44} className="text-text-secondary opacity-40" />
                {allDateFilter !== 'all' ? (
                  <>
                    <p className="text-white font-semibold">No tasks on this date</p>
                    <p className="text-text-secondary text-sm">Try a different date or clear the filter.</p>
                  </>
                ) : (
                  <>
                    <p className="text-white font-semibold">No tasks yet</p>
                    <p className="text-text-secondary text-sm">Add your first task using the + button.</p>
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8 px-5">
            {doneTasks.length > 0 ? (
              <TaskSection title="Completed Tasks" colorClass="bg-emerald-400" shadowClass="shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                {doneTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} />)}
              </TaskSection>
            ) : (
              <div className="text-center py-12 text-text-secondary mt-10">
                <List size={48} className="mx-auto mb-4 opacity-30" />
                <p>No completed tasks yet.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <button
        onClick={openNewTaskModal}
        className="fixed bottom-[5.5rem] right-5 h-14 w-14 bg-primary text-white rounded-full shadow-[0_4px_20px_rgba(19,91,236,0.55)] flex items-center justify-center active:scale-95 hover:scale-105 transition-transform z-20"
        aria-label="Add new task"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-[#0d1520]/95 backdrop-blur-md border-t border-[#1a2438] px-2 pb-safe pt-2 z-10" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-around items-center">

          {/* Today */}
          <button
            onClick={() => setActiveTab('today')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'today' ? 'bg-primary/15' : ''
            }`}>
              <Sun size={22} className={activeTab === 'today' ? 'text-primary' : 'text-[#4e6285]'} strokeWidth={activeTab === 'today' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'today' ? 'text-primary' : 'text-[#4e6285]'
            }`}>Today</span>
          </button>

          {/* All Tasks */}
          <button
            onClick={() => setActiveTab('all')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'all' ? 'bg-primary/15' : ''
            }`}>
              <List size={22} className={activeTab === 'all' ? 'text-primary' : 'text-[#4e6285]'} strokeWidth={activeTab === 'all' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'all' ? 'text-primary' : 'text-[#4e6285]'
            }`}>All Tasks</span>
          </button>

          {/* Reminders (non-functional tab, keep stable) */}
          <button className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors">
            <div className="flex items-center justify-center w-11 h-7">
              <Bell size={22} className="text-[#4e6285]" strokeWidth={2} />
            </div>
            <span className="text-[11px] font-semibold tracking-tight text-[#4e6285]">Reminders</span>
          </button>

          {/* Done */}
          <button
            onClick={() => setActiveTab('done')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'done' ? 'bg-primary/15' : ''
            }`}>
              <CheckCircle2 size={22} className={activeTab === 'done' ? 'text-primary' : 'text-[#4e6285]'} strokeWidth={activeTab === 'done' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'done' ? 'text-primary' : 'text-[#4e6285]'
            }`}>Done</span>
          </button>

        </div>
      </nav>

      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} taskToEdit={taskToEdit} />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        remindersEnabled={remindersEnabled}
        onRemindersEnabledChange={setRemindersEnabled}
        permission={notifPermission}
        onPermissionChange={setNotifPermission}
        onLogout={logout}
        stickyHeroEnabled={stickyHeroEnabled}
        onStickyHeroChange={setStickyHeroEnabled}
      />
    </div>
  );
}

// ─── Auth gate ────────────────────────────────────────────────────────────────
// Thin wrapper that handles login state before rendering the full app.
// ⚠️  Demo-only. Not secure.
export default function App() {
  const { user, login, logout } = useAuth();
  if (!user) {
    return <LoginPage onLogin={login} />;
  }
  return <AppInner logout={logout} />;
}
