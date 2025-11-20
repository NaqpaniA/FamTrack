
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout, CheckSquare, Wallet, Users } from 'lucide-react';
import { Tab } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account } from './finance.model';
import { isVisible } from './utils';
import { useAppStore } from './store';

// UI Modules
import { DashboardScreen } from './dashboard.ui';
import { FamilyScreen } from './family.ui';
import { TasksScreen, TaskEditor, EpicEditor } from './tasks.ui';
import { FinanceScreen, TransactionEditor, AccountEditor, BudgetEditor } from './finance.ui';
import { Modal, ToastContainer } from './ui-kit';

const App = () => {
  const { data, toasts, removeToast, actions } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<Tab>('DASHBOARD');
  
  // Modal State
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

  // --- Handlers ---

  const handleNavigate = (tab: Tab, epicFilter?: string) => {
      setActiveTab(tab);
      setActiveEpicFilter(epicFilter);
  };

  const openEpicModal = (initial?: Partial<Epic>) => {
      setInitialEpicData(initial);
      setEpicModalOpen(true);
  };

  const handleTaskSave = (task: Task) => {
      actions.tasks.save(task);
      setTaskModalOpen(false);
      setEditingTask(null);
  };

  const handleTaskDelete = (id: string) => {
      actions.tasks.delete(id);
      setTaskModalOpen(false);
      setEditingTask(null);
  };

  const handleTxSave = (txData: any) => {
      actions.finance.saveTransaction(txData);
      setTxModalOpen(false);
      setEditingTransaction(null);
  };

  const handleAccountSave = (acc: Account, goal?: any) => {
      actions.finance.saveAccount(acc, goal);
      setAccModalOpen(false);
      setEditingAccount(null);
  };

  const handleBudgetSave = (budgets: any[]) => {
      actions.finance.saveBudgets(budgets);
      setBudgetModalOpen(false);
  };

  const handleEpicSave = (epic: Epic) => {
      actions.epics.save(epic);
      setEpicModalOpen(false);
      setInitialEpicData(undefined);
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-blue-100 pb-safe-area">
       <ToastContainer toasts={toasts} removeToast={removeToast} />

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
                onStatusChange={actions.tasks.toggleStatus}
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
              <FamilyScreen 
                data={data} 
                onUpdateUser={actions.family.updateUser} 
                onBuyReward={actions.family.buyReward}
              />
          )}
       </div>

       {/* Modals */}
       <Modal isOpen={isTaskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Редактировать задачу' : 'Новая задача'}>
           <TaskEditor 
              task={editingTask} 
              members={data.members} 
              epics={data.epics.filter(e => isVisible(e, data.currentUser.id))}
              currentUser={data.currentUser}
              onSave={handleTaskSave} 
              onDelete={handleTaskDelete} 
            />
       </Modal>

       <Modal isOpen={isTxModalOpen} onClose={() => setTxModalOpen(false)} title={editingTransaction ? "Операция" : "Новая операция"}>
           <TransactionEditor 
              onSave={handleTxSave} 
              accounts={data.accounts.filter(a => isVisible(a, data.currentUser.id))}
              goals={data.goals.filter(g => isVisible(g, data.currentUser.id))}
              transaction={editingTransaction}
           />
       </Modal>

       <Modal isOpen={isAccModalOpen} onClose={() => setAccModalOpen(false)} title={editingAccount ? "Редактировать счет" : "Новый счет"}>
           <AccountEditor 
              onSave={handleAccountSave} 
              members={data.members} 
              epics={data.epics.filter(e => isVisible(e, data.currentUser.id))}
              account={editingAccount}
           />
       </Modal>

       <Modal isOpen={isBudgetModalOpen} onClose={() => setBudgetModalOpen(false)} title="Бюджеты">
           <BudgetEditor budgets={data.budgets} onSave={handleBudgetSave} />
       </Modal>

       <Modal isOpen={isEpicModalOpen} onClose={() => setEpicModalOpen(false)} title="Новая Цель (Эпик)">
           <EpicEditor 
              onSave={handleEpicSave} 
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
