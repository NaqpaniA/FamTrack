
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout, CheckSquare, Wallet, Users, Loader2, ShoppingBag } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';

import { Tab } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account } from './finance.model';
import { isVisible, TWA } from './utils';
import { useAppStore } from './store';

// UI Modules
import { DashboardScreen } from './dashboard.ui';
import { FamilyScreen } from './family.ui';
import { TasksScreen, TaskEditor, EpicEditor } from './tasks.ui';
import { FinanceScreen, TransactionEditor, AccountEditor, BudgetEditor } from './finance.ui';
import { ShoppingScreen } from './shopping.ui';
import { SettingsModal } from './settings.ui';
import { BottomNav, Modal, ToastContainer, StreakModal } from './ui-kit';

// --- Query Client Setup ---
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        }
    }
});

const App = () => {
  const { data, isLoading, toasts, bonusData, removeToast, closeBonusModal, actions } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<Tab>('DASHBOARD');
  
  // Modal State
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [isEpicModalOpen, setEpicModalOpen] = useState(false);
  const [isTxModalOpen, setTxModalOpen] = useState(false);
  const [isAccModalOpen, setAccModalOpen] = useState(false);
  const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  const [activeEpicFilter, setActiveEpicFilter] = useState<string | undefined>(undefined);
  const [initialEpicData, setInitialEpicData] = useState<Partial<Epic> | undefined>(undefined);

  // --- Init TWA ---
  useEffect(() => {
      TWA.ready();
      TWA.expand();
      TWA.enableClosingConfirmation();
      document.body.style.backgroundColor = '#f5f6f8';
  }, []);

  // --- Daily Streak Check ---
  useEffect(() => {
      if (!isLoading && data.currentUser) {
          // Check streaks whenever data loads or user changes
          actions.app.checkDailyStreak();
      }
  }, [isLoading, data.currentUser?.id]);

  // --- Handlers ---

  const handleNavigate = (tab: Tab, epicFilter?: string) => {
      setActiveTab(tab);
      setActiveEpicFilter(epicFilter);
      TWA.selection();
  };

  const openEpicModal = (initial?: Partial<Epic>) => {
      setInitialEpicData(initial);
      setEpicModalOpen(true);
      TWA.selection();
  };

  const handleTaskSave = (task: Task) => {
      actions.tasks.save(task);
      setTaskModalOpen(false);
      setEditingTask(null);
  };

  const handleTaskDelete = (id: string) => {
      if (confirm('Удалить задачу?')) {
        actions.tasks.delete(id);
        setTaskModalOpen(false);
        setEditingTask(null);
      }
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
  
  if (isLoading) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
      )
  }

  const navItems = [
      { id: 'DASHBOARD' as Tab, label: 'Главная', icon: Layout },
      { id: 'TASKS' as Tab, label: 'Задачи', icon: CheckSquare },
      { id: 'SHOP' as Tab, label: 'Список', icon: ShoppingBag },
      { id: 'FINANCE' as Tab, label: 'Финансы', icon: Wallet },
      { id: 'FAMILY' as Tab, label: 'Семья', icon: Users }
  ];

  return (
    <div className="min-h-[100svh] text-gray-950 font-sans selection:bg-blue-100 transition-colors duration-300 bg-[#f5f6f8]">
       <ToastContainer toasts={toasts} removeToast={removeToast} />
       
       {/* Daily Bonus Modal */}
       {bonusData && (
           <StreakModal 
              isOpen={!!bonusData} 
              onClose={closeBonusModal} 
              streak={bonusData.streak} 
              xp={bonusData.xp} 
           />
       )}

       <BottomNav activeTab={activeTab} items={navItems} onNavigate={handleNavigate} />

       {/* Main Content Area */}
       <div className="min-h-[100svh] relative">
          {activeTab === 'DASHBOARD' && (
              <DashboardScreen 
                data={data} 
                onTaskClick={t => { setEditingTask(t); setTaskModalOpen(true); }} 
                onNavigate={handleNavigate}
                onAddEpic={() => openEpicModal()}
                onOpenProfile={() => setSettingsOpen(true)}
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
          {activeTab === 'SHOP' && (
              <ShoppingScreen
                  data={data}
                  onAddItem={actions.shopping.addItem}
                  onToggleItem={actions.shopping.toggle}
                  onDeleteItem={actions.shopping.delete}
                  onCheckout={actions.shopping.checkout}
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
                 onSaveSavingsGoal={actions.finance.saveSavingsGoal}
                 onContribute={actions.finance.contributeToGoal}
                 onSaveSubscription={actions.finance.saveSubscription}
                 onDeleteSubscription={actions.finance.deleteSubscription}
                 onPaySubscription={actions.finance.paySubscription}
              />
          )}
          {activeTab === 'FAMILY' && (
              <FamilyScreen 
                data={data} 
                onUpdateUser={actions.family.updateUser} 
                onBuyReward={actions.family.buyReward}
                onConsumeItem={actions.family.consumeItem}
              />
          )}
       </div>

       {/* Modals */}
       
       <Modal isOpen={isTaskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Редактировать задачу' : 'Новая задача'}>
           <TaskEditor 
              key={editingTask ? editingTask.id : 'new-task'}
              task={editingTask} 
              members={data.members} 
              epics={data.epics.filter(e => isVisible(e, data.currentUser))}
              currentUser={data.currentUser}
              onSave={handleTaskSave} 
              onDelete={handleTaskDelete} 
            />
       </Modal>

       <Modal isOpen={isTxModalOpen} onClose={() => setTxModalOpen(false)} title={editingTransaction ? "Операция" : "Новая операция"}>
           <TransactionEditor 
              key={editingTransaction ? editingTransaction.id : 'new-tx'}
              onSave={handleTxSave} 
              accounts={data.accounts.filter(a => isVisible(a, data.currentUser))}
              goals={data.goals.filter(g => isVisible(g, data.currentUser))}
              transaction={editingTransaction}
           />
       </Modal>

       <Modal isOpen={isAccModalOpen} onClose={() => setAccModalOpen(false)} title={editingAccount ? "Редактировать счет" : "Новый счет"}>
           <AccountEditor 
              key={editingAccount ? editingAccount.id : 'new-acc'}
              onSave={handleAccountSave} 
              members={data.members} 
              epics={data.epics.filter(e => isVisible(e, data.currentUser))}
              account={editingAccount}
           />
       </Modal>

       <Modal isOpen={isBudgetModalOpen} onClose={() => setBudgetModalOpen(false)} title="Бюджеты">
           <BudgetEditor budgets={data.budgets} onSave={handleBudgetSave} />
       </Modal>

       <Modal isOpen={isEpicModalOpen} onClose={() => setEpicModalOpen(false)} title="Новая Цель (Эпик)">
           <EpicEditor 
              key={initialEpicData ? 'with-data' : 'new-epic'}
              onSave={handleEpicSave} 
              members={data.members} 
              goals={data.goals.filter(g => isVisible(g, data.currentUser))}
              initialData={initialEpicData}
           />
       </Modal>

       <Modal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки">
            <SettingsModal
               data={data}
               onReset={actions.app.resetData}
            />
       </Modal>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <QueryClientProvider client={queryClient}>
        <App />
    </QueryClientProvider>
);
