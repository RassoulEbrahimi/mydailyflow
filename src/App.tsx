import { Waves, Search, Bell, Check, Clock, Pencil, Plus, Sun, List, CheckCircle2, Menu, CloudSun, Moon, Trash2 } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, useDroppable } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export interface Task {
  id: string;
  title: string;
  description?: string;
  time: string;
  duration: string;
  timeBlock: 'morning' | 'afternoon' | 'evening';
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
}

const isValidTaskArray = (data: unknown): data is Task[] => {
  if (!Array.isArray(data)) return false;

  return data.every(item => {
    if (!item || typeof item !== 'object') return false;
    const t = item as Record<string, unknown>;
    return (
      typeof t.id === 'string' &&
      typeof t.title === 'string' &&
      (t.description === undefined || typeof t.description === 'string') &&
      typeof t.time === 'string' &&
      typeof t.duration === 'string' &&
      ['morning', 'afternoon', 'evening'].includes(t.timeBlock as string) &&
      typeof t.completed === 'boolean' &&
      ['low', 'medium', 'high'].includes(t.priority as string) &&
      typeof t.createdAt === 'string'
    );
  });
};

interface StorageWrapper {
  version: number;
  data: Task[];
}

const isStorageWrapper = (data: unknown): data is StorageWrapper => {
  if (!data || typeof data !== 'object') return false;
  const w = data as Record<string, unknown>;
  return typeof w.version === 'number' && isValidTaskArray(w.data);
};

const ProgressRing = ({ percentage, completed, total }: { percentage: number, completed: number, total: number }) => {
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-6">
      <div className="relative w-48 h-48 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            className="text-card-dark"
            cx="96"
            cy="96"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeWidth="12"
          />
          <circle
            className="text-primary shadow-[0_0_15px_rgba(19,91,236,0.5)] transition-all duration-1000 ease-out"
            cx="96"
            cy="96"
            fill="transparent"
            r={radius}
            stroke="currentColor"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            strokeWidth="12"
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-4xl font-bold text-white">{percentage}%</span>
          <span className="text-sm text-text-secondary font-medium mt-1">
            {completed}/{total} tasks
          </span>
        </div>
      </div>
    </div>
  );
};

interface TaskCardProps {
  task: Task;
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
  key?: React.Key;
}

const TaskCard = ({
  task,
  onToggleComplete,
  onDelete,
  onEdit
}: TaskCardProps) => {
  const { id, title, time, duration, completed, priority } = task;
  // A task is 'active' visually if it is the closest upcoming relative to current time, but for now we'll just not make any task arbitrarily active.
  const active = false;

  return (
    <div
      onDoubleClick={() => onEdit(task)}
      className={`group flex items-center p-4 bg-card-dark rounded-xl transition-all duration-300 relative overflow-hidden ${active ? 'border-l-4 border-l-primary border-y border-r border-y-[#232f48] border-r-[#232f48] shadow-lg hover:shadow-primary/10' : 'border border-[#232f48] hover:border-primary/50'
        }`}>
      {active && <div className="absolute inset-0 bg-primary/5 pointer-events-none"></div>}

      <button
        onClick={() => onToggleComplete(id)}
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-4 transition-colors ${completed ? 'bg-primary text-white' : active ? 'border-2 border-primary hover:bg-primary/20' : 'border-2 border-text-secondary hover:border-primary'
          }`}
      >
        {completed && <Check size={16} strokeWidth={3} />}
      </button>

      <div className={`flex-1 min-w-0 ${completed ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold text-white truncate ${completed ? 'line-through decoration-slate-500 font-medium' : ''}`}>
            {title}
          </h3>
          {priority === 'high' && <div className="w-2 h-2 flex-shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" title="High Priority"></div>}
          {priority === 'medium' && <div className="w-2 h-2 flex-shrink-0 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" title="Medium Priority"></div>}
          {priority === 'low' && <div className="w-2 h-2 flex-shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" title="Low Priority"></div>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs flex items-center gap-1 ${active ? 'text-primary font-medium' : 'text-text-secondary'}`}>
            <Clock size={14} /> {time}
          </span>
          <span className="w-1 h-1 rounded-full bg-text-secondary"></span>
          <span className="text-xs text-text-secondary">{duration}</span>
        </div>
      </div>

      <div className="flex flex-shrink-0 ml-3 gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onEdit(task); }} className="text-text-secondary hover:text-blue-400 transition-colors p-1">
          <Pencil size={20} />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(id); }} className="text-text-secondary hover:text-red-400 transition-colors p-1">
          <Trash2 size={20} />
        </button>
      </div>
    </div>
  );
};

