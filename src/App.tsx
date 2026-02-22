import { Waves, Search, Bell, Check, Clock, Pencil, Plus, Sun, List, CheckCircle2 } from 'lucide-react';
import React from 'react';

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
    <div className={`group flex items-center p-4 bg-card-dark rounded-xl transition-all duration-300 relative overflow-hidden ${
      active ? 'border-l-4 border-l-primary border-y border-r border-y-[#232f48] border-r-[#232f48] shadow-lg hover:shadow-primary/10' : 'border border-[#232f48] hover:border-primary/50'
    }`}>
      {active && <div className="absolute inset-0 bg-primary/5 pointer-events-none"></div>}
      
      <button className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mr-4 transition-colors ${
        completed ? 'bg-primary text-white' : active ? 'border-2 border-primary hover:bg-primary/20' : 'border-2 border-text-secondary hover:border-primary'
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

export default function App() {
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
      <button className="fixed bottom-24 right-5 h-14 w-14 bg-primary text-white rounded-full shadow-lg shadow-primary/30 flex items-center justify-center hover:scale-105 transition-transform z-20">
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
    </div>
  );
}
