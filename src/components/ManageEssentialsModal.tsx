import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';
import type { DailyEssential } from '../types/essential';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDialogFocus } from '../hooks/useDialogFocus';
interface ManageEssentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  essentials: DailyEssential[];
  onAdd: (title: string, targetCount: number) => void;
  onEdit: (id: string, updates: Partial<Pick<DailyEssential, 'title' | 'targetCount' | 'order'>>) => void;
  onDelete: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
}

const SortableEssentialItem: React.FC<{ 
  e: DailyEssential; 
  onStartEdit: (e: DailyEssential) => void; 
  onDelete: (id: string) => void;
}> = ({ e, onStartEdit, onDelete }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: e.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 2 : 1,
    position: 'relative' as const,
  };

  return (
    <div 
        ref={setNodeRef} 
        style={style} 
        {...attributes} 
        {...listeners} 
        className={`group flex items-center justify-between bg-surface-raised p-3.5 rounded-xl border ${
          isDragging ? 'border-primary shadow-lg opacity-90 scale-[1.02]' : 'border-edge-subtle'
        } transition-all duration-200`}
    >
      <div className="flex flex-col flex-1 min-w-0 pointer-events-none">
        <span dir="auto" className="text-[15px] font-semibold text-fg">{e.title}</span>
        <span className="text-[13px] text-fg-secondary">
          {e.targetCount === 1 ? 'Einfaches Element' : `Mehrfach-Häkchen (${e.targetCount})`}
        </span>
      </div>
      <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onStartEdit(e)}
          aria-label={`Bearbeiten: ${e.title}`}
          className="w-11 h-11 flex items-center justify-center rounded-md bg-transparent hover:bg-surface-control text-fg-secondary transition-colors"
        >
          <Edit2 size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(e.id)}
          aria-label={`Löschen: ${e.title}`}
          className="w-11 h-11 flex items-center justify-center rounded-md bg-transparent hover:bg-danger-surface text-fg-secondary hover:text-danger transition-colors"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
export default function ManageEssentialsModal({
  isOpen,
  onClose,
  essentials,
  onAdd,
  onEdit,
  onDelete,
  onReorder
}: ManageEssentialsModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(isOpen, dialogRef);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formTitle, setFormTitle] = useState('');
  const [formTargetCount, setFormTargetCount] = useState(1);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string);
    }
  };

  // Reset internal states when opened
  useEffect(() => {
    if (isOpen) {
      setIsAdding(false);
      setEditingId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartAdd = () => {
    setFormTitle('');
    setFormTargetCount(1);
    setIsAdding(true);
    setEditingId(null);
  };

  const handleStartEdit = (e: DailyEssential) => {
    setFormTitle(e.title);
    setFormTargetCount(e.targetCount);
    setEditingId(e.id);
    setIsAdding(false);
  };

  const handleSave = () => {
    if (!formTitle.trim()) return;
    
    if (isAdding) {
      onAdd(formTitle.trim(), formTargetCount);
      setIsAdding(false);
    } else if (editingId) {
      onEdit(editingId, { title: formTitle.trim(), targetCount: formTargetCount });
      setEditingId(null);
    }
  };

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
  };

  const renderForm = () => (
    <div className="bg-surface-raised p-4 rounded-xl border border-edge-subtle flex flex-col gap-4 mb-4">
      <div>
        <label htmlFor="essential-title" className="block text-xs font-semibold text-fg-secondary mb-1.5 uppercase tracking-wider">Elementname</label>
        <input
          autoFocus
          id="essential-title"
          type="text"
          dir="auto"
          value={formTitle}
          onChange={e => setFormTitle(e.target.value)}
          placeholder="z.B. Vitamine, Sport, Wasser"
          className="w-full bg-surface-inset border border-edge-subtle rounded-lg px-3 py-2.5 min-h-11 text-fg text-[15px] placeholder:text-fg-placeholder focus:border-primary transition-colors"
        />
      </div>
      <div>
        <label htmlFor="essential-target" className="block text-xs font-semibold text-fg-secondary mb-1.5 uppercase tracking-wider">Tagesziel</label>
        <div className="flex items-center gap-3">
          <input
            id="essential-target"
            type="range"
            min="1"
            max="10"
            value={formTargetCount}
            onChange={e => setFormTargetCount(parseInt(e.target.value))}
            className="flex-1 min-h-11 accent-primary"
          />
          <div className="w-12 h-10 bg-surface-inset border border-edge-subtle rounded-lg flex items-center justify-center text-fg font-bold select-none">
            {formTargetCount}
          </div>
        </div>
        <p className="text-[12px] text-fg-secondary mt-1.5">
          {formTargetCount === 1 ? 'Einfacher Schalter (Erledigt / Nicht erledigt)' : `Benötigt ${formTargetCount} Häkchen zum Abschließen`}
        </p>
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={cancelForm}
          className="flex-1 py-2.5 min-h-11 rounded-lg font-semibold text-[14px] text-fg bg-surface-control hover:bg-edge-subtle transition-colors"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!formTitle.trim()}
          className="flex-1 py-2.5 min-h-11 rounded-lg font-semibold text-[14px] text-white bg-primary hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          <Check size={16} strokeWidth={2.5} aria-hidden="true" />
          Speichern
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-5 bg-black/60 backdrop-blur-sm">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Essentials verwalten"
        className="bg-page w-full max-w-md rounded-3xl border border-edge/50 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-surface-raised flex items-center justify-between flex-shrink-0">
          <h2 className="text-[18px] font-bold text-fg tracking-tight">Essentials verwalten</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="tap-target-44 w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-control text-fg-secondary transition-colors"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1 relative">
          {(isAdding || editingId) ? (
            renderForm()
          ) : (
            <div className="flex flex-col gap-3">
              {essentials.length === 0 ? (
                <div className="text-center py-8 text-fg-secondary">
                  <div className="w-12 h-12 rounded-full bg-surface-raised flex items-center justify-center mx-auto mb-3" aria-hidden="true">
                    <Check size={24} className="text-fg-faint" />
                  </div>
                  <p className="font-medium text-[15px] text-fg mb-1">Keine täglichen Essentials</p>
                  <p className="text-[14px]">Füge tägliche Gewohnheiten hinzu, die du verfolgen möchtest.</p>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={essentials.map(e => e.id)} strategy={verticalListSortingStrategy}>
                    {essentials.map(e => (
                      <SortableEssentialItem 
                        key={e.id} 
                        e={e} 
                        onStartEdit={handleStartEdit} 
                        onDelete={onDelete} 
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}

              <button
                type="button"
                onClick={handleStartAdd}
                className="mt-2 w-full py-3.5 min-h-11 rounded-xl border-2 border-dashed border-edge-strong text-fg-secondary hover:text-primary-text hover:border-primary hover:bg-primary-surface transition-all flex items-center justify-center gap-2 font-semibold text-[15px]"
              >
                <Plus size={18} strokeWidth={2.5} aria-hidden="true" />
                Neues Essential hinzufügen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
