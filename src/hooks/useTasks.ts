import { useState, useEffect } from 'react';
import type { Task } from '../types/task';
import { isStorageWrapper, isValidTaskArray, type StorageWrapper } from '../types/task';
import { getTodayString, nextRecurrenceDate } from '../utils/taskUtils';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const today = getTodayString();
    const withDate = (rawTasks: Task[]): Task[] =>
      rawTasks.map(t => t.date ? t : { ...t, date: today });

    const saved = localStorage.getItem('myDailyFlowTasks');
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);
        if (isStorageWrapper(parsed)) return withDate(parsed.data);
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
  }, []);

  const saveTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'completed' | 'date' | 'rolledOverFrom'>, taskToEdit?: Task | null): Task => {
    let savedTaskInner: Task;

    if (taskToEdit) {
      savedTaskInner = { ...taskToEdit, ...taskData };
      setTasks(prev => prev.map(t => t.id === taskToEdit.id ? savedTaskInner : t));
    } else {
      savedTaskInner = {
        ...taskData,
        id: Math.random().toString(36).substr(2, 9),
        completed: false,
        createdAt: new Date().toISOString(),
        date: getTodayString(),
      };
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

      if (nowCompleted && target.recurrence && target.recurrence !== 'none') {
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

  return { tasks, saveTask, toggleTaskStatus, toggleChecklistItem, deleteTask };
}
