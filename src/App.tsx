import { Waves, Search, Bell, Sun, List, CheckCircle2, Settings, Plus } from 'lucide-react';
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import LoginPage from './components/LoginPage';

import type { Task } from './types/task';
import {
  getTodayString,
  getYesterdayString,
  filterTasksBySearch,
  groupTasksByDate,
} from './utils/taskUtils';
import DateGroupHeader from './components/DateGroupHeader';
import AllTasksFilterBar from './components/AllTasksFilterBar';
import TaskCard from './components/TaskCard';
import HomeHero from './components/HomeHero';
import NewTaskModal from './components/NewTaskModal';
import SettingsModal from './components/SettingsModal';
import { useTasks } from './hooks/useTasks';

const TaskSection = ({ title, timeRange, colorClass, shadowClass, children }: { title: string, timeRange?: string, colorClass: string, shadowClass: string, children: React.ReactNode }) => {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`h-7 w-[3px] rounded-full ${colorClass} ${shadowClass}`}></div>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[16px] font-bold text-white tracking-tight">{title}</h2>
          {timeRange && <span className="text-[12px] font-medium text-slate-400">{timeRange}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {children}
      </div>
    </section>
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

  const { tasks, saveTask, toggleTaskStatus, toggleChecklistItem, deleteTask } = useTasks();

  const [activeTab, setActiveTab] = useState<'today' | 'all' | 'done'>('today');

  // 'all' | 'today' | 'yesterday' | YYYY-MM-DD
  const [allDateFilter, setAllDateFilter] = useState<string>('all');
  const [allDatePicker, setAllDatePicker] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Persist remindersEnabled preference
  useEffect(() => {
    localStorage.setItem('remindersEnabled', String(remindersEnabled));
  }, [remindersEnabled]);

  const handleSaveTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom'>, reminderEnabled: boolean) => {
    const savedTask = saveTask(taskData, taskToEdit);

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
        <div className="pointer-events-none p-1 rounded-full"><Plus size={28} strokeWidth={2.5} /></div>
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
