
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
import { NotesWidget } from './notes.ui';
import type { DashboardPreferences } from './types';
import type { RoutineTemplate } from './routines.model';
import type { Wishlist, WishlistItem } from './wishlist.model';

const HouseholdDashboard = React.lazy(() => import('./household.ui').then(module => ({
    default: module.HouseholdDashboard
})));

const EPIC_COLOR_CLASSES: Record<string, string> = {
    'bg-blue-500': 'bg-blue-500',
    'bg-red-500': 'bg-red-500',
    'bg-green-500': 'bg-green-500',
    'bg-yellow-500': 'bg-yellow-500',
    'bg-purple-500': 'bg-purple-500',
    'bg-pink-500': 'bg-pink-500',
    'bg-orange-500': 'bg-orange-500',
    'bg-indigo-500': 'bg-indigo-500',
    'bg-teal-500': 'bg-teal-500'
};

const getEpicColorClass = (color: string) => EPIC_COLOR_CLASSES[color] || EPIC_COLOR_CLASSES['bg-blue-500'];

const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Только что';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} м. назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч. назад`;
    return 'Давно';
};

const ProjectsWidget = ({
    data,
    visibleTasks,
    onNavigate,
    onAddEpic
}: {
    data: AppData;
    visibleTasks: Task[];
    onNavigate: (tab: Tab, epicId?: string) => void;
    onAddEpic: () => void;
}) => {
    const visibleEpics = data.epics.filter(epic => isVisible(epic, data.currentUser));
    const canManageEpics = data.currentUser.role === 'OWNER' || data.currentUser.role === 'ADMIN';
    return (
        <div>
            <SectionHeader
                title="Проекты & Цели"
                action={<button type="button" onClick={() => onNavigate('TASKS')} className="text-sm font-medium text-blue-600">Все</button>}
            />
            <div className="no-scrollbar flex snap-x-app gap-3 overflow-x-auto pb-1 pt-3">
                {visibleEpics.map(epic => {
                    const epicTasks = visibleTasks.filter(task => task.epicId === epic.id);
                    const total = epicTasks.length;
                    const done = epicTasks.filter(task => task.status === 'DONE').length;
                    const progress = total > 0 ? done / total * 100 : 0;
                    const epicColorClass = getEpicColorClass(epic.color);
                    return (
                        <button
                            type="button"
                            key={epic.id}
                            onClick={() => onNavigate('TASKS', epic.id)}
                            className={`relative h-28 min-w-[148px] snap-start overflow-hidden rounded-[14px] p-3 text-left text-white shadow-md transition-transform active:scale-95 ${epicColorClass}`}
                        >
                            <div className={`absolute inset-0 opacity-90 ${epicColorClass}`} />
                            <div className="absolute right-0 top-0 -mr-4 -mt-4 rounded-full bg-white/10 p-8 blur-xl" />
                            <div className="relative z-10 flex h-full flex-col justify-between">
                                <div className="line-clamp-2 text-[16px] font-bold leading-tight">{epic.title}</div>
                                <div>
                                    <div className="mb-1 flex justify-between text-xs opacity-80"><span>Прогресс</span><span>{Math.round(progress)}%</span></div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-black/20"><div className="h-full rounded-full bg-white/90 transition-all duration-500" style={{ width: `${progress}%` }} /></div>
                                </div>
                            </div>
                        </button>
                    );
                })}
                {canManageEpics ? (
                    <button
                        type="button"
                        onClick={onAddEpic}
                        aria-label="Создать проект"
                        className="flex h-28 min-w-[48px] shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-gray-300 text-gray-400 transition-colors active:bg-gray-50"
                    >
                        <Plus size={24} />
                    </button>
                ) : null}
            </div>
        </div>
    );
};

