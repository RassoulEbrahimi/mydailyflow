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

const TaskSection = ({ title, timeRange, accentClass, children }: { title: string, timeRange?: string, accentClass: string, children: React.ReactNode }) => {
  return (
    <section aria-label={timeRange ? `${title} (${timeRange})` : title}>
      <div className="flex items-center gap-2.5 mb-3">
        {/* `bg-current` + `.accent-glow` so the bar and its glow both follow the
            token, instead of a palette literal plus a hardcoded rgba() glow. */}
        <div className={`h-7 w-[3px] rounded-full bg-current accent-glow ${accentClass}`} aria-hidden="true"></div>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-[16px] font-bold text-fg tracking-tight">{title}</h2>
          {timeRange && <span className="text-[12px] font-medium text-fg-secondary">{timeRange}</span>}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {children}
      </div>
    </section>
  );
};

type TabId = 'today' | 'all' | 'done' | 'reminders';

/** Bottom-navigation destinations, in visual order. */
const NAV_ITEMS: { id: TabId; label: string; Icon: typeof Sun }[] = [
  { id: 'today',     label: 'Heute',         Icon: Sun },
  { id: 'all',       label: 'Alle Aufgaben', Icon: List },
  { id: 'reminders', label: 'Erinnerungen',  Icon: Bell },
  { id: 'done',      label: 'Erledigt',      Icon: CheckCircle2 },
];

/**
 * The layout contract for everything pinned at the top of the scroll container.
 *
 * Two values are published on the scroller:
 *
 *   `--mdf-pinned-top`    height of the pinned hero, or 0px when it is not pinned
 *   `--mdf-sticky-group`  height of a sticky group header, or 0px when there is none
 *
 * `scroll-padding-top` is the **sum**, because on the All Tasks tab both can be
 * stacked: a date header pins directly below the hero, and a scroll that only
 * cleared the hero would still park a task title behind the date header. The
 * date header itself offsets by `--mdf-pinned-top` alone, since that is what
 * sits above it.
 *
 * Why measured rather than constants: the hero's height depends on the German
 * greeting ("Guten Morgen" wraps differently from "Guten Tag"), the viewport
 * width, the font that actually loaded, and whether the user pinned it at all;
 * the group header's depends on the date label. Every one of those changes the
 * offset, so hard-coded numbers are wrong most of the time. The shell owns both
 * values; no component repeats them.
 */