const TaskSection = ({ title, timeRange, colorClass, shadowClass, children }: { title: string, timeRange?: string, colorClass: string, shadowClass: string, children: React.ReactNode }) => {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-8 w-1 rounded-full ${colorClass} ${shadowClass}`}></div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {timeRange && <p className="text-xs text-text-secondary">{timeRange}</p>}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
};

interface DroppableSectionProps {
  id: string;
  title: string;
  timeRange?: string;
  colorClass: string;
  shadowClass: string;
  tasks: Task[];
  onToggleComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (task: Task) => void;
}

const DroppableTaskSection = ({ id, title, timeRange, colorClass, shadowClass, tasks, onToggleComplete, onDelete, onEdit }: DroppableSectionProps) => {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-8 w-1 rounded-full ${colorClass} ${shadowClass}`}></div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          {timeRange && <p className="text-xs text-text-secondary">{timeRange}</p>}
        </div>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-col gap-3 min-h-[60px] rounded-xl transition-colors p-1 -m-1 ${isOver ? 'bg-primary/10 border border-primary/30' : 'border border-transparent'}`}
      >
        <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map(t => <SortableTaskCard key={t.id} task={t} onToggleComplete={onToggleComplete} onDelete={onDelete} onEdit={onEdit} />)}
        </SortableContext>
      </div>
    </section>
  );
};

const SortableTaskCard = ({ task, onToggleComplete, onDelete, onEdit }: TaskCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { timeBlock: task.timeBlock } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className={`touch-none w-full transition-shadow duration-200 ${isDragging ? 'shadow-2xl shadow-primary/20 rounded-xl rounded-none' : ''}`}>
      <TaskCard task={task} onToggleComplete={onToggleComplete} onDelete={onDelete} onEdit={onEdit} />
    </div>
  );
};

const NewTaskModal = ({
  isOpen,
  onClose,
  onSave,
  taskToEdit
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<Task, 'id' | 'createdAt' | 'completed'>, reminderEnabled: boolean) => void;
  taskToEdit?: Task | null;
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTime, setSelectedTime] = useState('14:00');
  const [selectedDuration, setSelectedDuration] = useState('30m');
  const [selectedTimeBlock, setSelectedTimeBlock] = useState('Afternoon');
  const [isReminderEnabled, setIsReminderEnabled] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState('Medium');

  useEffect(() => {
    if (isOpen) {
      if (taskToEdit) {
        setTitle(taskToEdit.title);
        setNotes(taskToEdit.description || '');
        setSelectedTime(taskToEdit.time);
        setSelectedDuration(taskToEdit.duration);
        setSelectedTimeBlock(taskToEdit.timeBlock.charAt(0).toUpperCase() + taskToEdit.timeBlock.slice(1));
        setSelectedPriority(taskToEdit.priority.charAt(0).toUpperCase() + taskToEdit.priority.slice(1));
        setIsReminderEnabled(false);
      } else {
        setTitle('');
        setNotes('');
        setSelectedTime('14:00');
        setSelectedDuration('30m');
        setSelectedTimeBlock('Afternoon');
        setIsReminderEnabled(true);
        setSelectedPriority('Medium');
      }
    }
  }, [isOpen, taskToEdit]);

  const handleSaveClick = () => {
    if (!title.trim()) return; // Don't save empty tasks

    onSave({
      title: title.trim(),
      description: notes.trim(),
      time: selectedTime,
      duration: selectedDuration,
      timeBlock: selectedTimeBlock.toLowerCase() as Task['timeBlock'],
      priority: selectedPriority.toLowerCase() as Task['priority']
    }, isReminderEnabled);

    onClose();
  };

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div className={`fixed bottom-0 left-0 w-full bg-[#151c2c] rounded-t-[2.5rem] z-50 p-6 pb-8 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] max-h-[90vh] overflow-y-auto custom-scrollbar ${isOpen ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="w-12 h-1.5 bg-[#2a364f] rounded-full mx-auto mb-6" />

        <div className="flex justify-between items-center mb-8 relative">
          <button onClick={onClose} className="text-text-secondary active:opacity-70 transition-opacity absolute left-0 text-[15px]">
            Cancel
          </button>
          <h2 className="text-white font-bold text-lg w-full text-center">{taskToEdit ? 'Edit Task' : 'New Task'}</h2>
        </div>

        <div className="mb-8 relative">
          <input
            type="text"
            placeholder="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-transparent text-white text-[22px] font-semibold placeholder:text-[#384666] focus:outline-none mb-4"
          />
          <div className="w-full h-[1px] bg-[#232f48] mb-4" />
          <div className="flex items-center justify-between">
            <input
              type="text"
              placeholder="Add notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-transparent text-text-secondary placeholder:text-text-secondary/60 focus:outline-none text-[15px]"
            />
            <Menu className="text-text-secondary w-5 h-5 ml-2 flex-shrink-0" />
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-text-secondary text-xs font-semibold tracking-wider mb-3">START TIME</h3>
          <div className="w-full bg-[#1e273b] p-3 rounded-[1.5rem] flex items-center justify-between shadow-sm border border-[#232f48]/50 transition-colors">
            <div className="flex items-center gap-4 pl-1">
              <div className="w-[42px] h-[42px] rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Clock size={20} className="fill-current text-primary" />
              </div>
              <div>
                <div className="text-white font-semibold text-[17px]">Time</div>
                <div className="text-text-secondary text-[13px]">Select start time</div>
              </div>
            </div>
            <input
              type="time"
              value={selectedTime}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="bg-[#151c2c] text-white px-3 py-2.5 rounded-[1rem] font-bold tracking-wider text-[15px] outline-none active:scale-[0.98] transition-transform [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:w-full cursor-pointer hover:bg-[#1a2336]"
            />
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-text-secondary text-xs font-semibold tracking-wider">DURATION</h3>
            <button className="text-primary text-sm font-semibold active:opacity-70 transition-opacity">Custom</button>
          </div>
          <div className="flex gap-3">
            {['15m', '30m', '1h', '2h'].map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDuration(d)}
                className={`flex-1 py-3.5 rounded-2xl font-semibold transition-all text-[15px] ${d === selectedDuration ? 'bg-primary text-white shadow-[0_0_15px_rgba(19,91,236,0.4)]' : 'bg-[#1e273b] text-text-secondary hover:bg-[#232f48]'
                  }`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-10">
          <h3 className="text-text-secondary text-xs font-semibold tracking-wider mb-3">TIME BLOCK</h3>
          <div className="flex gap-3">
            {[
              { label: 'Morning', icon: <Sun size={24} /> },
              { label: 'Afternoon', icon: <CloudSun size={24} className="fill-current text-primary opacity-20 relative z-10" /> },
              { label: 'Evening', icon: <Moon size={24} className="fill-current" /> }
            ].map(b => {
              const isActive = b.label === selectedTimeBlock;
              return (
                <button
                  key={b.label}
                  onClick={() => setSelectedTimeBlock(b.label)}
                  className={`flex-1 flex flex-col items-center justify-center py-5 rounded-[1.5rem] transition-all border ${isActive ? 'bg-[#1e273b]/60 border-primary text-primary shadow-[0_4px_20px_rgba(19,91,236,0.15)] relative overflow-hidden' : 'bg-[#1e273b] border-transparent text-text-secondary hover:bg-[#232f48]'
                    }`}
                >
                  {isActive && <div className="absolute inset-0 bg-primary/5"></div>}
                  <div className={`mb-2 ${isActive ? 'text-primary' : 'text-text-secondary'}`}>
                    {isActive ? <CloudSun size={24} strokeWidth={2.5} className="absolute inset-x-0 mx-auto fill-blue-500/30 text-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] z-20" /> : b.icon}
                  </div>
                  <span className={`text-[15px] font-medium z-20 ${isActive ? 'mt-[24px]' : ''}`}>{b.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-10">
          <button
            onClick={() => setIsReminderEnabled(!isReminderEnabled)}
            className="w-full bg-[#1e273b] p-4 px-5 rounded-[1.5rem] flex items-center justify-between border border-[#232f48]/50 active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="text-orange-500 opacity-90 drop-shadow-[0_0_4px_rgba(249,115,22,0.4)]">
                <Bell size={22} strokeWidth={2.5} className="fill-current" />
              </div>
              <span className="text-white font-semibold text-[16px]">Remind me</span>
            </div>
            <div className="flex items-center gap-4">
              {isReminderEnabled && <span className="text-text-secondary text-[15px]">10 min before</span>}
              <div className={`w-[52px] h-[30px] rounded-full relative transition-all duration-300 ${isReminderEnabled ? 'bg-primary shadow-[0_0_12px_rgba(19,91,236,0.4)]' : 'bg-[#232f48]'}`}>
                <div className={`absolute top-[2px] w-[26px] h-[26px] bg-white rounded-full shadow-sm transition-transform duration-300 ${isReminderEnabled ? 'right-1 translate-x-0' : 'left-1 translate-x-0'}`} />
              </div>
            </div>
          </button>
        </div>

        <div className="mb-10">
          <h3 className="text-text-secondary text-xs font-semibold tracking-wider mb-3">PRIORITY</h3>
          <div className="flex gap-3">
            {[
              { label: 'Low', activeColor: 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' },
              { label: 'Medium', activeColor: 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]' },
              { label: 'High', activeColor: 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]' }
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => setSelectedPriority(p.label)}
                className={`flex-1 py-3.5 rounded-2xl font-semibold transition-all text-[15px] border ${p.label === selectedPriority ? `${p.activeColor} border-transparent` : 'bg-[#1e273b] border-transparent text-text-secondary hover:bg-[#232f48]'
                  }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSaveClick}
          className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(19,91,236,0.4)] active:scale-[0.98] transition-transform"
        >
          <CheckCircle2 size={22} strokeWidth={2.5} />
          <span className="text-[17px]">{taskToEdit ? 'Save Changes' : 'Create Task'}</span>
        </button>
      </div>
    </>
  );
};

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);

  const openNewTaskModal = () => {
    setTaskToEdit(null);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setTaskToEdit(task);
    setIsModalOpen(true);
  };

  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('myDailyFlowTasks');
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved);

        // Handle new versioned format
        if (isStorageWrapper(parsed)) {
          return parsed.data;
        }

        // Auto-migrate legacy array format
        if (isValidTaskArray(parsed)) {
          console.log('Migrating legacy tasks array to versioned storage');
          return parsed;
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

    // Initial dummy state for local development demonstration
    if ((import.meta as any).env?.DEV) {
      return [
        { id: '1', title: 'Drink water', time: '07:00', duration: '5m', completed: true, timeBlock: 'morning', priority: 'medium', createdAt: new Date().toISOString() },
        { id: '2', title: 'Going to work', time: '07:30', duration: '45m', completed: true, timeBlock: 'morning', priority: 'high', createdAt: new Date().toISOString() },
        { id: '3', title: 'Eat lunch', time: '12:30', duration: '45m', completed: false, timeBlock: 'afternoon', priority: 'low', createdAt: new Date().toISOString() },
        { id: '4', title: 'Gym', time: '17:00', duration: '1h', completed: false, timeBlock: 'afternoon', priority: 'high', createdAt: new Date().toISOString() },
        { id: '5', title: 'Grocery shopping', time: '18:30', duration: '30m', completed: false, timeBlock: 'afternoon', priority: 'medium', createdAt: new Date().toISOString() },
        { id: '6', title: 'Call mom', time: '20:00', duration: '15m', completed: false, timeBlock: 'evening', priority: 'high', createdAt: new Date().toISOString() },
        { id: '7', title: 'Read book', time: '21:00', duration: '30m', completed: false, timeBlock: 'evening', priority: 'low', createdAt: new Date().toISOString() },
      ];
    }

    return [];
  });

  const [activeTab, setActiveTab] = useState<'today' | 'done'>('today');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const defaultTimeForBlock = (block: Task['timeBlock']): string => {
    if (block === 'morning') return '09:00';
    if (block === 'afternoon') return '14:00';
    return '18:00';
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId !== overId) {
      setTasks(prev => {
        const activeIndex = prev.findIndex(t => t.id === activeId);
        if (activeIndex === -1) return prev;

        const activeItem = prev[activeIndex];

        if (['morning', 'afternoon', 'evening'].includes(overId as string)) {
          const destBlock = overId as Task['timeBlock'];
          if (activeItem.timeBlock !== destBlock) {
            const newTasks = [...prev];
            newTasks[activeIndex] = { ...activeItem, timeBlock: destBlock, time: defaultTimeForBlock(destBlock) };
            return newTasks;
          }
          return prev;
        }

        const overIndex = prev.findIndex(t => t.id === overId);
        if (overIndex !== -1) {
          const overItem = prev[overIndex];
          let newTasks = [...prev];

          if (activeItem.timeBlock !== overItem.timeBlock) {
            newTasks[activeIndex] = { ...activeItem, timeBlock: overItem.timeBlock, time: defaultTimeForBlock(overItem.timeBlock) };
          }

          return arrayMove(newTasks, activeIndex, overIndex);
        }

        return prev;
      });
    }
  };

  // Sync to local storage on change
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

  const handleSaveTask = (taskData: Omit<Task, 'id' | 'createdAt' | 'completed'>, reminderEnabled: boolean) => {
    let savedTask: Task;

    if (taskToEdit) {
      savedTask = { ...taskToEdit, ...taskData };
      setTasks(prev => prev.map(t => t.id === taskToEdit.id ? savedTask : t));
    } else {
      savedTask = {
        ...taskData,
        id: Math.random().toString(36).substr(2, 9),
        completed: false,
        createdAt: new Date().toISOString()
      };
      setTasks(prev => [...prev, savedTask]);
    }

    if (reminderEnabled && 'Notification' in window) {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
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
      });
    }
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  // Derived state
  const filteredTasks = tasks.filter(t => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return t.title.toLowerCase().includes(query) || (t.description && t.description.toLowerCase().includes(query));
  });

  const totalTasksCount = filteredTasks.length;
  const completedTasksCount = filteredTasks.filter(t => t.completed).length;
  const progressPercentage = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;

  const pendingTasks = filteredTasks.filter(t => !t.completed);
  const doneTasks = filteredTasks.filter(t => t.completed).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const morningTasks = pendingTasks.filter(t => t.timeBlock === 'morning');
  const afternoonTasks = pendingTasks.filter(t => t.timeBlock === 'afternoon');
  const eveningTasks = pendingTasks.filter(t => t.timeBlock === 'evening');

  return (
    <div className="bg-background-dark font-display text-slate-100 min-h-screen flex flex-col overflow-hidden relative selection:bg-primary selection:text-white">
      {/* Header Section */}
      <header className="flex-none px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          {isSearchActive ? (
            <div className="flex-1 flex items-center bg-[#1e273b] rounded-full px-4 py-2 mr-4 border border-[#232f48]/50 overflow-hidden">
              <Search size={18} className="text-text-secondary mr-2 flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search tasks..."
                className="bg-transparent border-none outline-none text-white text-[15px] w-full placeholder:text-text-secondary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button onClick={() => { setIsSearchActive(false); setSearchQuery(''); }} className="text-text-secondary hover:text-white ml-2 flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/10">
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-primary">
              <Waves size={28} strokeWidth={2.5} />
              <span className="font-bold text-lg tracking-tight text-white">My Daily Flow</span>
            </div>
          )}
          <div className="flex items-center gap-4 flex-shrink-0">
            {!isSearchActive && (
              <button onClick={() => setIsSearchActive(true)} className="text-text-secondary hover:text-white transition-colors">
                <Search size={24} />
              </button>
            )}
            <div className="relative">
              <button className="text-text-secondary hover:text-white transition-colors">
                <Bell size={24} />
              </button>
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background-dark"></span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center text-center mt-2">
          <p className="text-text-secondary text-sm font-medium uppercase tracking-wider">
            {new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}
          </p>
          <h1 className="text-2xl font-bold mt-1 text-white">Good morning, SolariuS!</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-24 custom-scrollbar">
        <ProgressRing percentage={progressPercentage} completed={completedTasksCount} total={totalTasksCount} />

        {activeTab === 'today' ? (
          <div className="flex flex-col gap-8">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <DroppableTaskSection id="morning" title="Morning" timeRange="06:00 - 12:00" colorClass="bg-blue-400" shadowClass="shadow-[0_0_10px_rgba(96,165,250,0.5)]" tasks={morningTasks} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} />
              <DroppableTaskSection id="afternoon" title="Afternoon" timeRange="12:00 - 18:00" colorClass="bg-orange-400" shadowClass="shadow-[0_0_10px_rgba(251,146,60,0.5)]" tasks={afternoonTasks} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} />
              <DroppableTaskSection id="evening" title="Evening" timeRange="18:00 - 23:00" colorClass="bg-indigo-400" shadowClass="shadow-[0_0_10px_rgba(129,140,248,0.5)]" tasks={eveningTasks} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} />
            </DndContext>

            {pendingTasks.length === 0 && (
              <div className="text-center py-12 text-text-secondary mt-10">
                <CheckCircle2 size={48} className="mx-auto mb-4 opacity-30" />
                <p>All tasks completed for today!</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {doneTasks.length > 0 ? (
              <TaskSection title="Completed Tasks" colorClass="bg-emerald-400" shadowClass="shadow-[0_0_10px_rgba(52,211,153,0.5)]">
                {doneTasks.map(t => <TaskCard key={t.id} task={t} onToggleComplete={toggleTaskStatus} onDelete={deleteTask} onEdit={openEditTaskModal} />)}
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
        className="fixed bottom-24 right-5 h-14 w-14 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform z-20"
      >
        <Plus size={32} />
      </button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-card-dark border-t border-[#232f48] px-4 pb-6 pt-3 z-10">
        <div className="flex justify-between items-end">
          <button
            onClick={() => setActiveTab('today')}
            className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'today' ? 'text-primary' : 'text-text-secondary hover:text-white'}`}
          >
            <div className={`${activeTab === 'today' ? 'bg-primary/10 w-12 h-8 rounded-full flex items-center justify-center' : ''}`}>
              <Sun size={24} className={activeTab === 'today' ? 'fill-current' : ''} />
            </div>
            <span className="text-xs font-semibold">Today</span>
          </button>

          <button className="flex flex-col items-center gap-1 flex-1 text-text-secondary hover:text-white transition-colors group">
            <List size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">All Tasks</span>
          </button>

          <button className="flex flex-col items-center gap-1 flex-1 text-text-secondary hover:text-white transition-colors group">
            <Bell size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">Reminders</span>
          </button>

          <button
            onClick={() => setActiveTab('done')}
            className={`flex flex-col items-center gap-1 flex-1 transition-colors ${activeTab === 'done' ? 'text-primary' : 'text-text-secondary hover:text-white'}`}
          >
            <div className={`${activeTab === 'done' ? 'bg-primary/10 w-12 h-8 rounded-full flex items-center justify-center' : ''}`}>
              <CheckCircle2 size={24} className={`group-hover:scale-110 transition-transform ${activeTab === 'done' ? 'fill-current' : ''}`} />
            </div>
            <span className="text-xs font-medium">Done</span>
          </button>
        </div>
      </nav>

      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSaveTask} taskToEdit={taskToEdit} />
    </div>
  );
}
