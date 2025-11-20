
import React, { useState } from 'react';
import { 
  Plus, 
  Settings, 
  CreditCard, 
  PiggyBank, 
  Wallet, 
  AlertTriangle,
  PieChart,
  Target,
  Sparkles,
  ArrowRight,
  Repeat,
  Calendar,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import { AppData, User, Epic } from './types';
import { 
    Account, 
    Transaction, 
    BudgetPlan, 
    FinancialGoal, 
    SavingsGoal,
    CATEGORIES,
    Subscription,
    SERVICE_PRESETS,
    SubscriptionFrequency
} from './finance.model';
import { formatMoney, isVisible } from './utils';
import { VisibilitySelector, Modal, Avatar } from './ui-kit';

// --- Components ---

export const TransactionItem = ({ transaction, user }: { transaction: Transaction, user?: User }) => {
  const isExpense = transaction.type === 'EXPENSE';
  const category = CATEGORIES[transaction.categoryId] || CATEGORIES.other;
  const date = new Date(transaction.date);
  const isToday = date.toDateString() === new Date().toDateString();
  
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${category.color} relative`}>
          {category.icon}
          {transaction.deviationReason && (
             <div className="absolute -bottom-1 -right-1 bg-red-500 text-white rounded-full p-0.5 border border-white">
                <AlertTriangle size={10} />
             </div>
          )}
        </div>
        <div>
          <div className="font-medium text-gray-800">{transaction.title || category.label}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1">
             <span>{isToday ? date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : date.toLocaleDateString()}</span>
             <span>•</span>
             {user && <span className="bg-gray-100 px-1 rounded text-[10px]">{user.name}</span>}
             {transaction.deviationReason && <span className="text-red-400 truncate max-w-[100px]">• {transaction.deviationReason}</span>}
          </div>
        </div>
      </div>
      <div className={`font-semibold ${isExpense ? 'text-gray-900' : 'text-green-600'}`}>
        {isExpense ? '-' : '+'}{formatMoney(transaction.amount)}
      </div>
    </div>
  );
};

export const GoalCard = ({ goal, onClick }: { key?: React.Key, goal: SavingsGoal, onClick: () => void }) => {
    const safeTarget = goal.targetAmount || 1; // Prevent division by zero
    const progress = Math.min((goal.currentAmount / safeTarget) * 100, 100);
    
    return (
        <div 
            onClick={onClick}
            className="min-w-[200px] bg-white rounded-2xl p-4 shadow-sm border border-gray-100 relative overflow-hidden cursor-pointer active:scale-95 transition-transform"
        >
            <div className="flex justify-between items-start mb-3">
                <div className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center text-xl">
                    {goal.icon}
                </div>
                <div className="bg-gray-50 px-2 py-1 rounded-lg text-[10px] font-bold text-gray-500">
                    {Math.round(progress)}%
                </div>
            </div>
            
            <div className="font-bold text-gray-900 leading-tight mb-1">{goal.title}</div>
            <div className="text-xs text-gray-400 mb-3">
                {formatMoney(goal.currentAmount)} / {formatMoney(goal.targetAmount)}
            </div>

            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                    className="h-full bg-gradient-to-r from-blue-400 to-purple-400 rounded-full transition-all duration-500" 
                    style={{ width: `${progress}%` }} 
                />
            </div>
            
            {progress >= 100 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white text-black px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 shadow-xl">
                        <Sparkles size={12} /> Готово!
                    </div>
                </div>
            )}
        </div>
    )
};

export const SubscriptionCard = ({ sub, onPay, onEdit }: { key?: React.Key, sub: Subscription, onPay: () => void, onEdit: () => void }) => {
    const preset = sub.serviceId ? SERVICE_PRESETS[sub.serviceId] : SERVICE_PRESETS.custom;
    const today = new Date();
    today.setHours(0,0,0,0);
    const payDate = new Date(sub.nextPaymentDate);
    payDate.setHours(0,0,0,0);
    
    const diffTime = payDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const isOverdue = diffDays < 0;
    const isDueSoon = diffDays >= 0 && diffDays <= 3;

    return (
        <div onClick={onEdit} className={`bg-white p-3 rounded-2xl border shadow-sm flex items-center justify-between relative overflow-hidden cursor-pointer active:scale-[0.98] transition-transform ${isOverdue ? 'border-red-200 ring-1 ring-red-50' : 'border-gray-100'}`}>
             {isOverdue && <div className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full -mr-1 -mt-1 animate-pulse" />}
             
             <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${preset.color}`}>
                     <preset.icon size={20} />
                 </div>
                 <div>
                     <div className="font-bold text-sm text-gray-900 leading-tight">{sub.title}</div>
                     <div className={`text-[10px] font-medium flex items-center gap-1 ${isOverdue ? 'text-red-500' : isDueSoon ? 'text-orange-500' : 'text-gray-400'}`}>
                         <Calendar size={10} />
                         {isOverdue ? `Просрочено ${Math.abs(diffDays)} дн.` : diffDays === 0 ? 'Сегодня' : `Через ${diffDays} дн.`}
                     </div>
                 </div>
             </div>

             <div className="flex flex-col items-end gap-1">
                 <div className="font-bold text-sm">{formatMoney(sub.amount)}</div>
                 {(isOverdue || isDueSoon) && (
                     <button 
                        onClick={(e) => { e.stopPropagation(); onPay(); }}
                        className="bg-black text-white text-[10px] px-2 py-1 rounded-lg font-bold shadow-lg hover:scale-105 transition-transform"
                     >
                         Оплатить
                     </button>
                 )}
             </div>
        </div>
    )
}

