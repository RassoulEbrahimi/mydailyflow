import { Waves, Search, Bell, Check, Clock, Pencil, Plus, Sun, List, CheckCircle2, Menu, CloudSun, Moon } from 'lucide-react';
import React, { useState } from 'react';

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

const TaskCard = ({
  title,
  time,
  duration,
  completed = false,
  active = false,
  priority = false
}: {
  title: string,
  time: string,
  duration: string,
  completed?: boolean,
  active?: boolean,
  priority?: boolean
}) => {
  return (
    <div className={`group flex items-center p-4 bg-card-dark rounded-xl transition-all duration-300 relative overflow-hidden ${active ? 'border-l-4 border-l-primary border-y border-r border-y-[#232f48] border-r-[#232f48] shadow-lg hover:shadow-primary/10' : 'border border-[#232f48] hover:border-primary/50'
      }`}>
      {active && <div className="absolute inset-0 bg-primary/5 pointer-events-none"></div>}

      <button className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-4 transition-colors ${completed ? 'bg-primary text-white' : active ? 'border-2 border-primary hover:bg-primary/20' : 'border-2 border-text-secondary hover:border-primary'
        }`}>
        {completed && <Check size={16} strokeWidth={3} />}
      </button>

      <div className={`flex-1 min-w-0 ${completed ? 'opacity-50' : ''}`}>
        <div className="flex items-center justify-between">
          <h3 className={`font-semibold text-white truncate ${completed ? 'line-through decoration-slate-500 font-medium' : ''}`}>
            {title}
          </h3>
          {priority && <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" title="High Priority"></div>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs flex items-center gap-1 ${active ? 'text-primary font-medium' : 'text-text-secondary'}`}>
            <Clock size={14} /> {time}
          </span>
          <span className="w-1 h-1 rounded-full bg-text-secondary"></span>
          <span className="text-xs text-text-secondary">{duration}</span>
        </div>
      </div>

      {!completed && (
        <button className="ml-3 text-text-secondary hover:text-white transition-colors opacity-0 group-hover:opacity-100">
          <Pencil size={20} />
        </button>
      )}
    </div>
  );
};

const TaskSection = ({ title, timeRange, colorClass, shadowClass, children }: { title: string, timeRange: string, colorClass: string, shadowClass: string, children: React.ReactNode }) => {
  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className={`h-8 w-1 rounded-full ${colorClass} ${shadowClass}`}></div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-xs text-text-secondary">{timeRange}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
};

const NewTaskModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDuration, setSelectedDuration] = useState('30m');
  const [selectedTimeBlock, setSelectedTimeBlock] = useState('Afternoon');
  const [isReminderEnabled, setIsReminderEnabled] = useState(true);
  const [selectedPriority, setSelectedPriority] = useState('Medium');

  const handleCreateTask = () => {
    console.log('New Task Data:', {
      title,
      notes,
      selectedDuration,
      selectedTimeBlock,
      isReminderEnabled,
      selectedPriority
    });
    // Reset state for next open
    setTitle('');
    setNotes('');
    setSelectedDuration('30m');
    setSelectedTimeBlock('Afternoon');
    setIsReminderEnabled(true);
    setSelectedPriority('Medium');
    // Close modal
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
          <h2 className="text-white font-bold text-lg w-full text-center">New Task</h2>
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
          <button className="w-full bg-[#1e273b] p-4 rounded-[1.5rem] flex items-center justify-between shadow-sm border border-[#232f48]/50 active:scale-[0.98] transition-transform text-left">
            <div className="flex items-center gap-4">
              <div className="w-[42px] h-[42px] rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <Clock size={20} className="fill-current text-primary" />
              </div>
              <div>
                <div className="text-white font-semibold text-[17px]">Today</div>
                <div className="text-text-secondary text-[13px]">Tap to change</div>
              </div>
            </div>
            <div className="bg-[#151c2c] text-white px-4 py-2.5 rounded-[1rem] font-bold tracking-wider text-[15px]">
              14:00
            </div>
          </button>
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
          onClick={handleCreateTask}
          className="w-full bg-primary hover:bg-blue-600 text-white font-semibold py-4 rounded-[1.5rem] flex items-center justify-center gap-2 shadow-[0_8px_25px_rgba(19,91,236,0.4)] active:scale-[0.98] transition-transform"
        >
          <CheckCircle2 size={22} strokeWidth={2.5} />
          <span className="text-[17px]">Create Task</span>
        </button>
      </div>
    </>
  );
};

