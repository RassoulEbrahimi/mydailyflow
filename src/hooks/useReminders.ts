import { useEffect, useRef } from 'react';
import type { Task } from '../types/task';

// Store both the timeout handle AND the exact target time it was scheduled for.
// This allows us to detect if a task was edited to a new time.
type ScheduledReminder = {
  id: ReturnType<typeof setTimeout>;
  targetTime: number;
};

export function useReminders(tasks: Task[], globalRemindersEnabled: boolean) {
  const scheduledRef = useRef<Map<string, ScheduledReminder>>(new Map());

  // 1) Cleanup on unmount
  // This ensures timeouts do not leak if the app component unmounts.
  useEffect(() => {
    return () => {
      scheduledRef.current.forEach(val => clearTimeout(val.id));
      scheduledRef.current.clear();
    };
  }, []);

  // 2) Diff and update timeouts
  useEffect(() => {
    const scheduled = scheduledRef.current;

    // If notifications are totally disabled or unsupported, clear everything safely.
    if (!globalRemindersEnabled || !('Notification' in window) || Notification.permission !== 'granted') {
      scheduled.forEach(val => clearTimeout(val.id));
      scheduled.clear();
      return;
    }

    const now = Date.now();
    const validTaskIds = new Set<string>();

    tasks.forEach(task => {
      // 3) Safe reminder scheduling rules
      if (task.completed) return;
      if (task.reminderEnabled === false) return; // allows undefined to default to true for backward compatibility
      if (!task.time || !task.date) return;

      const [year, month, day] = task.date.split('-');
      const [hours, minutes] = task.time.split(':').map(Number);
      
      const taskTimeMs = new Date(Number(year), Number(month) - 1, Number(day), hours, minutes).getTime();
      const reminderTargetTime = taskTimeMs - 10 * 60000; // 10 minutes before task time
      const timeToWait = reminderTargetTime - now;

      // Only schedule if it's strictly in the future.
      // Maximum 24 hours into the future to avoid massive setTimeout integers.
      if (timeToWait > 0 && timeToWait <= 24 * 60 * 60 * 1000) {
        validTaskIds.add(task.id);
        const existing = scheduled.get(task.id);

        // 2) Reliable deduplication
        // If it's not scheduled, or scheduled for a DIFFERENT target time (e.g. task was edited), reschedule.
        if (!existing || existing.targetTime !== reminderTargetTime) {
          if (existing) {
             clearTimeout(existing.id);
          }
          const timeoutId = setTimeout(() => {
            new Notification(`🔔 Reminder: ${task.title}`, {
              body: `Your task is scheduled for ${task.time}`
            });
            scheduled.delete(task.id);
          }, timeToWait);
          
          scheduled.set(task.id, { id: timeoutId, targetTime: reminderTargetTime });
        }
      }
    });

    // Cleanup phase: any task in the Map that is NOT in validTaskIds was either
    // deleted, marked completed, its time was changed to the past, or reminder turned off.
    scheduled.forEach((val, taskId) => {
      if (!validTaskIds.has(taskId)) {
        clearTimeout(val.id);
        scheduled.delete(taskId);
      }
    });

  }, [tasks, globalRemindersEnabled]);
}
