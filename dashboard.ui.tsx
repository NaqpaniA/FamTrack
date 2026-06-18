
import React from 'react';
import { 
  Trophy, 
  Plus, 
  Sparkles, 
  Wallet, 
  CheckSquare,
  Flame,
  Activity
} from 'lucide-react';
import { AppData, Task, Tab } from './types';
import { TaskItem } from './tasks.ui';
import { Avatar, Panel, Screen, SectionHeader } from './ui-kit';
import { formatMoney, isVisible } from './utils';
import { isOverdue, isToday } from './tasks.model';
import { EVENT_CONFIG } from './events.model';

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
    const visibleTasks = data.tasks.filter(t => isVisible(t, data.currentUser));
    const visibleEpics = data.epics.filter(e => isVisible(e, data.currentUser));
    const visibleAccounts = data.accounts.filter(a => isVisible(a, data.currentUser));
    const recentEvents = (data.events || []).slice(0, 5);

    // Active Tasks: Not done AND (Overdue OR Today OR No Date)
    const activeTasksCount = visibleTasks.filter(t => {
        if (t.status === 'DONE') return false;
        if (!t.dueDate) return true;
        return isOverdue(t.dueDate) || isToday(t.dueDate);
    }).length;

    const totalBalance = visibleAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const streak = data.currentUser.streak || 0;

    const formatTimeAgo = (timestamp: number) => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Только что';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} м. назад`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} ч. назад`;
        return 'Давно';
    };

    return (
        <Screen className="animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex items-center justify-between">
                 <div>
                    <h1 className="text-[24px] leading-tight font-bold text-gray-950 flex items-center gap-2">
                        Привет, {data.currentUser.name}! 
                        {streak > 0 && (
                             <div className="flex items-center gap-0.5 bg-orange-50 text-orange-600 px-2 py-1 rounded-full text-xs font-bold border border-orange-100">
                                 <Flame size={12} fill="currentColor" /> {streak}
                             </div>
                        )}
                    </h1>
                    <p className="text-gray-500 text-[13px]">Вот что у нас происходит</p>
                 </div>
                 <Avatar user={data.currentUser} size="lg" onClick={onOpenProfile} />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-blue-50 p-3 rounded-[14px] border border-blue-100/70 flex flex-col justify-between h-24 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('FINANCE')}>
                    <div className="p-1.5 bg-white w-min rounded-[10px] text-blue-600 shadow-sm">
                        <Wallet size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">Баланс</div>
                        <div className="text-[13px] font-bold truncate">{formatMoney(totalBalance).replace(',00 ₽', '')}</div>
                    </div>
                </div>
                <div className="bg-orange-50 p-3 rounded-[14px] border border-orange-100/70 flex flex-col justify-between h-24 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('TASKS')}>
                    <div className="p-1.5 bg-white w-min rounded-[10px] text-orange-600 shadow-sm">
                        <CheckSquare size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">К Делу</div>
                        <div className="text-[13px] font-bold">{activeTasksCount} задач</div>
                    </div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-[14px] border border-yellow-100/70 flex flex-col justify-between h-24 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('FAMILY')}>
                    <div className="p-1.5 bg-white w-min rounded-[10px] text-yellow-600 shadow-sm">
                        <Trophy size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">Уровень {data.currentUser.level}</div>
                        <div className="text-[13px] font-bold">{data.currentUser.xp} XP</div>
                    </div>
                </div>
            </div>

            {/* Epics / Projects Scroll */}
            <div>
                <SectionHeader
                    title="Проекты & Цели"
                    action={<button onClick={() => onNavigate('TASKS')} className="text-blue-600 text-sm font-medium">Все</button>}
                />
                <div className="flex gap-3 overflow-x-auto pt-3 pb-1 no-scrollbar snap-x-app">
                    {visibleEpics.map(epic => {
                         const epicTasks = visibleTasks.filter(t => t.epicId === epic.id);
                         const total = epicTasks.length;
                         const done = epicTasks.filter(t => t.status === 'DONE').length;
                         const progress = total > 0 ? (done / total) * 100 : 0;

                         return (
                             <div 
                                key={epic.id} 
                                onClick={() => onNavigate('TASKS', epic.id)}
                                className="min-w-[148px] h-28 p-3 rounded-[14px] text-white relative overflow-hidden shadow-md transform transition-transform active:scale-95 cursor-pointer snap-start"
                                style={{ backgroundColor: epic.color.replace('bg-', '').replace('text-', '') }} 
                             >
                                 <div className={`absolute inset-0 ${epic.color} opacity-90`} />
                                 <div className="absolute top-0 right-0 p-8 bg-white/10 rounded-full -mr-4 -mt-4 blur-xl"></div>
                                 <div className="relative z-10 flex flex-col h-full justify-between">
                                     <div className="font-bold text-[16px] leading-tight line-clamp-2">{epic.title}</div>
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
                        className="min-w-[48px] h-28 rounded-[14px] border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 shrink-0 active:bg-gray-50 transition-colors snap-start"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            </div>

             {/* Today Tasks */}
             <div>
                <SectionHeader title="На повестке" />
                <Panel className="mt-3 overflow-hidden">
                    {visibleTasks.filter(t => t.status !== 'DONE' && (isToday(t.dueDate) || isOverdue(t.dueDate))).length === 0 ? (
                         <div className="p-6 text-center text-gray-400">
                             <Sparkles className="mx-auto mb-2 opacity-50" size={28} />
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
                    <div className="p-2.5 text-center border-t border-gray-50">
                         <button onClick={() => onNavigate('TASKS')} className="text-xs text-gray-400 font-bold uppercase tracking-wider">Посмотреть все задачи</button>
                    </div>
                </Panel>
            </div>

            {/* Activity Feed */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-[17px] font-bold flex items-center gap-2"><Activity size={18} /> Активность</h2>
                </div>
                <div className="space-y-3">
                    {recentEvents.length === 0 ? (
                        <div className="text-center p-4 bg-gray-50 rounded-[14px] text-gray-400 text-sm border border-dashed border-gray-200">
                            Пока тишина...
                        </div>
                    ) : (
                        recentEvents.map(event => {
                            const actor = data.members.find(m => m.id === event.actorId);
                            const config = EVENT_CONFIG[event.type];
                            if (!actor || !config) return null;

                            return (
                                <div key={event.id} className="flex gap-3 app-panel p-3 animate-in slide-in-from-bottom-2">
                                    <div className="relative">
                                        <Avatar user={actor} size="md" />
                                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${config.color} border-2 border-white`}>
                                            <config.icon size={10} />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <div className="text-xs text-gray-400 mb-0.5 flex justify-between">
                                            <span>{actor.name}</span>
                                            <span>{formatTimeAgo(event.timestamp)}</span>
                                        </div>
                                        <div className="text-sm font-medium text-gray-900 leading-tight">
                                            {config.format(event.payload)}
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </Screen>
    );
};
