import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarPlus, Check, ChevronLeft, Layers3, Plus, Trash2, X } from 'lucide-react';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { Task } from '../types/task';
import type { TaskTemplate } from '../types/template';
import { formatDateLabel, getTodayString } from '../utils/taskUtils';

interface TemplatesModalProps {
    isOpen: boolean;
    onClose: () => void;
    templates: TaskTemplate[];
    tasks: Task[];
    initialDate: string;
    onCreate: (name: string, tasks: Task[]) => TaskTemplate;
    onDelete: (id: string) => void;
    onApply: (template: TaskTemplate, date: string) => void;
}

const kindLabel = (template: TaskTemplate): string =>
    template.kind === 'task' ? 'Aufgabenvorlage' : `Routine · ${template.items.length} Aufgaben`;

export default function TemplatesModal({
    isOpen,
    onClose,
    templates,
    tasks,
    initialDate,
    onCreate,
    onDelete,
    onApply,
}: TemplatesModalProps) {
    const sheetRef = useRef<HTMLDivElement>(null);
    useDialogFocus(isOpen, sheetRef);
    const [mode, setMode] = useState<'library' | 'create'>('library');
    const [targetDate, setTargetDate] = useState(initialDate);
    const [name, setName] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);

    useEffect(() => {
        if (!isOpen) return;
        setMode('library');
        setTargetDate(initialDate);
        setName('');
        setSelectedIds([]);
    }, [isOpen, initialDate]);

    const candidates = useMemo(() => [...tasks]
        .filter(task => !task.completed)
        .sort((a, b) => a.date.localeCompare(b.date)
            || (a.time || '99:99').localeCompare(b.time || '99:99')
            || a.id.localeCompare(b.id)), [tasks]);

    const selectedTasks = selectedIds
        .map(id => candidates.find(task => task.id === id))
        .filter((task): task is Task => Boolean(task));

    const toggleSelected = (id: string) => setSelectedIds(current =>
        current.includes(id) ? current.filter(candidate => candidate !== id) : [...current, id]);

    const save = () => {
        if (!name.trim() || selectedTasks.length === 0) return;
        onCreate(name, selectedTasks);
        setMode('library');
        setName('');
        setSelectedIds([]);
    };

    const remove = (template: TaskTemplate) => {
        if (window.confirm(`„${template.name}“ wirklich löschen?`)) onDelete(template.id);
    };

    return (
        <>
            <div className={`fixed inset-0 z-40 bg-black/70 transition-opacity ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`} onClick={onClose} aria-hidden="true" />
            <div
                ref={sheetRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Vorlagen und Routinen"
                inert={!isOpen}
                className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-[2rem] bg-surface-overlay transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}
            >
                <div className="flex-none border-b border-edge px-5 pb-3 pt-3">
                    <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-handle" />
                    <div className="flex min-h-11 items-center justify-between gap-3">
                        {mode === 'create' ? (
                            <button type="button" onClick={() => setMode('library')} className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-secondary" aria-label="Zurück zu Vorlagen">
                                <ChevronLeft size={22} aria-hidden="true" />
                            </button>
                        ) : <span className="h-11 w-11" />}
                        <div className="min-w-0 text-center">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-text">Phase 2</p>
                            <h2 className="truncate text-[17px] font-bold text-fg">{mode === 'create' ? 'Vorlage erstellen' : 'Vorlagen & Routinen'}</h2>
                        </div>
                        <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-secondary" aria-label="Vorlagen schließen">
                            <X size={22} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-safe pt-4">
                    {mode === 'library' ? (
                        <>
                            <section className="rounded-2xl border border-edge bg-surface-raised p-4" aria-label="Zieldatum">
                                <div className="flex items-center gap-2 text-fg">
                                    <CalendarPlus size={20} className="text-primary-text" aria-hidden="true" />
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-secondary">Planungsstart</p>
                                        <p className="text-[15px] font-bold">{formatDateLabel(targetDate)}</p>
                                    </div>
                                </div>
                                <input type="date" aria-label="Startdatum für Vorlage" min={getTodayString()} value={targetDate} onChange={event => setTargetDate(event.target.value)} className="mt-3 min-h-11 w-full rounded-xl border border-edge-muted bg-surface-inset px-3 text-[15px] font-semibold text-fg" />
                            </section>

                            <button type="button" onClick={() => setMode('create')} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 font-semibold text-white">
                                <Plus size={19} aria-hidden="true" />
                                Neue Vorlage oder Routine
                            </button>

                            <div className="mt-5 flex flex-col gap-3" data-template-library>
                                {templates.length === 0 ? (
                                    <div className="rounded-2xl border border-dashed border-edge-muted px-5 py-8 text-center">
                                        <Layers3 size={32} className="mx-auto text-fg-faint" aria-hidden="true" />
                                        <p className="mt-3 font-bold text-fg">Noch keine Vorlagen</p>
                                        <p className="mt-1 text-sm leading-6 text-fg-secondary">Wähle eine oder mehrere bestehende Aufgaben. Eine Auswahl wird zur Vorlage, mehrere werden zur Routine.</p>
                                    </div>
                                ) : templates.map(template => (
                                    <article key={template.id} className="rounded-2xl border border-edge bg-surface-raised p-4" data-template-card={template.id}>
                                        <div className="flex items-start gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 dir="auto" className="break-words text-start text-[16px] font-bold text-fg">{template.name}</h3>
                                                <p className="mt-1 text-[12px] text-fg-secondary">{kindLabel(template)}</p>
                                                <p dir="auto" className="mt-2 line-clamp-2 text-start text-[13px] text-fg-secondary">{template.items.map(item => item.title).join(' · ')}</p>
                                            </div>
                                            <button type="button" onClick={() => remove(template)} className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-danger hover:bg-danger-surface" aria-label={`Vorlage löschen: ${template.name}`}>
                                                <Trash2 size={18} aria-hidden="true" />
                                            </button>
                                        </div>
                                        <button type="button" onClick={() => onApply(template, targetDate)} disabled={!targetDate || targetDate < getTodayString()} className="mt-3 min-h-11 w-full rounded-xl bg-primary-surface px-4 text-sm font-semibold text-primary-text disabled:opacity-40">
                                            Ab {formatDateLabel(targetDate)} planen
                                        </button>
                                    </article>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <label htmlFor="template-name" className="text-[11px] font-semibold uppercase tracking-wider text-fg-secondary">Name</label>
                            <input id="template-name" dir="auto" value={name} onChange={event => setName(event.target.value)} placeholder="z. B. Morgenroutine" className="mt-2 min-h-12 w-full rounded-xl border border-edge-muted bg-surface-inset px-4 text-[16px] font-semibold text-fg placeholder:text-fg-placeholder" />
                            <div className="mt-5">
                                <p className="font-bold text-fg">Offene Aufgaben auswählen</p>
                                <p className="mt-1 text-[13px] leading-5 text-fg-secondary">Eine Aufgabe ergibt eine Vorlage. Mehrere Aufgaben bilden eine Routine; ihre Tagesabstände bleiben erhalten.</p>
                            </div>
                            <div className="mt-3 flex flex-col gap-2" data-template-task-picker>
                                {candidates.map(task => {
                                    const selected = selectedIds.includes(task.id);
                                    return (
                                        <button key={task.id} type="button" onClick={() => toggleSelected(task.id)} aria-pressed={selected} className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected ? 'border-primary bg-primary-surface' : 'border-edge bg-surface-raised'}`}>
                                            <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${selected ? 'border-primary bg-primary text-white' : 'border-edge-strong'}`}>{selected && <Check size={15} aria-hidden="true" />}</span>
                                            <span className="min-w-0 flex-1">
                                                <span dir="auto" className="block break-words text-start text-sm font-semibold text-fg">{task.title}</span>
                                                <span dir="ltr" className="mt-0.5 block text-[11px] text-fg-secondary">{task.date} · {task.time || 'Ohne Zeit'}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                                {candidates.length === 0 && <p className="rounded-xl border border-dashed border-edge-muted p-5 text-center text-sm text-fg-secondary">Keine offenen Aufgaben verfügbar.</p>}
                            </div>
                            <button type="button" onClick={save} disabled={!name.trim() || selectedTasks.length === 0} className="mb-6 mt-5 min-h-12 w-full rounded-2xl bg-primary px-4 font-bold text-white disabled:opacity-40">
                                {selectedTasks.length > 1 ? `Routine mit ${selectedTasks.length} Aufgaben speichern` : 'Vorlage speichern'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
