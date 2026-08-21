import { useEffect, useState } from 'react';
import type { Task } from '../types/task';
import type { TaskTemplate } from '../types/template';
import { isValidTemplateArray } from '../types/template';
import { STORAGE_KEYS, loadTemplatesSlice, serializeTemplates } from '../utils/appStorage';
import { blockReasonFor, isSliceBlocked, registerBlockedSlice, subscribeStorageHealth } from '../utils/storageHealth';
import { buildTaskTemplate } from '../utils/taskTemplates';

const newId = (prefix: string): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function useTaskTemplates() {
    const [initialLoad] = useState(() => loadTemplatesSlice(localStorage, new Date().toISOString()));
    const [templates, setTemplates] = useState<TaskTemplate[]>(() => initialLoad.value ?? []);
    const [persistBlocked, setPersistBlocked] = useState(initialLoad.blocked || isSliceBlocked('templates'));

    useEffect(() => {
        if (initialLoad.blocked) {
            registerBlockedSlice({
                slice: 'templates',
                reason: blockReasonFor(initialLoad.status),
                recoveryKey: initialLoad.recoveryKey,
                detail: initialLoad.detail,
            });
        }
        if (!initialLoad.blocked && !isSliceBlocked('templates')) return;
        return subscribeStorageHealth(() => setPersistBlocked(isSliceBlocked('templates')));
    }, [initialLoad]);

    useEffect(() => {
        if (persistBlocked) return;
        try {
            if (!isValidTemplateArray(templates)) {
                console.error('Invalid template state detected, skipping save to protect localStorage');
                return;
            }
            localStorage.setItem(STORAGE_KEYS.templates, serializeTemplates(templates));
        } catch (error) {
            console.error('Failed to persist task templates', error);
        }
    }, [templates, persistBlocked]);

    return {
        templates,
        createTemplate: (name: string, tasks: Task[]) => {
            const template = buildTaskTemplate(name, tasks, newId('template'), new Date().toISOString());
            setTemplates(current => [...current, template]);
            return template;
        },
        deleteTemplate: (id: string) => setTemplates(current => current.filter(template => template.id !== id)),
    };
}
