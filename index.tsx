
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout, CheckSquare, Wallet, Users } from 'lucide-react';
import { Tab, AppData, Task, TaskStatus, Transaction, Account, FinancialGoal, BudgetPlan, Epic, User, ToastMessage } from './types';
import { INITIAL_DATA } from './data';
import { LocalDatabase, isVisible, getNextRecurringDate } from './utils';
import { DashboardScreen, TasksScreen, FinanceScreen, FamilyScreen } from './screens';
import { Modal, ToastContainer } from './components';
import { TaskEditor, TransactionEditor, AccountEditor, BudgetEditor, EpicEditor } from './editors';

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('DASHBOARD');
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  
  // UI State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [isEpicModalOpen, setEpicModalOpen] = useState(false);
  const [isTxModalOpen, setTxModalOpen] = useState(false);
  const [isAccModalOpen, setAccModalOpen] = useState(false);
  const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
  
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  const [activeEpicFilter, setActiveEpicFilter] = useState<string | undefined>(undefined);
  const [initialEpicData, setInitialEpicData] = useState<Partial<Epic> | undefined>(undefined);

  // Init Load
  useEffect(() => {
    const loaded = LocalDatabase.load();
    setData(loaded);
  }, []);

  // Persist
  useEffect(() => {
    LocalDatabase.save(data);
  }, [data]);

  // --- Handlers ---

  const addToast = (msg: string, type: 'SUCCESS' | 'INFO' = 'SUCCESS') => {
      const id = Math.random().toString();
      setToasts(prev => [...prev, { id, message: msg, type }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const handleNavigate = (tab: Tab, epicFilter?: string) => {
      setActiveTab(tab);
      setActiveEpicFilter(epicFilter);
  };

  const saveTask = (task: Task) => {
      setData(prev => {
          const exists = prev.tasks.find(t => t.id === task.id);
          let newTasks = exists 
              ? prev.tasks.map(t => t.id === task.id ? task : t)
              : [...prev.tasks, task];
          return { ...prev, tasks: newTasks };
      });
      setTaskModalOpen(false);
      setEditingTask(null);
  };

  const deleteTask = (id: string) => {
      setData(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
      setTaskModalOpen(false);
      setEditingTask(null);
  };

  const toggleTaskStatus = (id: string, status: TaskStatus) => {
      const taskForToast = data.tasks.find(t => t.id === id);
      
      setData(prev => {
          const task = prev.tasks.find(t => t.id === id);
          if (!task) return prev;
          
          const isCompleting = status === 'DONE' && task.status !== 'DONE';
          let newUsers = [...prev.members];
          let newLogs = [...prev.rewardLogs];
          let updatedTask = { ...task, status };

          // XP Logic
          if (isCompleting) {
              newUsers = newUsers.map(u => u.id === task.assigneeId ? { ...u, xp: u.xp + task.points } : u);
              newLogs.push({
                  id: Math.random().toString(),
                  userId: task.assigneeId,
                  action: 'EARNED',
                  amount: task.points,
                  description: `Выполнил: ${task.title}`,
                  timestamp: Date.now()
              });

              // Recurring Logic
              if (task.isRecurring) {
                   updatedTask.status = 'TODO';
                   const nextDate = getNextRecurringDate(task.dueDate, task.frequency);
                   updatedTask.dueDate = nextDate;
                   updatedTask.subtasks = updatedTask.subtasks.map(s => ({ ...s, isCompleted: false }));
              }
          }

          return {
              ...prev,
              members: newUsers,
              rewardLogs: newLogs,
              tasks: prev.tasks.map(t => t.id === id ? updatedTask : t)
          };
      });

      // Trigger Toast after state update logic initiated
      if (taskForToast && status === 'DONE' && taskForToast.status !== 'DONE' && taskForToast.isRecurring) {
           const nextDate = getNextRecurringDate(taskForToast.dueDate, taskForToast.frequency);
           const formattedDate = new Date(nextDate).toLocaleDateString('ru-RU');
           addToast(`Задача выполнена! Следующий срок: ${formattedDate}`, 'INFO');
      } else if (status === 'DONE') {
          addToast('Задача выполнена! XP начислено', 'SUCCESS');
      }
  };

  const saveTransaction = (txData: any) => {
      const isUpdate = !!txData.id;
      const txId = txData.id || Math.random().toString(36).substr(2,9);

      // For rollback if updating
      let revertData = null;
      if (isUpdate) {
          revertData = data.transactions.find(t => t.id === txId);
      }

      const newTx: Transaction = {
          id: txId,
          createdById: data.currentUser.id,
          date: new Date().toISOString(),
          ...txData,
          // Preserve creation info if update
          ...(revertData ? { createdById: revertData.createdById, date: revertData.date } : {}) 
      };

      setData(prev => {
          let accs = [...prev.accounts];

          // 1. Revert old logic if update
          if (revertData) {
              accs = accs.map(a => {
                  if (a.id === revertData.accountId) {
                      const diff = revertData.type === 'INCOME' ? -revertData.amount : revertData.amount;
                      return { ...a, balance: a.balance + diff };
                  }
                  return a;
              });
          }

          // 2. Apply new logic
          accs = accs.map(a => {
              if (a.id === newTx.accountId) {
                  const diff = newTx.type === 'INCOME' ? newTx.amount : -newTx.amount;
                  return { ...a, balance: a.balance + diff };
              }
              return a;
          });

          // Update Goal if applicable (Simple logic: just add current tx amount for incomes)
          // Note: complex goal logic with updates requires more robust history, simplified here
          const goals = prev.goals.map(g => {
              if (g.accountId === newTx.accountId && newTx.type === 'INCOME') {
                  // If updating, remove old amount first
                  let currentAmount = g.currentAmount;
                  if (revertData && revertData.type === 'INCOME' && revertData.accountId === newTx.accountId) {
                      currentAmount -= revertData.amount;
                  }
                  return { ...g, currentAmount: currentAmount + newTx.amount };
              }
              return g;
          });

          const newTransactions = isUpdate 
            ? prev.transactions.map(t => t.id === newTx.id ? newTx : t)
            : [newTx, ...prev.transactions];

          return {
              ...prev,
              accounts: accs,
              goals: goals,
              transactions: newTransactions
          };
      });
      setTxModalOpen(false);
      setEditingTransaction(null);
  };

  const saveAccount = (acc: Account, goal?: FinancialGoal) => {
      // Ensure Creator is set
      if (!acc.createdById) acc.createdById = data.currentUser.id;
      
      setData(prev => {
          const accExists = prev.accounts.find(a => a.id === acc.id);
          const newAccounts = accExists 
             ? prev.accounts.map(a => a.id === acc.id ? acc : a)
             : [...prev.accounts, acc];

          let newGoals = [...prev.goals];
          if (goal) {
              const goalExists = prev.goals.find(g => g.id === goal.id);
              newGoals = goalExists
                 ? prev.goals.map(g => g.id === goal.id ? goal : g)
                 : [...prev.goals, goal];
          }

          return {
              ...prev,
              accounts: newAccounts,
              goals: newGoals,
              epics: (goal && goal.epicId) 
                ? prev.epics.map(e => e.id === goal.epicId ? { ...e, goalId: goal.id } : e)
                : prev.epics
          }
      });
      setAccModalOpen(false);
      setEditingAccount(null);
  };

  const saveBudgets = (newBudgets: BudgetPlan[]) => {
      setData(prev => ({ ...prev, budgets: newBudgets }));
      setBudgetModalOpen(false);
  };

  const saveEpic = (epic: Epic) => {
      if (!epic.createdById) epic.createdById = data.currentUser.id;

      setData(prev => {
          const goals = epic.goalId 
              ? prev.goals.map(g => g.id === epic.goalId ? { ...g, epicId: epic.id } : g)
              : prev.goals;

          return {
              ...prev,
              epics: [...prev.epics, epic],
              goals
          };
      });
      setEpicModalOpen(false);
      setInitialEpicData(undefined);
  };

  const updateUser = (updatedUser: User) => {
      setData(prev => ({
          ...prev,
          members: prev.members.map(m => m.id === updatedUser.id ? updatedUser : m),
          currentUser: prev.currentUser.id === updatedUser.id ? updatedUser : prev.currentUser
      }));
  };

  const openEpicModal = (initial?: Partial<Epic>) => {
      setInitialEpicData(initial);
      setEpicModalOpen(true);
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 pb-safe-area">
       <ToastContainer toasts={toasts} removeToast={(id) => setToasts(prev => prev.filter(t => t.id !== id))} />

       {/* Tab Navigation */}
       <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 flex justify-around py-3 pb-6 z-50 safe-bottom">
          <button onClick={() => setActiveTab('DASHBOARD')} className={`flex flex-col items-center gap-1 ${activeTab === 'DASHBOARD' ? 'text-black' : 'text-gray-400'}`}>
              <Layout size={24} strokeWidth={activeTab === 'DASHBOARD' ? 2.5 : 2} />
              <span className="text-[10px] font-bold">Главная</span>
          </button>
          <button onClick={() => handleNavigate('TASKS')} className={`flex flex-col items-center gap-1 ${activeTab === 'TASKS' ? 'text-black' : 'text-gray-400'}`}>
              <CheckSquare size={24} strokeWidth={activeTab === 'TASKS' ? 2.5 : 2} />
              <span className="text-[10px] font-bold">Задачи</span>
          </button>
          <button onClick={() => setActiveTab('FINANCE')} className={`flex flex-col items-center gap-1 ${activeTab === 'FINANCE' ? 'text-black' : 'text-gray-400'}`}>
              <Wallet size={24} strokeWidth={activeTab === 'FINANCE' ? 2.5 : 2} />
              <span className="text-[10px] font-bold">Финансы</span>
          </button>
          <button onClick={() => setActiveTab('FAMILY')} className={`flex flex-col items-center gap-1 ${activeTab === 'FAMILY' ? 'text-black' : 'text-gray-400'}`}>
              <Users size={24} strokeWidth={activeTab === 'FAMILY' ? 2.5 : 2} />
              <span className="text-[10px] font-bold">Семья</span>
          </button>
       </div>

       {/* Main Content Area */}
       <div className="max-w-md mx-auto min-h-screen bg-white sm:border-x border-gray-100 sm:shadow-2xl relative">
          {activeTab === 'DASHBOARD' && (
              <DashboardScreen 
                data={data} 
                onTaskClick={t => { setEditingTask(t); setTaskModalOpen(true); }} 
                onNavigate={handleNavigate}
                onAddEpic={() => openEpicModal()}
              />
          )}
          {activeTab === 'TASKS' && (
              <TasksScreen 
                data={data} 
                onTaskClick={t => { setEditingTask(t); setTaskModalOpen(true); }} 
                onAddTask={() => { setEditingTask(null); setTaskModalOpen(true); }}
                onStatusChange={toggleTaskStatus}
                activeFilterEpicId={activeEpicFilter}
              />
          )}
          {activeTab === 'FINANCE' && (
              <FinanceScreen 
                 data={data}
                 onAddTransaction={() => { setEditingTransaction(null); setTxModalOpen(true); }}
                 onAddAccount={() => { setEditingAccount(null); setAccModalOpen(true); }}
                 onManageBudgets={() => setBudgetModalOpen(true)}
                 onCreateEpicFromGoal={(goal) => {
                     openEpicModal({ title: goal.title, goalId: goal.id });
                 }}
                 onEditAccount={(a) => { setEditingAccount(a); setAccModalOpen(true); }}
                 onEditTransaction={(t) => { setEditingTransaction(t); setTxModalOpen(true); }}
              />
          )}
          {activeTab === 'FAMILY' && (
              <FamilyScreen data={data} onUpdateUser={updateUser} />
          )}
       </div>

       {/* Modals */}
       <Modal isOpen={isTaskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Редактировать задачу' : 'Новая задача'}>
           <TaskEditor 
              task={editingTask} 
              members={data.members} 
              epics={data.epics.filter(e => isVisible(e, data.currentUser.id))}
              currentUser={data.currentUser}
              onSave={saveTask} 
              onDelete={deleteTask} 
            />
       </Modal>

       <Modal isOpen={isTxModalOpen} onClose={() => setTxModalOpen(false)} title={editingTransaction ? "Операция" : "Новая операция"}>
           <TransactionEditor 
              onSave={saveTransaction} 
              accounts={data.accounts.filter(a => isVisible(a, data.currentUser.id))}
              goals={data.goals.filter(g => isVisible(g, data.currentUser.id))}
              transaction={editingTransaction}
           />
       </Modal>

       <Modal isOpen={isAccModalOpen} onClose={() => setAccModalOpen(false)} title={editingAccount ? "Редактировать счет" : "Новый счет"}>
           <AccountEditor 
              onSave={saveAccount} 
              members={data.members} 
              epics={data.epics.filter(e => isVisible(e, data.currentUser.id))}
              account={editingAccount}
           />
       </Modal>

       <Modal isOpen={isBudgetModalOpen} onClose={() => setBudgetModalOpen(false)} title="Бюджеты">
           <BudgetEditor budgets={data.budgets} onSave={saveBudgets} />
       </Modal>

       <Modal isOpen={isEpicModalOpen} onClose={() => setEpicModalOpen(false)} title="Новая Цель (Эпик)">
           <EpicEditor 
              onSave={saveEpic} 
              members={data.members} 
              goals={data.goals.filter(g => isVisible(g, data.currentUser.id))}
              initialData={initialEpicData}
           />
       </Modal>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