// --- Editors ---

export const ContributionModal = ({ 
    isOpen, 
    onClose, 
    goal, 
    accounts, 
    onConfirm 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    goal: SavingsGoal | null, 
    accounts: Account[], 
    onConfirm: (amount: number, accountId: string, message?: string) => void 
}) => {
    const [amount, setAmount] = useState('');
    const [accountId, setAccountId] = useState(accounts[0]?.id || '');
    const [message, setMessage] = useState('');

    if (!isOpen || !goal) return null;

    // Ensure accountId is valid (in case accounts list changed)
    const safeAccountId = accountId || accounts[0]?.id; 
    const selectedAccount = accounts.find(a => a.id === safeAccountId);
    
    const numericAmount = Number(amount) * 100;
    const canAfford = selectedAccount && selectedAccount.balance >= numericAmount && numericAmount > 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`В копилку: ${goal.title}`}>
            <div className="space-y-4 pb-10">
                <div className="text-center py-4">
                    <div className="text-4xl mb-2">{goal.icon}</div>
                    <p className="text-gray-500 text-sm">Осталось накопить: <span className="font-bold text-gray-900">{formatMoney(Math.max(0, goal.targetAmount - goal.currentAmount))}</span></p>
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Сумма пополнения</label>
                    <input 
                        type="number" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0" 
                        min="1"
                        className="w-full bg-gray-50 rounded-xl p-3 text-lg font-bold outline-none"
                        autoFocus
                    />
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Откуда списать?</label>
                    <select 
                        value={safeAccountId} 
                        onChange={e => setAccountId(e.target.value)}
                        className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none appearance-none"
                    >
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({formatMoney(a.balance)})</option>
                        ))}
                    </select>
                </div>

                <div>
                    <input 
                        value={message} 
                        onChange={e => setMessage(e.target.value)}
                        placeholder="Сообщение (напр. Подарок)" 
                        className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none"
                    />
                </div>

                <button 
                    onClick={() => {
                        onConfirm(numericAmount, safeAccountId!, message);
                        onClose();
                        setAmount('');
                        setMessage('');
                    }}
                    disabled={!amount || !canAfford}
                    className="w-full bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50 shadow-lg active:scale-95 transition-transform"
                >
                    Пополнить
                </button>
            </div>
        </Modal>
    );
};

