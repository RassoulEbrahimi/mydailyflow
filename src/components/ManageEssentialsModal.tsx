import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check } from 'lucide-react';
import type { DailyEssential } from '../types/essential';

interface ManageEssentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  essentials: DailyEssential[];
  onAdd: (title: string, targetCount: number) => void;
  onEdit: (id: string, updates: Partial<Pick<DailyEssential, 'title' | 'targetCount' | 'order'>>) => void;
  onDelete: (id: string) => void;
}

export default function ManageEssentialsModal({
  isOpen,
  onClose,
  essentials,
  onAdd,
  onEdit,
  onDelete
}: ManageEssentialsModalProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formTitle, setFormTitle] = useState('');
  const [formTargetCount, setFormTargetCount] = useState(1);

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
    <div className="bg-[#1e273b] p-4 rounded-xl border border-[#2a364d] flex flex-col gap-4 mb-4">
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Item Name</label>
        <input 
          autoFocus
          type="text"
          value={formTitle}
          onChange={e => setFormTitle(e.target.value)}
          placeholder="e.g. Vitamins, Gym, Water"
          className="w-full bg-[#0d1520] border border-[#2a364d] rounded-lg px-3 py-2.5 text-white text-[15px] outline-none focus:border-blue-500 transition-colors"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Daily Target</label>
        <div className="flex items-center gap-3">
          <input 
            type="range"
            min="1"
            max="10"
            value={formTargetCount}
            onChange={e => setFormTargetCount(parseInt(e.target.value))}
            className="flex-1 accent-blue-500"
          />
          <div className="w-12 h-10 bg-[#0d1520] border border-[#2a364d] rounded-lg flex items-center justify-center text-white font-bold select-none">
            {formTargetCount}
          </div>
        </div>
        <p className="text-[12px] text-slate-500 mt-1.5">
          {formTargetCount === 1 ? 'Simple toggle (Done / Not Done)' : `Requires ${formTargetCount} checks to complete`}
        </p>
      </div>
      <div className="flex gap-2 mt-2">
        <button 
          onClick={cancelForm}
          className="flex-1 py-2.5 rounded-lg font-semibold text-[14px] text-slate-300 bg-[#2a364d] hover:bg-[#334155] transition-colors"
        >
          Cancel
        </button>
        <button 
          onClick={handleSave}
          disabled={!formTitle.trim()}
          className="flex-1 py-2.5 rounded-lg font-semibold text-[14px] text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          <Check size={16} strokeWidth={2.5} />
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div 
        className="bg-background-dark w-full max-w-md rounded-3xl border border-[#232f48]/50 shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-[#1e273b] flex items-center justify-between">
          <h2 className="text-[18px] font-bold text-white tracking-tight">Manage Essentials</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 text-slate-400 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {(isAdding || editingId) ? (
            renderForm()
          ) : (
            <div className="flex flex-col gap-3">
              {essentials.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-3">
                    <Check size={24} className="opacity-50" />
                  </div>
                  <p className="font-medium text-[15px] text-slate-300 mb-1">No Daily Essentials</p>
                  <p className="text-[14px]">Add daily habits you want to track.</p>
                </div>
              ) : (
                essentials.map(e => (
                  <div key={e.id} className="group flex items-center justify-between bg-[#1e273b] p-3.5 rounded-xl border border-[#2a364d]">
                    <div className="flex flex-col">
                      <span className="text-[15px] font-semibold text-slate-200">{e.title}</span>
                      <span className="text-[13px] text-slate-500">
                        {e.targetCount === 1 ? 'Simple Item' : `Multi-check (${e.targetCount})`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => handleStartEdit(e)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-slate-700 text-slate-400 transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button 
                        onClick={() => onDelete(e.id)}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-transparent hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )}

              <button 
                onClick={handleStartAdd}
                className="mt-2 w-full py-3.5 rounded-xl border-2 border-dashed border-[#2a364d] text-slate-400 hover:text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex items-center justify-center gap-2 font-semibold text-[15px]"
              >
                <Plus size={18} strokeWidth={2.5} />
                Add New Essential
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
