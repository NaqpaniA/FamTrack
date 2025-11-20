
import React, { useState } from 'react';
import { 
  Trophy, 
  Plus, 
  Sparkles, 
  List as ListIcon, 
  Kanban, 
  CreditCard, 
  PiggyBank, 
  Wallet, 
  Share2, 
  Crown,
  Copy,
  ArrowRight,
  TrendingUp,
  CheckSquare,
  Settings,
  Repeat,
  ArrowRightLeft,
  AlertCircle,
  PieChart
} from 'lucide-react';
import { AppData, Task, Tab, TaskStatus, FinancialGoal, User, Account, Transaction } from './types';
import { Card, Avatar, Modal, TaskItem, KanbanCard, TransactionItem } from './components';
import { CATEGORIES } from './constants';
import { formatMoney, isVisible, isOverdue, isToday } from './utils';

// --- Dashboard Screen ---

export const DashboardScreen = ({ 
    data, 
    onTaskClick, 
    onNavigate,
    onAddEpic
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onNavigate: (tab: Tab, epicId?: string) => void,
    onAddEpic: () => void
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

    return (
        <div className="p-4 pb-24 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                 <div>
                    <h1 className="text-2xl font-bold text-gray-900">Привет, {data.currentUser.name}! 👋</h1>
                    <p className="text-gray-500 text-sm">Хорошего дня</p>
                 </div>
                 <Avatar user={data.currentUser} size="lg" />
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 p-3 rounded-2xl flex flex-col justify-between h-24 cursor-pointer" onClick={() => onNavigate('FINANCE')}>
                    <div className="p-1.5 bg-white w-min rounded-lg text-blue-600 shadow-sm">
                        <Wallet size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium">Баланс</div>
                        <div className="text-sm font-bold truncate">{formatMoney(totalBalance).replace(',00 ₽', '')}</div>
                    </div>
                </div>
                <div className="bg-orange-50 p-3 rounded-2xl flex flex-col justify-between h-24 cursor-pointer" onClick={() => onNavigate('TASKS')}>
                    <div className="p-1.5 bg-white w-min rounded-lg text-orange-600 shadow-sm">
                        <CheckSquare size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium">Активные</div>
                        <div className="text-sm font-bold">{activeTasksCount} задач</div>
                    </div>
                </div>
                <div className="bg-yellow-50 p-3 rounded-2xl flex flex-col justify-between h-24 cursor-pointer" onClick={() => onNavigate('FAMILY')}>
                    <div className="p-1.5 bg-white w-min rounded-lg text-yellow-600 shadow-sm">
                        <Trophy size={18} />
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 font-medium">Уровень {data.currentUser.level}</div>
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
                        className="min-w-[60px] h-32 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 shrink-0 active:bg-gray-50"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            </div>

             {/* Today Tasks */}
             <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold">Сегодня</h2>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {visibleTasks.filter(t => t.status !== 'DONE' && (isToday(t.dueDate) || isOverdue(t.dueDate))).length === 0 ? (
                         <div className="p-8 text-center text-gray-400">
                             <Sparkles className="mx-auto mb-2 opacity-50" size={32} />
                             <p className="text-sm">На сегодня задач нет</p>
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
                </div>
            </div>
        </div>
    );
};

// --- Tasks Screen ---

export const TasksScreen = ({ 
    data, 
    onTaskClick, 
    onAddTask,
    onStatusChange,
    activeFilterEpicId
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onAddTask: () => void,
    onStatusChange: (id: string, status: TaskStatus) => void,
    activeFilterEpicId?: string
}) => {
    const [view, setView] = useState<'LIST' | 'KANBAN'>('LIST');
    
    let tasks = data.tasks.filter(t => isVisible(t, data.currentUser.id));
    if (activeFilterEpicId) {
        tasks = tasks.filter(t => t.epicId === activeFilterEpicId);
    }

    const activeEpic = activeFilterEpicId ? data.epics.find(e => e.id === activeFilterEpicId) : null;

    return (
        <div className="p-4 pb-24 min-h-screen flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">{activeEpic ? activeEpic.title : 'Задачи'}</h1>
                    <p className="text-gray-500 text-sm">{tasks.length} всего</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button onClick={() => setView('LIST')} className={`p-2 rounded-lg transition-all ${view === 'LIST' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>
                        <ListIcon size={20} />
                    </button>
                    <button onClick={() => setView('KANBAN')} className={`p-2 rounded-lg transition-all ${view === 'KANBAN' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>
                        <Kanban size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1">
                {view === 'LIST' ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {tasks.length === 0 ? (
                            <div className="p-10 text-center text-gray-400">
                                <p>Нет задач</p>
                            </div>
                        ) : (
                            tasks.sort((a,b) => (b.dueDate ? 1 : 0) - (a.dueDate ? 1 : 0)).map(task => (
                                <div key={task.id} className="px-4">
                                    <TaskItem 
                                        task={task}
                                        assignee={data.members.find(m => m.id === task.assigneeId)}
                                        epic={data.epics.find(e => e.id === task.epicId)}
                                        onClick={onTaskClick}
                                        onStatusChange={(s) => onStatusChange(task.id, s)}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="flex gap-4 overflow-x-auto pb-4 h-full no-scrollbar">
                        {(['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map(status => (
                            <div key={status} className="min-w-[280px] flex-1 bg-gray-50 rounded-2xl p-3">
                                <div className="flex items-center gap-2 mb-3 text-sm font-bold text-gray-500 uppercase tracking-wider">
                                    <div className={`w-2 h-2 rounded-full ${status === 'TODO' ? 'bg-gray-400' : status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                    {status === 'TODO' ? 'Надо сделать' : status === 'IN_PROGRESS' ? 'В процессе' : 'Готово'}
                                </div>
                                <div className="space-y-2">
                                    {tasks.filter(t => t.status === status).map(task => (
                                        <KanbanCard 
                                            key={task.id}
                                            task={task}
                                            assignee={data.members.find(m => m.id === task.assigneeId)}
                                            epic={data.epics.find(e => e.id === task.epicId)}
                                            onClick={() => onTaskClick(task)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button 
                onClick={onAddTask}
                className="fixed bottom-24 right-4 w-14 h-14 bg-black text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform z-40"
            >
                <Plus size={24} />
            </button>
        </div>
    )
}

// --- Finance Screen ---

export const FinanceScreen = ({ 
    data, 
    onAddTransaction,
    onAddAccount,
    onManageBudgets,
    onCreateEpicFromGoal,
    onEditAccount,
    onEditTransaction
}: { 
    data: AppData, 
    onAddTransaction: () => void,
    onAddAccount: () => void,
    onManageBudgets: () => void,
    onCreateEpicFromGoal: (g: FinancialGoal) => void,
    onEditAccount: (a: Account) => void,
    onEditTransaction: (t: Transaction) => void
}) => {
    const visibleAccounts = data.accounts.filter(a => isVisible(a, data.currentUser.id));
    const visibleTransactions = data.transactions.filter(t => visibleAccounts.some(a => a.id === t.accountId));

    // Calculate Budgets
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const budgetStats = data.budgets.map(budget => {
        const spent = visibleTransactions
            .filter(t => t.type === 'EXPENSE' && t.categoryId === budget.categoryId && t.date.startsWith(currentMonth))
            .reduce((sum, t) => sum + t.amount, 0);
        return { ...budget, spent };
    });

    return (
        <div className="p-4 pb-24 space-y-8">
            {/* Accounts */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold">Счета</h2>
                    <button onClick={onAddAccount} className="text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded-lg">
                        <Plus size={16} />
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    {visibleAccounts.map(acc => {
                         const goal = data.goals.find(g => g.accountId === acc.id);
                         return (
                             <div 
                                key={acc.id} 
                                onClick={() => onEditAccount(acc)}
                                className="bg-gray-900 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden active:scale-[0.98] transition-transform cursor-pointer"
                             >
                                 <div className="absolute top-0 right-0 p-24 bg-white/5 rounded-full -mr-10 -mt-10 pointer-events-none" />
                                 <div className="relative z-10">
                                     <div className="flex justify-between items-start mb-4">
                                         <div>
                                             <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">{acc.type === 'CARD' ? 'Карта' : acc.type === 'CASH' ? 'Наличные' : 'Копилка'}</p>
                                             <p className="font-bold text-lg">{acc.name}</p>
                                         </div>
                                         <div className="bg-white/10 p-2 rounded-xl">
                                            {acc.type === 'CARD' ? <CreditCard size={20} /> : acc.type === 'CASH' ? <Wallet size={20} /> : <PiggyBank size={20} />}
                                         </div>
                                     </div>
                                     <div className="text-2xl font-mono tracking-tight">{formatMoney(acc.balance)}</div>
                                     
                                     {goal && (
                                         <div className="mt-4 pt-4 border-t border-white/10">
                                             <div className="flex justify-between text-xs mb-1 text-gray-300">
                                                 <span>Цель: {goal.title}</span>
                                                 <span>{Math.round((goal.currentAmount / goal.targetAmount) * 100)}%</span>
                                             </div>
                                             <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                                                 <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)}%` }} />
                                             </div>
                                             {!goal.epicId && (
                                                 <button 
                                                    onClick={(e) => { e.stopPropagation(); onCreateEpicFromGoal(goal); }}
                                                    className="text-[10px] bg-white/20 px-2 py-1 rounded hover:bg-white/30 transition-colors"
                                                 >
                                                     Создать проект из цели
                                                 </button>
                                             )}
                                         </div>
                                     )}
                                 </div>
                             </div>
                         )
                    })}
                </div>
            </div>

            {/* Budgets */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold flex items-center gap-2"><PieChart size={18} /> Бюджет (мес)</h2>
                    <button onClick={onManageBudgets} className="text-gray-400 hover:text-gray-600">
                        <Settings size={18} />
                    </button>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">
                    {budgetStats.length === 0 ? (
                         <div className="text-center text-gray-400 text-sm py-2">Бюджеты не настроены</div>
                    ) : (
                        budgetStats.map(b => {
                            const cat = CATEGORIES[b.categoryId];
                            const percent = Math.min((b.spent / b.limit) * 100, 100);
                            const isOver = b.spent > b.limit;
                            
                            return (
                                <div key={b.categoryId}>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${cat.color}`}>{cat.icon}</div>
                                            <span className="text-sm font-medium">{cat.label}</span>
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            <span className={isOver ? 'text-red-500 font-bold' : 'text-gray-900'}>{formatMoney(b.spent)}</span>
                                            {' / '}
                                            {formatMoney(b.limit)}
                                        </div>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div className={`h-full rounded-full ${isOver ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${percent}%` }} />
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>

            {/* Transactions */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold">История</h2>
                </div>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    {visibleTransactions.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm">Нет операций</div>
                    ) : (
                        visibleTransactions.slice(0, 10).map(tx => (
                            <div key={tx.id} onClick={() => onEditTransaction(tx)} className="px-4 cursor-pointer hover:bg-gray-50 transition-colors">
                                <TransactionItem 
                                    transaction={tx} 
                                    user={data.members.find(m => m.id === tx.createdById)}
                                />
                            </div>
                        ))
                    )}
                    <div className="p-3 text-center border-t border-gray-50">
                        <button className="text-xs text-gray-400 font-medium uppercase tracking-wide">Показать все</button>
                    </div>
                </div>
            </div>

            <button 
                onClick={onAddTransaction}
                className="fixed bottom-24 right-4 w-14 h-14 bg-black text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform z-40"
            >
                <Plus size={24} />
            </button>
        </div>
    );
};

// --- Family Screen ---

export const FamilyScreen = ({ data, onUpdateUser }: { data: AppData, onUpdateUser: (u: User) => void }) => {
    return (
        <div className="p-4 pb-24 space-y-6">
             <div className="flex items-center justify-between">
                 <h1 className="text-2xl font-bold">Семья</h1>
                 <div className="bg-gray-100 px-3 py-1 rounded-full text-xs font-bold text-gray-500">
                     {data.members.length} чел.
                 </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {data.members.map(user => (
                    <div key={user.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden">
                        {user.role === 'OWNER' && <Crown size={16} className="absolute top-3 right-3 text-yellow-500" />}
                        <div className="mb-3 relative">
                            <Avatar user={user} size="xl" />
                            <div className="absolute -bottom-1 -right-1 bg-black text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                Lvl {user.level}
                            </div>
                        </div>
                        <div className="font-bold text-lg mb-1">{user.name}</div>
                        <div className="text-xs text-gray-400 mb-3 capitalize">{user.role.toLowerCase()}</div>
                        
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-1">
                            <div className="bg-yellow-400 h-full rounded-full" style={{ width: `${(user.xp % 1000) / 10}%` }} />
                        </div>
                        <div className="text-[10px] text-gray-400 font-medium">{user.xp} XP</div>
                    </div>
                ))}
            </div>
            
            {/* Rewards / Shop Teaser */}
            <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl p-6 text-white">
                 <div className="flex items-center gap-3 mb-2">
                     <Sparkles size={24} className="text-yellow-300" />
                     <h3 className="text-lg font-bold">Магазин Наград</h3>
                 </div>
                 <p className="text-white/80 text-sm mb-4">Обменивайте заработанный XP на реальные награды!</p>
                 <button className="bg-white text-purple-600 px-4 py-2 rounded-xl text-sm font-bold shadow-lg active:scale-95 transition-transform">
                     Скоро...
                 </button>
            </div>
        </div>
    )
};
