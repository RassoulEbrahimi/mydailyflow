import { useState, useEffect } from 'react';
import type { Task } from '../types/task';
import { isValidTaskArray } from '../types/task';
import { STORAGE_KEYS, loadTasksSlice, serializeTasks } from '../utils/appStorage';
import { blockReasonFor, isSliceBlocked, registerBlockedSlice, subscribeStorageHealth } from '../utils/storageHealth';
import { buildNextOccurrence, getTodayString, nextRecurrenceDate, rolloverTasksForDate, withRecurrenceAnchor } from '../utils/taskUtils';

export function useTasks() {
  // Loaded once, synchronously, so the "may we persist?" answer exists before
  // the first persistence effect can ever run. See useDailyEssentials for the
  // same pattern applied independently to its two slices.
  const [initialLoad] = useState(() => loadTasksSlice(localStorage, new Date().toISOString()));

  const [tasks, setTasks] = useState<Task[]>(() => {
    const today = getTodayString();
    const withDate = (rawTasks: Task[]): Task[] =>
      rawTasks.map(t => t.date ? t : { ...t, date: today });

    if (initialLoad.value) {
      if (initialLoad.status === 'migrated') {
        console.log('Migrating legacy tasks array to versioned storage');
      }
      return withDate(initialLoad.value);
    }

    if (initialLoad.blocked) {
      // The stored value could not be read. It has been copied aside (or left
      // in place if that copy failed) and writes stay suppressed, so this empty
      // list never reaches storage.
      console.warn('Task data unreadable — persistence suspended', initialLoad.detail);
      return [];
    }

    if (import.meta.env.DEV) {
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

  /** Write suppression for the task slice only — essentials are unaffected. */
  const [persistBlocked, setPersistBlocked] = useState(initialLoad.blocked);

  useEffect(() => {
    if (!initialLoad.blocked) return;

    registerBlockedSlice({
      slice: 'tasks',
      reason: blockReasonFor(initialLoad.status),
      recoveryKey: initialLoad.recoveryKey,
      detail: initialLoad.detail,
    });

    // Lifted by an explicit user action in Settings, or by a successful import.
    return subscribeStorageHealth(() => {
      if (!isSliceBlocked('tasks')) setPersistBlocked(false);
    });
  }, [initialLoad]);

  useEffect(() => {
    if (persistBlocked) return;
    try {
      if (isValidTaskArray(tasks)) {
        localStorage.setItem(STORAGE_KEYS.tasks, serializeTasks(tasks));
      } else {
        console.error('Invalid tasks state detected, skipping save to protect localStorage');
      }
    } catch (e) {
      console.error('Failed to stringify tasks for saving', e);
    }
  }, [tasks, persistBlocked]);

  useEffect(() => {
    let lastProcessedDate: string | null = null;

    const checkRollover = () => {
      const today = getTodayString();
      if (lastProcessedDate === today) return;

      lastProcessedDate = today;
      setTasks(prev => rolloverTasksForDate(prev, today));
      localStorage.setItem('lastRolloverDate', today);
    };

    checkRollover();

    // Keep the Today view and task dates correct if the app stays open overnight.
    const intervalId = window.setInterval(checkRollover, 60000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkRollover();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // recurrenceAnchorDay is owned by this hook, not by callers: it is derived
  // from the task's own recurrence and scheduled date on every save.
  const saveTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom' | 'recurrenceAnchorDay'>, taskToEdit?: Task | null): Task => {
    let savedTaskInner: Task;

    if (taskToEdit) {
      savedTaskInner = withRecurrenceAnchor({ ...taskToEdit, ...taskData });
      setTasks(prev => prev.map(t => t.id === taskToEdit.id ? savedTaskInner : t));
    } else {
      savedTaskInner = withRecurrenceAnchor({
        ...taskData,
        id: Math.random().toString(36).substr(2, 9),
        completed: false,
        createdAt: new Date().toISOString(),
        date: getTodayString(),
      });
      setTasks(prev => [...prev, savedTaskInner]);
    }
    return savedTaskInner;
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id);
      if (!target) return prev;

      const nowCompleted = !target.completed;
      const updated = prev.map(t => t.id === id ? { ...t, completed: nowCompleted } : t);

      if (nowCompleted) {
        const nextTask = buildNextOccurrence(
          target,
          updated,
          () => Math.random().toString(36).substr(2, 9),
          () => new Date().toISOString(),
        );
        if (nextTask) return [...updated, nextTask];
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

  /**
   * Restores the exact object removed by an undoable delete.
   *
   * The duplicate guard makes a delayed/double Undo harmless. Sorting remains
   * a view concern below, so restoring does not mutate any task field or add a
   * persistence/schema concept.
   */
  const restoreTask = (task: Task) => {
    setTasks(prev => prev.some(existing => existing.id === task.id) ? prev : [...prev, task]);
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    const timeA = a.time || '23:59';
    const timeB = b.time || '23:59';
    if (timeA !== timeB) {
      return timeA.localeCompare(timeB);
    }
    const createdA = a.createdAt || '';
    const createdB = b.createdAt || '';
    return createdA.localeCompare(createdB);
  });

  const moveTaskToTomorrow = (id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        return { ...t, date: nextRecurrenceDate(getTodayString(), 'daily') };
      }
      return t;
    }));
  };

  return { tasks: sortedTasks, saveTask, toggleTaskStatus, toggleChecklistItem, deleteTask, restoreTask, moveTaskToTomorrow };
}