function usePinnedTopContract(
  scrollerRef: React.RefObject<HTMLElement | null>,
  pinnedRef: React.RefObject<HTMLElement | null>,
  isPinned: boolean,
  /** Re-measure when the view changes what it renders. */
  viewKey: string,
) {
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    /**
     * Rounded **up** from the fractional border-box height.
     *
     * `offsetHeight` is an integer, so it rounds a 40.4px header down to 40 and
     * the reservation ends up a fraction short — measured as a title landing at
     * y = 39.6 under a header whose bottom edge was at y = 40. Reserving a
     * fraction too much is invisible; reserving too little parks content behind
     * the pinned surface, which is the whole defect.
     */
    const reservedHeight = (el: HTMLElement) => Math.ceil(el.getBoundingClientRect().height);

    const publish = () => {
      const hero = isPinned && pinnedRef.current ? reservedHeight(pinnedRef.current) : 0;
      const group = scroller.querySelector<HTMLElement>('[data-sticky-group]');
      scroller.style.setProperty('--mdf-pinned-top', `${hero}px`);
      scroller.style.setProperty('--mdf-sticky-group', `${group ? reservedHeight(group) : 0}px`);
    };

    publish();

    const observer = new ResizeObserver(publish);
    if (isPinned && pinnedRef.current) observer.observe(pinnedRef.current);
    const group = scroller.querySelector<HTMLElement>('[data-sticky-group]');
    if (group) observer.observe(group);

    return () => observer.disconnect();
  }, [scrollerRef, pinnedRef, isPinned, viewKey]);
}

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

  /** The single scroll container, and the surface pinned at its top. */
  const scrollerRef = useRef<HTMLElement>(null);
  const pinnedRef = useRef<HTMLDivElement>(null);

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

  const [activeTab, setActiveTab] = useState<TabId>('today');

  // 'all' | 'today' | 'yesterday' | YYYY-MM-DD
  const [allDateFilter, setAllDateFilter] = useState<string>('all');
  const [allDatePicker, setAllDatePicker] = useState<string>('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Persist remindersEnabled preference
  useEffect(() => {
    localStorage.setItem('remindersEnabled', String(remindersEnabled));
  }, [remindersEnabled]);

  // Only the Today tab renders the hero, so only Today has a pinned hero. The
  // All tab is what contributes a sticky group header, so the contract is
  // re-measured whenever the visible view changes.
  usePinnedTopContract(
    scrollerRef,
    pinnedRef,
    stickyHeroEnabled && activeTab === 'today',
    `${activeTab}|${allDateFilter}|${searchQuery}`,
  );

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
    <div className="bg-page font-display text-fg h-screen flex flex-col overflow-hidden relative selection:bg-primary selection:text-white">
      {/* SW Update Banner */}
      {updateAvailable && (
        <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between gap-3 px-4 py-3 bg-surface-raised border-b border-primary/40 shadow-lg">
          <span className="text-sm font-medium text-fg">🚀 Neue Version verfügbar</span>
          <button
            onClick={handleRefresh}
            className="text-sm font-semibold text-primary-text hover:opacity-80 transition-opacity flex-shrink-0 px-3 py-2 min-h-11 rounded-lg hover:bg-primary-surface active:scale-95"
          >
            Aktualisieren
          </button>
        </div>
      )}

      {/* ── Single scrollable container — header + hero scroll with content ── */}
      {/* The single scroll container. `scroll-padding-top` keeps any programmatic
          scroll — focus, scrollIntoView, anchor — clear of the pinned hero and
          of the sticky date headers, which read the same custom property. */}
      <main
        ref={scrollerRef}
        className="flex-1 overflow-y-auto pb-24 custom-scrollbar scroll-pt-[calc(var(--mdf-pinned-top,0px)+var(--mdf-sticky-group,0px))]"
      >        {/* ── Top app bar — scrolls away naturally ─────────────────────────── */}
        <header
          className="px-5 pb-2 flex items-center justify-between gap-3"
          style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
        >
          {/* Left: logo or search */}
          {isSearchActive ? (
            <div className="flex-1 flex items-center bg-surface-raised rounded-full px-4 py-2 border border-edge/50 overflow-hidden">
              <Search size={18} className="text-fg-secondary mr-2 flex-shrink-0" aria-hidden="true" />
              <input
                autoFocus
                id="task-search"
                type="text"
                placeholder="Suche..."
                aria-label="Aufgaben durchsuchen"
                className="bg-transparent border-none text-fg text-[15px] w-full placeholder:text-fg-placeholder"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button
                type="button"
                onClick={() => { setIsSearchActive(false); setSearchQuery(''); }}
                className="text-fg-secondary hover:text-fg ml-1 flex-shrink-0 min-w-11 min-h-11 flex items-center justify-center rounded-full hover:bg-fg/10"
                aria-label="Suche schließen"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Waves size={24} strokeWidth={2.5} className="text-primary-text" aria-hidden="true" />
              <span className="font-bold text-[17px] tracking-tight text-fg">My Daily Flow</span>
            </div>
          )}

          {/* Right: search + settings icons */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {!isSearchActive && (
              <button
                type="button"
                onClick={() => setIsSearchActive(true)}
                className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-fg-faint hover:text-fg transition-colors"
                aria-label="Aufgaben durchsuchen"
              >
                <Search size={22} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setNotifPermission('Notification' in window ? Notification.permission : 'denied');
                setIsSettingsOpen(true);
              }}
              className="min-w-11 min-h-11 flex items-center justify-center rounded-full text-fg-faint hover:text-fg transition-colors"
              aria-label="Einstellungen"
            >
              <Settings size={22} aria-hidden="true" />
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
            panelRef={pinnedRef}
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
            <TaskSection title="Morgen" timeRange="06:00 – 12:00" accentClass="text-block-morning">
              {morningTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
            </TaskSection>
            <TaskSection title="Nachmittag" timeRange="12:00 – 18:00" accentClass="text-block-afternoon">
              {afternoonTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
            </TaskSection>
            <TaskSection title="Abend" timeRange="18:00 – 23:00" accentClass="text-block-evening">
              {eveningTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
            </TaskSection>

            {pendingTasks.length === 0 && (
              <div className="text-center py-12 text-fg-secondary mt-10">
                <CheckCircle2 size={48} className="mx-auto mb-4 text-fg-faint" aria-hidden="true" />
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
                <List size={44} className="text-fg-faint" aria-hidden="true" />
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
              <TaskSection title="Erledigte Aufgaben" accentClass="text-block-done">
                {doneTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} onToggleChecklistItem={toggleChecklistItem} openSwipeId={openSwipeId} setOpenSwipeId={setOpenSwipeId} onMoveTomorrow={moveTaskToTomorrow} />)}
              </TaskSection>
            ) : (
              <div className="text-center py-12 text-fg-secondary mt-10">
                <List size={48} className="mx-auto mb-4 text-fg-faint" aria-hidden="true" />
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
              type="button"
              onClick={openNewTaskModal}
              className="px-5 py-3.5 min-h-11 text-fg font-semibold text-[15px] hover:bg-fg/5 transition-colors border-b border-edge-muted/50 text-left whitespace-nowrap"
            >
              Manuelle Aufgabe
            </button>
            <button
              type="button"
              onClick={openVoiceTaskModal}
              className="px-5 py-3.5 min-h-11 text-primary-text font-semibold text-[15px] hover:bg-fg/5 transition-colors text-left flex items-center gap-2 whitespace-nowrap"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
              Sprachaufgabe
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowPlusMenu(v => !v)}
          className={`h-14 w-14 bg-primary text-white rounded-full shadow-[0_4px_20px_rgba(19,91,236,0.55)] flex items-center justify-center active:scale-95 hover:scale-105 transition-transform ${showPlusMenu ? 'rotate-45 bg-surface-control shadow-none border border-edge-strong' : ''}`}
          aria-expanded={showPlusMenu}
          aria-label={showPlusMenu ? 'Menü schließen' : 'Aufgabe hinzufügen'}
        >
          <div className="pointer-events-none p-1 rounded-full" aria-hidden="true"><Plus size={28} strokeWidth={2.5} /></div>
        </button>
      </div>

      {/* Bottom Navigation */}
      <nav
        aria-label="Hauptnavigation"
        className="fixed bottom-0 left-0 w-full bg-surface-inset/95 backdrop-blur-md border-t border-edge px-2 pb-safe pt-2 z-10"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex justify-around items-center">
          {NAV_ITEMS.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                aria-current={isActive ? 'page' : undefined}
                className="flex flex-col items-center gap-1 flex-1 min-h-11 py-1 transition-colors"
              >
                <div className={`flex items-center justify-center w-11 h-7 rounded-full transition-all ${
                  isActive ? 'bg-primary-surface' : ''
                }`}>
                  <Icon
                    size={22}
                    aria-hidden="true"
                    className={isActive ? 'text-primary-text' : 'text-fg-faint'}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </div>
                <span className={`text-[11px] font-semibold tracking-tight ${
                  isActive ? 'text-primary-text' : 'text-fg-faint'
                }`}>{label}</span>
              </button>
            );
          })}
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
