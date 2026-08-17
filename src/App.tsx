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
  compareByTimeUntimedLast,
} from './utils/taskUtils';
import DateGroupHeader from './components/DateGroupHeader';
import AllTasksFilterBar from './components/AllTasksFilterBar';
import TaskCard from './components/TaskCard';
import HomeHero from './components/HomeHero';
import NewTaskModal from './components/NewTaskModal';
import SettingsModal from './components/SettingsModal';
import { useTasks } from './hooks/useTasks';
import { useReminders } from './hooks/useReminders';
import { useDailyEssentials } from './hooks/useDailyEssentials';
import DailyEssentialsSection from './components/DailyEssentialsSection';
import RemindersView from './components/RemindersView';
import ManageEssentialsModal from './components/ManageEssentialsModal';
import VoiceTaskModal from './components/VoiceTaskModal';
import { useTheme } from './hooks/useTheme';

const TaskSection = ({ title, timeRange, colorClass, shadowClass, children }: { title: string, timeRange?: string, colorClass: string, shadowClass: string, children: React.ReactNode }) => {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-3">
        <div className={`h-7 w-[3px] rounded-full ${colorClass} ${shadowClass}`}></div>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[16px] font-bold text-fg tracking-tight">{title}</h2>
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
  const { theme, setTheme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState<Partial<Task> | null>(null);
  /** ID of the task card currently swiped open — only one allowed at a time */
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isManageEssentialsOpen, setIsManageEssentialsOpen] = useState(false);
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

    let boundHandleUpdateFound: (() => void) | undefined;

    navigator.serviceWorker.getRegistration().then((registration) => {
      if (!registration) return;
      reg = registration;
      boundHandleUpdateFound = () => handleUpdateFound(reg!);
      reg.addEventListener('updatefound', boundHandleUpdateFound);
    });

    return () => {
      if (reg && boundHandleUpdateFound) {
        reg.removeEventListener('updatefound', boundHandleUpdateFound);
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
    setVoiceDraft(null);
    setIsModalOpen(true);
    setShowPlusMenu(false);
  };

  const openVoiceTaskModal = () => {
    setIsVoiceModalOpen(true);
    setShowPlusMenu(false);
  };

  const openEditTaskModal = (task: Task) => {
    setTaskToEdit(task);
    setIsModalOpen(true);
  };

  const { tasks, saveTask, toggleTaskStatus, toggleChecklistItem, deleteTask, moveTaskToTomorrow } = useTasks();

  useReminders(tasks, remindersEnabled);
  
  const { 
    essentials, 
    progressById, 
    addEssential, 
    editEssential, 
    deleteEssential, 
    updateProgress,
    reorderEssentials
  } = useDailyEssentials();

  const [activeTab, setActiveTab] = useState<'today' | 'all' | 'done' | 'reminders'>('today');

  // 'all' | 'today' | 'yesterday' | YYYY-MM-DD
  const [allDateFilter, setAllDateFilter] = useState<string>('all');
  const [allDatePicker, setAllDatePicker] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Persist remindersEnabled preference
  useEffect(() => {
    localStorage.setItem('remindersEnabled', String(remindersEnabled));
  }, [remindersEnabled]);

  const handleSaveTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom'>) => {
    const saved = saveTask(taskData, taskToEdit);
    // If we have a voice draft meant for tomorrow, move it immediately
    if (!taskToEdit && voiceDraft?.date && voiceDraft.date > getTodayString()) {
      moveTaskToTomorrow(saved.id);
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

  // Sort incomplete tasks first, then completed tasks. Existing time-based sort is preserved.
  const sortSectionTasks = (sectionTasks: Task[]) => {
    return [...sectionTasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      // Within the same completion state, untimed tasks come after timed ones.
      return compareByTimeUntimedLast(a, b);
    });
  };

  const morningTasks = sortSectionTasks(todayTasks.filter(t => t.timeBlock === 'morning'));
  const afternoonTasks = sortSectionTasks(todayTasks.filter(t => t.timeBlock === 'afternoon'));
  const eveningTasks = sortSectionTasks(todayTasks.filter(t => t.timeBlock === 'evening'));

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
    <div className="bg-page font-display text-slate-100 h-screen flex flex-col overflow-hidden relative selection:bg-primary selection:text-white">
      {/* SW Update Banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between gap-3 px-4 py-3 bg-surface-raised border-b border-primary/40 shadow-lg">
          <span className="text-sm font-medium text-fg">🚀 Neue Version verfügbar</span>
          <button
            onClick={handleRefresh}
            className="text-sm font-semibold text-primary hover:text-blue-300 transition-colors flex-shrink-0 px-3 py-1 rounded-lg hover:bg-primary/10 active:scale-95"
          >
            Aktualisieren
          </button>
        </div>
      )}

      {/* ── Single scrollable container — header + hero scroll with content ── */}
      <main className="flex-1 overflow-y-auto pb-24 custom-scrollbar">        {/* ── Top app bar — scrolls away naturally ─────────────────────────── */}
        <header className="px-5 pt-5 pb-2 flex items-center justify-between gap-3">
          {/* Left: logo or search */}
          {isSearchActive ? (
            <div className="flex-1 flex items-center bg-surface-raised rounded-full px-4 py-2 border border-edge/50 overflow-hidden">
              <Search size={18} className="text-fg-secondary mr-2 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Suche..."
                className="bg-transparent border-none outline-none text-fg text-[15px] w-full placeholder:text-fg-secondary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                onClick={() => { setIsSearchActive(false); setSearchQuery(''); }}
                className="text-fg-secondary hover:text-fg ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-fg/10"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Waves size={24} strokeWidth={2.5} className="text-primary" />
              <span className="font-bold text-[17px] tracking-tight text-fg">My Daily Flow</span>
            </div>
          )}

          {/* Right: search + settings icons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!isSearchActive && (
              <button
                onClick={() => setIsSearchActive(true)}
                className="text-fg-faint hover:text-fg transition-colors"
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
              className="text-fg-faint hover:text-fg transition-colors"
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
          <>
            <DailyEssentialsSection
              essentials={essentials}
              progressById={progressById}
              onUpdateProgress={updateProgress}
              onManageClick={() => setIsManageEssentialsOpen(true)}
            />
            <div className="flex flex-col gap-8 px-5 pt-2">
            <TaskSection title="Morgen" timeRange="06:00 – 12:00" colorClass="bg-blue-400" shadowClass="shadow-[0_0_10px_rgba(96,165,250,0.5)]">
              {morningTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
            </TaskSection>
            <TaskSection title="Nachmittag" timeRange="12:00 – 18:00" colorClass="bg-orange-400" shadowClass="shadow-[0_0_10px_rgba(251,146,60,0.5)]">
              {afternoonTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
            </TaskSection>
            <TaskSection title="Abend" timeRange="18:00 – 23:00" colorClass="bg-indigo-400" shadowClass="shadow-[0_0_10px_rgba(129,140,248,0.5)]">
              {eveningTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
            </TaskSection>

            {pendingTasks.length === 0 && (
              <div className="text-center py-12 text-text-secondary mt-10">
                <CheckCircle2 size={48} className="mx-auto mb-4 opacity-30" />
              <p className="text-fg-secondary mt-10">Alle Aufgaben für heute erledigt!</p>
              </div>
            )}
            </div>
          </>
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
                      ? 'border-b border-surface-raised'
                      : ''
                      }`}
                  >
                    <DateGroupHeader date={group.date} count={group.tasks.length} />
                    {/* Task cards */}
                    <div className="flex flex-col gap-2.5">
                      {group.tasks.map(t => (
                        <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />
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
                    <p className="text-fg font-semibold">Keine Aufgaben an diesem Datum</p>
                    <p className="text-fg-secondary text-sm">Versuche ein anderes Datum oder lösche den Filter.</p>
                  </>
                ) : (
                  <>
                    <p className="text-fg font-semibold">Noch keine Aufgaben</p>
                    <p className="text-fg-secondary text-sm">Füge deine erste Aufgabe mit dem + Button hinzu.</p>
                  </>
                )}
              </div>
            )}
          </div>
        ) : activeTab === 'reminders' ? (
          <RemindersView
            tasks={filteredTasks}
            remindersEnabled={remindersEnabled}
            permission={notifPermission}
            onEditTask={openEditTaskModal}
            onOpenSettings={() => {
              setNotifPermission('Notification' in window ? Notification.permission : 'denied');
              setIsSettingsOpen(true);
            }}
          />
        ) : (
          <div className="flex flex-col gap-8 px-5">
            {doneTasks.length > 0 ? (
              <TaskSection title="Erledigte Aufgaben" colorClass="bg-emerald-400" shadowClass="shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                {doneTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
              </TaskSection>
            ) : (
              <div className="text-center py-12 text-text-secondary mt-10">
                <List size={48} className="mx-auto mb-4 opacity-30" />
                <p>Noch keine erledigten Aufgaben.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-[5.5rem] right-5 z-20 flex flex-col items-end">
        {showPlusMenu && (
          <div className="mb-3 bg-surface-raised border border-edge-muted rounded-2xl shadow-xl flex flex-col overflow-hidden animate-fade-in origin-bottom-right">
            <button
              onClick={openNewTaskModal}
              className="px-5 py-3.5 text-fg font-semibold text-[15px] hover:bg-fg/5 transition-colors border-b border-edge-muted/50 text-left whitespace-nowrap"
            >
              Manuelle Aufgabe
            </button>
            <button
              onClick={openVoiceTaskModal}
              className="px-5 py-3.5 text-primary font-semibold text-[15px] hover:bg-fg/5 transition-colors text-left flex items-center gap-2 whitespace-nowrap"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Sprachaufgabe
            </button>
          </div>
        )}
        <button
          onClick={() => setShowPlusMenu(v => !v)}
          className={`h-14 w-14 bg-primary text-white rounded-full shadow-[0_4px_20px_rgba(19,91,236,0.55)] flex items-center justify-center active:scale-95 hover:scale-105 transition-transform ${showPlusMenu ? 'rotate-45 bg-surface-control shadow-none border border-edge-strong' : ''}`}
          aria-label={showPlusMenu ? "Close menu" : "Add task menu"}
        >
          <div className="pointer-events-none p-1 rounded-full"><Plus size={28} strokeWidth={2.5} /></div>
        </button>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-surface-inset/95 backdrop-blur-md border-t border-edge px-2 pb-safe pt-2 z-10" style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
        <div className="flex justify-around items-center">

          {/* Today */}
          <button
            onClick={() => setActiveTab('today')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'today' ? 'bg-primary/15' : ''
            }`}>
              <Sun size={22} className={activeTab === 'today' ? 'text-primary' : 'text-fg-faint'} strokeWidth={activeTab === 'today' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'today' ? 'text-primary' : 'text-fg-faint'
            }`}>Heute</span>
          </button>

          {/* All Tasks */}
          <button
            onClick={() => setActiveTab('all')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'all' ? 'bg-primary/15' : ''
            }`}>
              <List size={22} className={activeTab === 'all' ? 'text-primary' : 'text-fg-faint'} strokeWidth={activeTab === 'all' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'all' ? 'text-primary' : 'text-fg-faint'
            }`}>Alle Aufgaben</span>
          </button>

          {/* Reminders */}
          <button
            onClick={() => setActiveTab('reminders')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'reminders' ? 'bg-primary/15' : ''
            }`}>
              <Bell size={22} className={activeTab === 'reminders' ? 'text-primary' : 'text-fg-faint'} strokeWidth={activeTab === 'reminders' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'reminders' ? 'text-primary' : 'text-fg-faint'
            }`}>Erinnerungen</span>
          </button>

          {/* Done */}
          <button
            onClick={() => setActiveTab('done')}
            className="flex flex-col items-center gap-1 flex-1 py-1 transition-colors"
          >
            <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
              activeTab === 'done' ? 'bg-primary/15' : ''
            }`}>
              <CheckCircle2 size={22} className={activeTab === 'done' ? 'text-primary' : 'text-fg-faint'} strokeWidth={activeTab === 'done' ? 2.5 : 2} />
            </div>
            <span className={`text-[11px] font-semibold tracking-tight ${
              activeTab === 'done' ? 'text-primary' : 'text-fg-faint'
            }`}>Erledigt</span>
          </button>

        </div>
      </nav>

      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} taskToEdit={taskToEdit} initialDraft={voiceDraft} />
      <VoiceTaskModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onSuccess={(draft) => {
          setVoiceDraft(draft);
          setTaskToEdit(null);
          setIsModalOpen(true);
        }}
      />
      <ManageEssentialsModal
        isOpen={isManageEssentialsOpen}
        onClose={() => setIsManageEssentialsOpen(false)}
        essentials={essentials}
        onAdd={addEssential}
        onEdit={editEssential}
        onDelete={deleteEssential}
        onReorder={reorderEssentials}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        // Storage has already been written and verified at this point; a full
        // reload is the safest way to rehydrate every hook from it at once.
        onDataImported={() => window.location.reload()}
        remindersEnabled={remindersEnabled}
        onRemindersEnabledChange={setRemindersEnabled}
        permission={notifPermission}
        onPermissionChange={setNotifPermission}
        onLogout={logout}
        stickyHeroEnabled={stickyHeroEnabled}
        onStickyHeroChange={setStickyHeroEnabled}
        theme={theme}
        onThemeChange={setTheme}
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