export default function App() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="bg-background-dark font-display text-slate-100 min-h-screen flex flex-col overflow-hidden relative selection:bg-primary selection:text-white">
      {/* Header Section */}
      <header className="flex-none px-5 pt-6 pb-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-primary">
            <Waves size={28} strokeWidth={2.5} />
            <span className="font-bold text-lg tracking-tight text-white">My Daily Flow</span>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-text-secondary hover:text-white transition-colors">
              <Search size={24} />
            </button>
            <div className="relative">
              <button className="text-text-secondary hover:text-white transition-colors">
                <Bell size={24} />
              </button>
              <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background-dark"></span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center text-center mt-2">
          <p className="text-text-secondary text-sm font-medium uppercase tracking-wider">Oct 24</p>
          <h1 className="text-2xl font-bold mt-1 text-white">Good morning, SolariuS!</h1>
        </div>
      </header>

      {/* Scrollable Content */}
      <main className="flex-1 overflow-y-auto px-5 pb-24 custom-scrollbar">
        <ProgressRing percentage={43} completed={3} total={7} />

        <div className="flex flex-col gap-8">
          <TaskSection title="Morning" timeRange="06:00 - 12:00" colorClass="bg-blue-400" shadowClass="shadow-[0_0_10px_rgba(96,165,250,0.5)]">
            <TaskCard title="Drink water" time="07:00" duration="5min" completed={true} />
            <TaskCard title="Going to work" time="07:30" duration="45min" completed={true} />
          </TaskSection>

          <TaskSection title="Afternoon" timeRange="12:00 - 18:00" colorClass="bg-orange-400" shadowClass="shadow-[0_0_10px_rgba(251,146,60,0.5)]">
            <TaskCard title="Eat lunch" time="12:30" duration="45min" completed={true} />
            <TaskCard title="Gym" time="17:00" duration="60min" active={true} priority={true} />
            <TaskCard title="Grocery shopping" time="18:30" duration="30min" />
          </TaskSection>

          <TaskSection title="Evening" timeRange="18:00 - 23:00" colorClass="bg-indigo-400" shadowClass="shadow-[0_0_10px_rgba(129,140,248,0.5)]">
            <TaskCard title="Call mom" time="20:00" duration="15min" />
            <TaskCard title="Read book" time="21:00" duration="30min" />
            <TaskCard title="Prepare clothes" time="22:00" duration="10min" />
          </TaskSection>
        </div>
      </main>

      {/* Floating Action Button */}
      <button
        onClick={() => setIsModalOpen(true)}
        className="fixed bottom-24 right-5 h-14 w-14 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform z-20"
      >
        <Plus size={32} />
      </button>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full bg-card-dark border-t border-[#232f48] px-4 pb-6 pt-3 z-10">
        <div className="flex justify-between items-end">
          <a className="flex flex-col items-center gap-1 flex-1 text-primary" href="#">
            <div className="bg-primary/10 w-12 h-8 rounded-full flex items-center justify-center">
              <Sun size={24} className="fill-current" />
            </div>
            <span className="text-xs font-semibold">Today</span>
          </a>
          <a className="flex flex-col items-center gap-1 flex-1 text-text-secondary hover:text-white transition-colors group" href="#">
            <List size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">All Tasks</span>
          </a>
          <a className="flex flex-col items-center gap-1 flex-1 text-text-secondary hover:text-white transition-colors group" href="#">
            <Bell size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">Reminders</span>
          </a>
          <a className="flex flex-col items-center gap-1 flex-1 text-text-secondary hover:text-white transition-colors group" href="#">
            <CheckCircle2 size={24} className="group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium">Done</span>
          </a>
        </div>
      </nav>

      <NewTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
