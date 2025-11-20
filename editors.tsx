
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Flag, 
  Bell, 
  AlignLeft, 
  ListPlus, 
  CheckCircle2, 
  Circle, 
  Trash2, 
  Plus,
  AlertTriangle,
  Repeat,
  Send,
  Calendar
} from 'lucide-react';
import { Epic, Priority, Account, FinancialGoal, BudgetPlan, Transaction, Task, SubTask, User, TaskStatus } from './types';
import { PRIORITIES, CATEGORIES } from './constants';
import { Avatar, VisibilitySelector } from './ui-kit';
import { formatMoney } from './utils';

// --- Task Editor ---

export const TaskEditor = ({ task, onSave, onDelete, members, epics, currentUser }: { task: Task | null, onSave: (t: Task) => void, onDelete: (id: string) => void, members: User[], epics: Epic[], currentUser: User }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'MEDIUM');
  const [points, setPoints] = useState(task?.points || 50);
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || currentUser.id);
  const [epicId, setEpicId] = useState(task?.epicId || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring || false);
  const [frequency, setFrequency] = useState(task?.frequency || 'WEEKLY');
  const [subtasks, setSubtasks] = useState<SubTask[]>(task?.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [visibleTo, setVisibleTo] = useState<string[]>(task?.visibleTo || []);

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: Math.random().toString(), title: newSubtask, isCompleted: false }]);
    setNewSubtask('');
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: task?.id || Math.random().toString(36).substr(2, 9),
      title,
      description,
      priority,
      points,
      assigneeId,
      createdById: task?.createdById || currentUser.id,
      epicId: epicId || undefined,
      status: task?.status || 'TODO',
      subtasks,
      createdAt: task?.createdAt || Date.now(),
      dueDate,
      isRecurring,
      frequency: isRecurring ? frequency : undefined,
      visibleTo
    });
  };

  return (
    <div className="space-y-4 pb-20">
      <input 
        className="w-full text-xl font-bold placeholder-gray-300 outline-none border-none bg-transparent" 
        placeholder="Что нужно сделать?" 
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {Object.entries(PRIORITIES).map(([key, val]) => (
              <button 
                key={key}
                onClick={() => setPriority(key as Priority)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border ${priority === key ? val.color + ' border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                  <Flag size={12} className={priority === key ? 'fill-current' : ''} /> {val.label}
              </button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">
             <span className="text-xs font-bold">XP</span>
             <input 
                type="number" 
                value={points} 
                onChange={e => setPoints(Number(e.target.value))} 
                className="w-10 bg-transparent text-center font-bold outline-none text-xs" 
             />
          </div>
      </div>

      <div className="space-y-3">
           <div>
              <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Исполнитель</label>
              <div className="flex gap-2">
                  {members.map(m => (
                      <Avatar 
                        key={m.id} 
                        user={m} 
                        selected={assigneeId === m.id} 
                        onClick={() => setAssigneeId(m.id)} 
                      />
                  ))}
              </div>
           </div>

           <div className="grid grid-cols-2 gap-3">
               <div>
                   <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Срок</label>
                   <div className="relative">
                       <input 
                            type="date" 
                            value={dueDate} 
                            onChange={e => setDueDate(e.target.value)}
                            className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200" 
                       />
                   </div>
               </div>
               <div>
                   <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Проект</label>
                   <select 
                        value={epicId} 
                        onChange={e => setEpicId(e.target.value)}
                        className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200"
                    >
                       <option value="">Без проекта</option>
                       {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                   </select>
               </div>
           </div>

           <div className="bg-gray-50 p-3 rounded-xl flex items-center justify-between">
               <div className="flex items-center gap-2">
                   <Repeat size={16} className={isRecurring ? "text-blue-500" : "text-gray-400"} />
                   <span className="text-sm font-medium text-gray-700">Повторять</span>
               </div>
               <div className="flex items-center gap-2">
                   {isRecurring && (
                       <select 
                            value={frequency} 
                            onChange={e => setFrequency(e.target.value as any)}
                            className="bg-white border border-gray-200 text-xs rounded px-2 py-1 outline-none"
                        >
                           <option value="DAILY">Каждый день</option>
                           <option value="WEEKLY">Раз в неделю</option>
                           <option value="MONTHLY">Раз в месяц</option>
                       </select>
                   )}
                   <button 
                        onClick={() => setIsRecurring(!isRecurring)} 
                        className={`w-10 h-5 rounded-full relative transition-colors ${isRecurring ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                       <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isRecurring ? 'translate-x-5' : ''}`} />
                   </button>
               </div>
           </div>

           <div>
              <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Описание</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Добавить детали..."
                className="w-full bg-gray-50 rounded-lg p-3 text-sm outline-none min-h-[80px] border border-gray-100 focus:border-blue-200"
              />
           </div>

           <div>
               <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Подзадачи</label>
               <div className="space-y-2 mb-2">
                   {subtasks.map((st, idx) => (
                       <div key={st.id} className="flex items-center gap-2 group">
                           <button 
                                onClick={() => {
                                    const newSt = [...subtasks];
                                    newSt[idx].isCompleted = !newSt[idx].isCompleted;
                                    setSubtasks(newSt);
                                }}
                                className={st.isCompleted ? 'text-green-500' : 'text-gray-300'}
                            >
                               {st.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                           </button>
                           <input 
                                value={st.title} 
                                onChange={e => {
                                    const newSt = [...subtasks];
                                    newSt[idx].title = e.target.value;
                                    setSubtasks(newSt);
                                }}
                                className={`flex-1 bg-transparent outline-none text-sm ${st.isCompleted ? 'line-through text-gray-400' : ''}`} 
                           />
                           <button onClick={() => setSubtasks(subtasks.filter((_, i) => i !== idx))} className="text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-400">
                               <XIcon size={14} />
                           </button>
                       </div>
                   ))}
               </div>
               <div className="flex items-center gap-2 text-gray-400">
                   <Plus size={18} />
                   <input 
                        value={newSubtask}
                        onChange={e => setNewSubtask(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                        placeholder="Добавить пункт..."
                        className="bg-transparent outline-none text-sm flex-1"
                   />
               </div>
           </div>

           <VisibilitySelector members={members} selectedIds={visibleTo} onChange={setVisibleTo} />
      </div>
      
      <div className="pt-4 flex gap-3">
          {task && (
              <button onClick={() => onDelete(task.id)} className="p-3 rounded-xl bg-red-50 text-red-500">
                  <Trash2 size={20} />
              </button>
          )}
          <button onClick={handleSave} className="flex-1 bg-black text-white rounded-xl py-3 font-bold shadow-lg active:scale-95 transition-transform">
              Сохранить
          </button>
      </div>
    </div>
  );
};

// --- Transaction Editor ---

export const TransactionEditor = ({ onSave, accounts, goals, transaction }: { onSave: (data: any) => void, accounts: Account[], goals: FinancialGoal[], transaction?: Transaction | null }) => {
    const [amount, setAmount] = useState(transaction ? (transaction.amount / 100).toString() : '');
    const [title, setTitle] = useState(transaction?.title || '');
    const [type, setType] = useState<'INCOME' | 'EXPENSE'>(transaction?.type === 'INCOME' ? 'INCOME' : 'EXPENSE');
    const [categoryId, setCategoryId] = useState(transaction?.categoryId || 'food');
    const [accountId, setAccountId] = useState(transaction?.accountId || accounts[0]?.id || '');
    const [deviationReason, setDeviationReason] = useState(transaction?.deviationReason || '');

    const handleSubmit = () => {
        if (!amount || !accountId) return;
        onSave({
            id: transaction?.id,
            amount: Number(amount) * 100, // to cents
            title,
            type,
            categoryId,
            accountId,
            deviationReason: deviationReason || undefined
        });
    };

    return (
        <div className="space-y-5">
            <div className="flex bg-gray-100 p-1 rounded-xl">
                <button onClick={() => setType('EXPENSE')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${type === 'EXPENSE' ? 'bg-white shadow text-red-500' : 'text-gray-500'}`}>Расход</button>
                <button onClick={() => setType('INCOME')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${type === 'INCOME' ? 'bg-white shadow text-green-500' : 'text-gray-500'}`}>Доход</button>
            </div>

            <div className="text-center">
                <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0" 
                    className="text-5xl font-black text-center w-full outline-none bg-transparent placeholder-gray-200"
                    autoFocus 
                />
                <p className="text-gray-400 text-sm font-medium mt-1">₽</p>
            </div>

            <div className="grid grid-cols-4 gap-2">
                {Object.values(CATEGORIES).filter(c => c.type === 'BOTH' || c.type === type).map(cat => (
                    <button 
                        key={cat.id} 
                        onClick={() => setCategoryId(cat.id)}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl border transition-all ${categoryId === cat.id ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'}`}
                    >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${cat.color}`}>{cat.icon}</div>
                        <span className="text-[10px] font-medium text-gray-600">{cat.label}</span>
                    </button>
                ))}
            </div>

            <input 
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Комментарий (необязательно)"
                className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none"
            />

            {/* If amount is very high for the category, show deviation warning */}
            {Number(amount) > 5000 && type === 'EXPENSE' && (
                <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                    <div className="flex items-center gap-2 text-red-600 text-xs font-bold mb-2">
                        <AlertTriangle size={14} /> Крупная трата!
                    </div>
                    <input 
                        value={deviationReason}
                        onChange={e => setDeviationReason(e.target.value)}
                        placeholder="Укажите причину (обязательно)"
                        className="w-full bg-white rounded-lg p-2 text-sm outline-none border border-red-100"
                    />
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Счет списания/зачисления</label>
                <select 
                    value={accountId} 
                    onChange={e => setAccountId(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none appearance-none"
                >
                    {accounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name} ({formatMoney(a.balance)})</option>
                    ))}
                </select>
            </div>

            <button 
                onClick={handleSubmit} 
                disabled={!amount || (Number(amount) > 5000 && type === 'EXPENSE' && !deviationReason)}
                className="w-full bg-black text-white rounded-xl py-3 font-bold shadow-lg disabled:opacity-50 active:scale-95 transition-transform"
            >
                {transaction ? 'Сохранить изменения' : 'Подтвердить'}
            </button>
        </div>
    )
}

// --- Account Editor ---

export const AccountEditor = ({ onSave, members, epics, account }: { onSave: (acc: Account, goal?: FinancialGoal) => void, members: User[], epics: Epic[], account?: Account | null }) => {
    const [name, setName] = useState(account?.name || '');
    const [balance, setBalance] = useState(account ? (account.balance / 100).toString() : '');
    const [type, setType] = useState<any>(account?.type || 'CARD');
    const [visibleTo, setVisibleTo] = useState<string[]>(account?.visibleTo || []);
    
    // Goal fields
    // NOTE: For editing existing accounts with goals, we would need to pass the goal in prop too.
    // For simplicity, this editor focuses on creating new accounts/goals or editing basic account info.
    // Editing goal details would likely be a separate "GoalEditor".
    const [hasGoal, setHasGoal] = useState(!!account?.goalId);
    const [goalAmount, setGoalAmount] = useState('');
    const [goalTitle, setGoalTitle] = useState('');
    const [linkEpicId, setLinkEpicId] = useState('');

    const handleSave = () => {
        if (!name) return;
        const accId = account?.id || Math.random().toString(36).substr(2,9);
        
        const newAcc: Account = {
            id: accId,
            name,
            balance: Number(balance) * 100,
            type,
            visibleTo,
            goalId: hasGoal ? (account?.goalId || 'g_' + accId) : undefined,
            createdById: account?.createdById
        };

        let goal: FinancialGoal | undefined;
        if (hasGoal && goalAmount && !account?.goalId) { // Only create new goal if didn't exist
            goal = {
                id: 'g_' + accId,
                accountId: accId,
                title: goalTitle || ('Цель ' + name),
                targetAmount: Number(goalAmount) * 100,
                currentAmount: Number(balance) * 100,
                epicId: linkEpicId || undefined
            };
        }

        onSave(newAcc, goal);
    };

    return (
        <div className="space-y-4">
            <input 
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="Название счета"
                className="w-full bg-gray-50 rounded-xl p-3 outline-none font-medium"
            />
            <div className="flex gap-2">
                <input 
                    type="number"
                    value={balance} 
                    onChange={e => setBalance(e.target.value)}
                    placeholder="Баланс"
                    className="flex-1 bg-gray-50 rounded-xl p-3 outline-none"
                />
                <select 
                    value={type} 
                    onChange={e => setType(e.target.value)}
                    className="bg-gray-50 rounded-xl p-3 outline-none"
                >
                    <option value="CARD">Карта</option>
                    <option value="CASH">Наличные</option>
                    <option value="SAVINGS">Копилка</option>
                </select>
            </div>

            {!account && ( // Only show goal creation on new accounts for now
                <div className="bg-gray-50 p-3 rounded-xl">
                     <div className="flex items-center gap-2 mb-2">
                         <input type="checkbox" checked={hasGoal} onChange={e => setHasGoal(e.target.checked)} id="hg" />
                         <label htmlFor="hg" className="font-medium text-sm">Это финансовая цель</label>
                     </div>
                     {hasGoal && (
                         <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                             <input 
                                value={goalTitle}
                                onChange={e => setGoalTitle(e.target.value)}
                                placeholder="Название цели (Машина)"
                                className="w-full bg-white rounded-lg p-2 text-sm outline-none border border-gray-200"
                             />
                             <input 
                                type="number"
                                value={goalAmount}
                                onChange={e => setGoalAmount(e.target.value)}
                                placeholder="Необходимая сумма"
                                className="w-full bg-white rounded-lg p-2 text-sm outline-none border border-gray-200"
                             />
                             <select 
                                value={linkEpicId}
                                onChange={e => setLinkEpicId(e.target.value)}
                                className="w-full bg-white rounded-lg p-2 text-sm outline-none border border-gray-200"
                             >
                                 <option value="">Привязать к проекту (необязательно)</option>
                                 {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                             </select>
                         </div>
                     )}
                </div>
            )}

            <VisibilitySelector members={members} selectedIds={visibleTo} onChange={setVisibleTo} />

            <button onClick={handleSave} className="w-full bg-black text-white rounded-xl py-3 font-bold">
                {account ? 'Сохранить' : 'Создать'}
            </button>
        </div>
    )
}

// --- Budget Editor ---

export const BudgetEditor = ({ budgets, onSave }: { budgets: BudgetPlan[], onSave: (b: BudgetPlan[]) => void }) => {
    const [localBudgets, setLocalBudgets] = useState<BudgetPlan[]>(budgets);

    const updateBudget = (catId: string, val: string) => {
        const num = Number(val) * 100;
        const existing = localBudgets.find(b => b.categoryId === catId);
        if (existing) {
            setLocalBudgets(localBudgets.map(b => b.categoryId === catId ? { ...b, limit: num } : b));
        } else {
            setLocalBudgets([...localBudgets, { categoryId: catId, limit: num }]);
        }
    };

    return (
        <div className="space-y-4 pb-10">
            <p className="text-sm text-gray-500">Установите месячные лимиты для категорий. Оставьте пустым, если лимит не нужен.</p>
            {Object.values(CATEGORIES).filter(c => c.type === 'EXPENSE').map(cat => {
                const b = localBudgets.find(lb => lb.categoryId === cat.id);
                return (
                    <div key={cat.id} className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cat.color}`}>
                            {cat.icon}
                        </div>
                        <div className="flex-1 font-medium text-sm">{cat.label}</div>
                        <input 
                            type="number"
                            placeholder="-"
                            value={b ? b.limit / 100 : ''}
                            onChange={e => updateBudget(cat.id, e.target.value)}
                            className="w-24 text-right bg-gray-50 rounded-lg p-2 text-sm outline-none"
                        />
                    </div>
                )
            })}
            <button onClick={() => onSave(localBudgets)} className="w-full bg-black text-white rounded-xl py-3 font-bold mt-4">
                Сохранить бюджеты
            </button>
        </div>
    )
}

// --- Epic Editor ---

export const EpicEditor = ({ onSave, members, goals = [], initialData }: { onSave: (epic: Epic) => void, members: User[], goals?: FinancialGoal[], initialData?: Partial<Epic> }) => {
    const [title, setTitle] = useState(initialData?.title || '');
    const [priority, setPriority] = useState<Priority>(initialData?.priority || 'MEDIUM');
    const [color, setColor] = useState(initialData?.color || 'bg-blue-500');
    const [goalId, setGoalId] = useState(initialData?.goalId || '');
    const [visibleTo, setVisibleTo] = useState<string[]>(initialData?.visibleTo || []);

    const colors = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-indigo-500', 'bg-teal-500'];

    return (
        <div className="space-y-4">
            <input 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                placeholder="Название проекта"
                className="w-full bg-gray-50 rounded-xl p-3 outline-none font-bold text-lg"
            />

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Цвет</label>
                <div className="flex flex-wrap gap-2">
                    {colors.map(c => (
                        <button 
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-8 h-8 rounded-full ${c} ${color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                        />
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Приоритет</label>
                <div className="flex gap-2">
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                        <button 
                            key={k}
                            onClick={() => setPriority(k as Priority)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${priority === k ? v.color + ' border-transparent' : 'bg-white border-gray-200 text-gray-500'}`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Финансовая цель</label>
                <select 
                    value={goalId} 
                    onChange={e => setGoalId(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none"
                >
                    <option value="">Без цели</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title} ({formatMoney(g.targetAmount)})</option>)}
                </select>
            </div>

            <VisibilitySelector members={members} selectedIds={visibleTo} onChange={setVisibleTo} />

            <button 
                onClick={() => onSave({
                    id: Math.random().toString(36).substr(2,9),
                    title,
                    priority,
                    color,
                    goalId: goalId || undefined,
                    isCompleted: false,
                    visibleTo
                })}
                disabled={!title}
                className="w-full bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50"
            >
                Создать Эпик
            </button>
        </div>
    )
}

// Utility Component for icons
const XIcon = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
)