export const SubscriptionEditor = ({ onSave, onDelete, accounts, subscription }: { onSave: (s: Subscription) => void, onDelete: (id: string) => void, accounts: Account[], subscription?: Subscription | null }) => {
    const [serviceId, setServiceId] = useState(subscription?.serviceId || '');
    const [title, setTitle] = useState(subscription?.title || '');
    const [amount, setAmount] = useState(subscription ? (subscription.amount / 100).toString() : '');
    const [accountId, setAccountId] = useState(subscription?.accountId || accounts[0]?.id || '');
    const [frequency, setFrequency] = useState<SubscriptionFrequency>(subscription?.frequency || 'MONTHLY');
    const [nextPaymentDate, setNextPaymentDate] = useState(subscription?.nextPaymentDate?.split('T')[0] || new Date().toISOString().split('T')[0]);

    const handlePresetSelect = (key: string) => {
        const p = SERVICE_PRESETS[key];
        setServiceId(key);
        setTitle(p.label);
        if (p.defaultAmount > 0) setAmount((p.defaultAmount / 100).toString());
    };

    const handleSave = () => {
        if (!title || !amount) return;
        onSave({
            id: subscription?.id || Math.random().toString(36).substr(2, 9),
            title,
            amount: Number(amount) * 100,
            currency: 'RUB',
            frequency,
            nextPaymentDate: new Date(nextPaymentDate).toISOString(),
            serviceId: serviceId || undefined,
            accountId: accountId || accounts[0]?.id,
            isAutoPay: false, // Future feature
            categoryId: 'services', // Simplified for now
            active: true
        });
    };

    return (
        <div className="space-y-5 pb-10">
            {!subscription && (
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {Object.entries(SERVICE_PRESETS).map(([key, p]) => (
                        <button 
                            key={key} 
                            onClick={() => handlePresetSelect(key)}
                            className={`flex flex-col items-center gap-1 min-w-[70px] p-2 rounded-xl border transition-all ${serviceId === key ? 'border-blue-500 bg-blue-50' : 'border-gray-100 bg-white'}`}
                        >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${p.color}`}>
                                <p.icon size={16} />
                            </div>
                            <span className="text-[9px] text-gray-500 truncate w-full text-center">{p.label}</span>
                        </button>
                    ))}
                </div>
            )}

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Название и Сумма</label>
                <div className="flex gap-2">
                    <input 
                        value={title} 
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Netflix"
                        className="flex-1 bg-gray-50 rounded-xl p-3 outline-none font-bold"
                    />
                    <input 
                        type="number"
                        value={amount} 
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0 ₽"
                        className="w-24 bg-gray-50 rounded-xl p-3 outline-none text-center"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Счет оплаты</label>
                    <select 
                        value={accountId} 
                        onChange={e => setAccountId(e.target.value)}
                        className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none appearance-none"
                    >
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Период</label>
                    <select 
                        value={frequency} 
                        onChange={e => setFrequency(e.target.value as any)}
                        className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none appearance-none"
                    >
                        <option value="WEEKLY">Неделя</option>
                        <option value="MONTHLY">Месяц</option>
                        <option value="YEARLY">Год</option>
                    </select>
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Следующая оплата</label>
                <input 
                    type="date" 
                    value={nextPaymentDate} 
                    onChange={e => setNextPaymentDate(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none"
                />
            </div>

            <div className="pt-2 flex gap-3">
                {subscription && (
                    <button onClick={() => onDelete(subscription.id)} className="p-3 rounded-xl bg-red-50 text-red-500">
                        <Trash2 size={20} />
                    </button>
                )}
                <button 
                    onClick={handleSave} 
                    disabled={!title || !amount}
                    className="flex-1 bg-black text-white rounded-xl py-3 font-bold shadow-lg disabled:opacity-50"
                >
                    Сохранить
                </button>
            </div>
        </div>
    )
}

export const SavingsGoalEditor = ({ onSave, goal }: { onSave: (g: SavingsGoal) => void, goal?: SavingsGoal | null }) => {
    const [title, setTitle] = useState(goal?.title || '');
    const [targetAmount, setTargetAmount] = useState(goal ? (goal.targetAmount / 100).toString() : '');
    const [icon, setIcon] = useState(goal?.icon || '💰');

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <input 
                    value={icon}
                    onChange={e => setIcon(e.target.value)}
                    className="w-14 text-center bg-gray-50 rounded-xl p-3 text-2xl outline-none"
                    placeholder="Emoji"
                />
                <input 
                    value={title} 
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Название цели (напр. LEGO)"
                    className="flex-1 bg-gray-50 rounded-xl p-3 outline-none font-bold"
                />
            </div>
            <input 
                type="number"
                value={targetAmount} 
                onChange={e => setTargetAmount(e.target.value)}
                placeholder="Сколько нужно накопить?"
                className="w-full bg-gray-50 rounded-xl p-3 outline-none"
            />
            
            <button 
                onClick={() => onSave({
                    id: goal?.id || Math.random().toString(36).substr(2, 9),
                    title,
                    targetAmount: Number(targetAmount) * 100,
                    currentAmount: goal?.currentAmount || 0,
                    icon,
                    status: 'ACTIVE',
                    createdById: goal?.createdById || '', // Will be set by store
                    createdAt: goal?.createdAt || Date.now()
                })}
                disabled={!title || !targetAmount}
                className="w-full bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50"
            >
                {goal ? 'Сохранить' : 'Создать цель'}
            </button>
        </div>
    )
};

export const TransactionEditor = ({ onSave, accounts, goals, transaction }: { key?: React.Key, onSave: (data: any) => void, accounts: Account[], goals: FinancialGoal[], transaction?: Transaction | null }) => {
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
                {Object.values(CATEGORIES).filter(c => (c.type === 'BOTH' || c.type === type) && c.id !== 'goal_contrib').map(cat => (
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

export const AccountEditor = ({ onSave, members, epics, account }: { key?: React.Key, onSave: (acc: Account, goal?: FinancialGoal) => void, members: User[], epics: Epic[], account?: Account | null }) => {
    const [name, setName] = useState(account?.name || '');
    const [balance, setBalance] = useState(account ? (account.balance / 100).toString() : '');
    const [type, setType] = useState<any>(account?.type || 'CARD');
    const [visibleTo, setVisibleTo] = useState<string[]>(account?.visibleTo || []);
    
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
        if (hasGoal && goalAmount && !account?.goalId) {
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

            {!account && (
                <div className="bg-gray-50 p-3 rounded-xl">
                     <div className="flex items-center gap-2 mb-2">
                         <input type="checkbox" checked={hasGoal} onChange={e => setHasGoal(e.target.checked)} id="hg" />
                         <label htmlFor="hg" className="font-medium text-sm">Это банковский вклад/цель</label>
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
            {Object.values(CATEGORIES).filter(c => c.type === 'EXPENSE' && c.id !== 'goal_contrib').map(cat => {
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

// --- Screens ---

export const FinanceScreen = ({ 
    data, 
    onAddTransaction,
    onAddAccount,
    onManageBudgets,
    onCreateEpicFromGoal,
    onEditAccount,
    onEditTransaction,
    onSaveSavingsGoal,
    onContribute,
    onSaveSubscription,
    onDeleteSubscription,
    onPaySubscription
}: { 
    data: AppData, 
    onAddTransaction: () => void,
    onAddAccount: () => void,
    onManageBudgets: () => void,
    onCreateEpicFromGoal: (g: FinancialGoal) => void,
    onEditAccount: (a: Account) => void,
    onEditTransaction: (t: Transaction) => void,
    onSaveSavingsGoal?: (g: SavingsGoal) => void,
    onContribute?: (goalId: string, amount: number, accId: string, msg?: string) => void,
    onSaveSubscription?: (s: Subscription) => void,
    onDeleteSubscription?: (id: string) => void,
    onPaySubscription?: (s: Subscription) => void
}) => {
    const visibleAccounts = data.accounts.filter(a => isVisible(a, data.currentUser.id));
    const visibleTransactions = data.transactions
        .filter(t => visibleAccounts.some(a => a.id === t.accountId))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Calculate Budgets
    const currentMonth = new Date().toISOString().slice(0, 7); 
    const budgetStats = data.budgets.map(budget => {
        const spent = visibleTransactions
            .filter(t => t.type === 'EXPENSE' && t.categoryId === budget.categoryId && t.date.startsWith(currentMonth))
            .reduce((sum, t) => sum + t.amount, 0);
        return { ...budget, spent };
    });

    // Fixed Costs (Burn Rate)
    const fixedMonthlyCost = (data.subscriptions || []).reduce((sum, sub) => {
        if (sub.frequency === 'MONTHLY') return sum + sub.amount;
        if (sub.frequency === 'YEARLY') return sum + (sub.amount / 12);
        if (sub.frequency === 'WEEKLY') return sum + (sub.amount * 4);
        return sum;
    }, 0);

    // State
    const [isGoalModalOpen, setGoalModalOpen] = useState(false);
    const [isContribOpen, setContribOpen] = useState(false);
    const [isSubModalOpen, setSubModalOpen] = useState(false);
    const [activeGoal, setActiveGoal] = useState<SavingsGoal | null>(null);
    const [activeSub, setActiveSub] = useState<Subscription | null>(null);

    return (
        <div className="p-4 pb-24 space-y-8 animate-in fade-in duration-300">
            
            {/* Subscriptions / Fixed Costs */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Repeat size={20} className="text-red-500" /> Платежи</h2>
                    <div className="flex items-center gap-2">
                        <div className="text-xs font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded-lg">
                            Burn: {formatMoney(fixedMonthlyCost).replace(',00 ₽', '')}/мес
                        </div>
                        <button 
                            onClick={() => { setActiveSub(null); setSubModalOpen(true); }}
                            className="text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded-lg"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-2">
                    {data.subscriptions?.length > 0 ? (
                        data.subscriptions
                            .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime())
                            .map(sub => (
                                <SubscriptionCard 
                                    key={sub.id} 
                                    sub={sub} 
                                    onPay={() => onPaySubscription?.(sub)}
                                    onEdit={() => { setActiveSub(sub); setSubModalOpen(true); }}
                                />
                            ))
                    ) : (
                        <div className="bg-gray-50 border border-dashed border-gray-200 p-4 rounded-xl text-center text-sm text-gray-400">
                            Добавьте подписки или квартплату
                        </div>
                    )}
                </div>
            </div>

            {/* Dream Jars */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold flex items-center gap-2"><Target size={20} className="text-purple-500" /> Вишлист</h2>
                    <button 
                        onClick={() => { setActiveGoal(null); setGoalModalOpen(true); }}
                        className="text-blue-600 text-sm bg-blue-50 px-2 py-1 rounded-lg"
                    >
                        <Plus size={16} />
                    </button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar">
                    {data.savingsGoals.length === 0 ? (
                        <div className="w-full bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-6 text-center">
                            <p className="text-gray-400 text-sm mb-2">Нет целей</p>
                            <button onClick={() => setGoalModalOpen(true)} className="text-sm font-bold text-blue-500">Создать копилку</button>
                        </div>
                    ) : (
                        data.savingsGoals.map(goal => (
                            <GoalCard 
                                key={goal.id} 
                                goal={goal} 
                                onClick={() => {
                                    setActiveGoal(goal);
                                    setContribOpen(true);
                                }} 
                            />
                        ))
                    )}
                </div>
            </div>

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
                         const safeGoalTarget = goal ? (goal.targetAmount || 1) : 1;
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
                                                 <span>{Math.round((goal.currentAmount / safeGoalTarget) * 100)}%</span>
                                             </div>
                                             <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                                                 <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min((goal.currentAmount / safeGoalTarget) * 100, 100)}%` }} />
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
                            const percent = Math.min((b.spent / (b.limit || 1)) * 100, 100); // Safe devision
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

            {/* Modals */}
            <Modal isOpen={isGoalModalOpen} onClose={() => setGoalModalOpen(false)} title={activeGoal ? 'Редактировать цель' : 'Новая цель'}>
                <SavingsGoalEditor 
                    onSave={(g) => {
                        if (onSaveSavingsGoal) onSaveSavingsGoal(g);
                        setGoalModalOpen(false);
                    }} 
                    goal={activeGoal} 
                />
            </Modal>

            <ContributionModal 
                isOpen={isContribOpen} 
                onClose={() => setContribOpen(false)}
                goal={activeGoal}
                accounts={visibleAccounts.filter(a => a.balance > 0)}
                onConfirm={(amount, accId, msg) => {
                     if (onContribute && activeGoal) onContribute(activeGoal.id, amount, accId, msg);
                }}
            />

            <Modal isOpen={isSubModalOpen} onClose={() => setSubModalOpen(false)} title={activeSub ? 'Подписка' : 'Новая подписка'}>
                <SubscriptionEditor 
                    onSave={(s) => {
                        if (onSaveSubscription) onSaveSubscription(s);
                        setSubModalOpen(false);
                    }}
                    onDelete={(id) => {
                        if (onDeleteSubscription) onDeleteSubscription(id);
                        setSubModalOpen(false);
                    }}
                    accounts={visibleAccounts}
                    subscription={activeSub}
                />
            </Modal>

        </div>
    );
};
