
import React from 'react';
import { 
  Trophy, 
  Plus, 
  Sparkles, 
  Wallet, 
  CheckSquare,
  Flame
} from 'lucide-react';
import { AppData, Task, Tab } from './types';
import { TaskItem } from './tasks.ui';
import { Avatar } from './ui-kit';
import { formatMoney, isVisible } from './utils';
import { isOverdue, isToday } from './tasks.model';

export const DashboardScreen = ({ 
    data, 
    onTaskClick, 
    onNavigate,
    onAddEpic,
    onOpenProfile
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onNavigate: (tab: Tab, epicId?: string) => void,
    onAddEpic: () => void,
    onOpenProfile: () => void
}) => {
    const visibleTasks = data.tasks.filter(t => isVisible(t, data.currentUser.id));
    const visibleEpics = data.epics.filter(e => isVisible(e, data.currentUser.id));
    const visibleAccounts = data.accounts.filter(a => isVisible(a, data.currentUser.id));

    // Active Tasks: Not done AND (Overdue OR Today OR No Date)
    const activeTasksCount = visibleTasks.filter(t => {
        if (t.status === 'DONE') return false;
        if (!t.dueDate) return true;
        return isOverdue(t.dueDate) || isToday(t.dueDate);
    }).length;

    const totalBalance = visibleAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const streak = data.currentUser.streak || 0;

    return (
        <div className="p-4 pb-24 space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center justify-between">
                 <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        Привет, {data.currentUser.name}! 
                        {streak > 0 && (
                             <div className="flex items-center gap-0.5 bg-orange-50 text-orange-600 px-2 py-1 rounded-full text-xs font-bold border border-orange-100">
                                 <Flame size={12} fill="currentColor" /> {streak}
                             </div>
                        )}
                    </h1>
                    <p className="text-gray-500 text-sm">Вот что у нас происходит</p>
                 </div>
                 <Avatar user={data.currentUser} size="lg" onClick={onOpenProfile} />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 p-3 rounded-2xl flex flex-col justify-between h-28 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('FINANCE')}>
                    <div className="p-2 bg-white w-min rounded-xl text-blue-600 shadow-sm">
                        <Wallet size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">Баланс</div>
                        <div className="text-sm font-bold truncate">{formatMoney(totalBalance).replace(',00 ₽', '')}</div>
                    </div>
                </div>
                <div className="bg-orange-50 p-3 rounded-2xl flex flex-col justify-between h-28 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('TASKS')}>
                    <div className="p-2 bg-white w-min rounded-xl text-orange-600 shadow-sm">
                        <CheckSquare size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">К Делу</div>
                        <div className="text-sm font-bold">{activeTasksCount} задач</div>
                    </div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-2xl flex flex-col justify-between h-28 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('FAMILY')}>
                    <div className="p-2 bg-white w-min rounded-xl text-yellow-600 shadow-sm">
                        <Trophy size={20} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">Уровень {data.currentUser.level}</div>
                        <div className="text-sm font-bold">{data.currentUser.xp} XP</div>
                    </div>
                </div>
            </div>

            {/* Epics / Projects Scroll */}
            <div>
                <div className="flex items-center justify-between mb-3">
                   <h2 className="text-lg font-bold">Проекты & Цели</h2>
                   <button onClick={() => onNavigate('TASKS')} className="text-blue-600 text-sm font-medium">Все</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
                    {visibleEpics.map(epic => {
                         const epicTasks = visibleTasks.filter(t => t.epicId === epic.id);
                         const total = epicTasks.length;
                         const done = epicTasks.filter(t => t.status === 'DONE').length;
                         const progress = total > 0 ? (done / total) * 100 : 0;

                         return (
                             <div 
                                key={epic.id} 
                                onClick={() => onNavigate('TASKS', epic.id)}
                                className="min-w-[160px] h-32 p-4 rounded-2xl text-white relative overflow-hidden shadow-lg transform transition-transform active:scale-95 cursor-pointer"
                                style={{ backgroundColor: epic.color.replace('bg-', '').replace('text-', '') }} 
                             >
                                 <div className={`absolute inset-0 ${epic.color} opacity-90`} />
                                 <div className="absolute top-0 right-0 p-8 bg-white/10 rounded-full -mr-4 -mt-4 blur-xl"></div>
                                 <div className="relative z-10 flex flex-col h-full justify-between">
                                     <div className="font-bold text-lg leading-tight line-clamp-2">{epic.title}</div>
                                     <div>
                                         <div className="flex justify-between text-xs mb-1 opacity-80">
                                            <span>Прогресс</span>
                                            <span>{Math.round(progress)}%</span>
                                         </div>
                                         <div className="h-1.5 bg-black/20 rounded-full overflow-hidden">
                                            <div className="h-full bg-white/90 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                                         </div>
                                     </div>
                                 </div>
                             </div>
                         )
                    })}
                    <button 
                        onClick={onAddEpic}
                        className="min-w-[60px] h-32 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 shrink-0 active:bg-gray-50 transition-colors"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            </div>

             {/* Today Tasks */}
             <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold">На повестке</h2>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {visibleTasks.filter(t => t.status !== 'DONE' && (isToday(t.dueDate) || isOverdue(t.dueDate))).length === 0 ? (
                         <div className="p-8 text-center text-gray-400">
                             <Sparkles className="mx-auto mb-2 opacity-50" size={32} />
                             <p className="text-sm">На сегодня задач нет. Отдыхаем!</p>
                         </div>
                    ) : (
                        visibleTasks
                           .filter(t => t.status !== 'DONE' && (isToday(t.dueDate) || isOverdue(t.dueDate)))
                           .map(task => (
                               <div key={task.id} className="px-4">
                                   <TaskItem 
                                      task={task} 
                                      assignee={data.members.find(m => m.id === task.assigneeId)}
                                      epic={data.epics.find(e => e.id === task.epicId)}
                                      onClick={onTaskClick}
                                   />
                               </div>
                           ))
                    )}
                    <div className="p-3 text-center border-t border-gray-50">
                         <button onClick={() => onNavigate('TASKS')} className="text-xs text-gray-400 font-bold uppercase tracking-wider">Посмотреть все задачи</button>
                    </div>
                </div>
            </div>
        </div>
    );
};