const ActivityWidget = ({ data }: { data: AppData }) => {
    const recentEvents = (data.events || []).slice(0, 5);
    return (
        <div>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[17px] font-bold"><Activity size={18} /> Активность</h2>
            </div>
            <div className="space-y-3">
                {recentEvents.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-400">Пока тишина...</div>
                ) : recentEvents.map(event => {
                    const actor = data.members.find(member => member.id === event.actorId);
                    const config = EVENT_CONFIG[event.type];
                    if (!actor || !config) return null;
                    return (
                        <div key={event.id} className="app-panel flex gap-3 p-3 animate-in slide-in-from-bottom-2">
                            <div className="relative">
                                <Avatar user={actor} size="md" />
                                <div className={`absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white ${config.color}`}><config.icon size={10} /></div>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="mb-0.5 flex justify-between gap-2 text-xs text-gray-400"><span className="truncate">{actor.name}</span><span className="shrink-0">{formatTimeAgo(event.timestamp)}</span></div>
                                <div className="text-sm font-medium leading-tight text-gray-900">{config.format(event.payload)}</div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const DashboardScreen = ({ 
    data, 
    onTaskClick, 
    onTaskStatusChange,
    onNavigate,
    onAddEpic,
    onOpenProfile,
    onOpenNotes,
    onAddNote,
    householdActions
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onTaskStatusChange: (id: string, status: Task['status']) => void,
    onNavigate: (tab: Tab, epicId?: string) => void,
    onAddEpic: () => void,
    onOpenProfile: () => void,
    onOpenNotes: () => void,
    onAddNote: () => void,
    householdActions: {
        saveRoutine: (routine: Partial<RoutineTemplate> & { presetId?: string }) => void;
        pauseRoutine: (routineId: string, paused: boolean) => void;
        completeRoutine: (routineId: string, taskId?: string, units?: number) => void;
        recordRoutineUnit: (routineId: string, units?: number) => void;
        skipRoutine: (routineId: string) => void;
        savePreferences: (preferences: Partial<DashboardPreferences>) => void;
        saveWishlist: (wishlist: Partial<Wishlist>) => void;
        saveWishlistItem: (item: Partial<WishlistItem> & { wishlistId: string }) => void;
        deleteWishlistItem: (wishlistId: string, itemId: string) => void;
        reserveWishlistItem: (wishlistId: string, itemId: string, reserved: boolean) => void;
    }
}) => {
    const visibleTasks = data.tasks.filter(t => isVisible(t, data.currentUser));
    const visibleAccounts = data.accounts.filter(a => isVisible(a, data.currentUser));

    // Active Tasks: Not done AND (Overdue OR Today OR No Date)
    const activeTasksCount = visibleTasks.filter(t => {
        if (t.status === 'DONE') return false;
        if (!t.dueDate) return true;
        return isOverdue(t.dueDate) || isToday(t.dueDate);
    }).length;

    const totalBalance = visibleAccounts.reduce((sum, acc) => sum + acc.balance, 0);
    const streak = data.currentUser.streak || 0;
    const householdEnabled = data.capabilities?.routines === true;
    const notesWidget = <NotesWidget data={data} onOpenAll={onOpenNotes} onCreate={onAddNote} />;
    const projectsWidget = <ProjectsWidget data={data} visibleTasks={visibleTasks} onNavigate={onNavigate} onAddEpic={onAddEpic} />;
    const activityWidget = <ActivityWidget data={data} />;

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
                <button type="button" className="bg-blue-50 p-3 rounded-[14px] border border-blue-100/70 flex flex-col text-left justify-between h-24 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('FINANCE')}>
                    <div className="p-1.5 bg-white w-min rounded-[10px] text-blue-600 shadow-sm">
                        <Wallet size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">Баланс</div>
                        <div className="text-[13px] font-bold truncate">{formatMoney(totalBalance).replace(',00 ₽', '')}</div>
                    </div>
                </button>
                <button type="button" className="bg-orange-50 p-3 rounded-[14px] border border-orange-100/70 flex flex-col text-left justify-between h-24 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('TASKS')}>
                    <div className="p-1.5 bg-white w-min rounded-[10px] text-orange-600 shadow-sm">
                        <CheckSquare size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">К Делу</div>
                        <div className="text-[13px] font-bold">{activeTasksCount} задач</div>
                    </div>
                </button>
                <button type="button" className="bg-yellow-50 p-3 rounded-[14px] border border-yellow-100/70 flex flex-col text-left justify-between h-24 cursor-pointer active:scale-95 transition-transform" onClick={() => onNavigate('FAMILY')}>
                    <div className="p-1.5 bg-white w-min rounded-[10px] text-yellow-600 shadow-sm">
                        <Trophy size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wide mb-0.5">Уровень {data.currentUser.level}</div>
                        <div className="text-[13px] font-bold">{data.currentUser.xp} XP</div>
                    </div>
                </button>
            </div>

            {householdEnabled ? (
                <React.Suspense fallback={<div className="h-32 animate-pulse rounded-[20px] bg-black/5" aria-label="Загружаю Household Pulse" />}>
                    <HouseholdDashboard
                        data={data}
                        actions={householdActions}
                        externalWidgets={{ notes: notesWidget, projects: projectsWidget, activity: activityWidget }}
                    />
                </React.Suspense>
            ) : null}

            {!householdEnabled ? notesWidget : null}

            {!householdEnabled ? projectsWidget : null}

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
                                      onStatusChange={(status) => onTaskStatusChange(task.id, status)}
                                   />
                               </div>
                           ))
                    )}
                    <div className="p-2.5 text-center border-t border-gray-50">
                         <button onClick={() => onNavigate('TASKS')} className="text-xs text-gray-400 font-bold uppercase tracking-wider">Посмотреть все задачи</button>
                    </div>
                </Panel>
            </div>

            {!householdEnabled ? activityWidget : null}
        </Screen>
    );
};
