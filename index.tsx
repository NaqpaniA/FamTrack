
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, ArrowRight, Bot, CheckSquare, Layout, Loader2, MessageCircle, RefreshCw, ShieldCheck, ShoppingBag, Users, Wallet } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './styles.css';

import { AppData, Tab } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account } from './finance.model';
import { getTelegramStartParam, installTelegramShellLifecycle, isVisible, TWA } from './utils';
import { useAppStore } from './store';
import { api } from './api';
import { KEYS } from './queries';

// UI Modules
import { DashboardScreen } from './dashboard.ui';
import { FamilyScreen } from './family.ui';
import { TasksScreen, TaskEditor, EpicEditor } from './tasks.ui';
import { FinanceScreen, TransactionEditor, AccountEditor, BudgetEditor } from './finance.ui';
import { ShoppingScreen } from './shopping.ui';
import { SettingsModal } from './settings.ui';
import { BottomNav, Modal, ToastContainer, StreakModal } from './ui-kit';
import { NotesSheet } from './notes.ui';
import { SaveStateIndicator } from './save-state.ui';

// --- Query Client Setup ---
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
        }
    }
});

const useTelegramShell = () => {
  useEffect(() => {
      const cleanup = installTelegramShellLifecycle();
      TWA.ready();
      TWA.expand();
      TWA.disableVerticalSwipes();
      TWA.requestFullscreen();
      TWA.enableClosingConfirmation();
      return cleanup;
  }, []);
};

const readInviteToken = () => {
  const queryToken = new URLSearchParams(window.location.search).get('invite');
  if (queryToken) return queryToken;
  const startParam = getTelegramStartParam();
  return startParam.startsWith('fi_') ? startParam : null;
};

const InviteOnboardingScreen = ({ token, onAccepted }: { token: string, onAccepted: () => void }) => {
  const [isAccepting, setAccepting] = useState(false);
  const [error, setError] = useState('');

  const acceptInvite = async () => {
      if (isAccepting) return;
      setAccepting(true);
      setError('');
      try {
          const nextData = await api.acceptFamilyInvite(token);
          queryClient.setQueryData(KEYS.DATA, nextData);
          const params = new URLSearchParams(window.location.search);
          params.delete('invite');
          const nextSearch = params.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`);
          onAccepted();
      } catch (inviteError) {
          setError(inviteError instanceof Error ? inviteError.message : 'Не удалось принять приглашение');
      } finally {
          setAccepting(false);
      }
  };

  return (
    <div className="telegram-standalone-screen bg-[#f5f6f8] text-gray-950 flex flex-col">
      <div className="max-w-md mx-auto w-full flex-1 flex flex-col gap-5">
        <div className="rounded-[18px] overflow-hidden border border-gray-200 bg-white shadow-sm">
          <img
            src="/famtrack-demo.gif"
            alt="FamTrack: задачи, покупки и семейные финансы"
            className="w-full aspect-[16/10] object-cover bg-gray-100"
          />
        </div>

        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold mb-3">
            <ShieldCheck size={14} />
            Отдельная семейная зона
          </div>
          <h1 className="text-[28px] leading-tight font-black">Вас пригласили в FamTrack</h1>
          <p className="text-sm text-gray-500 mt-2">
            Примите приглашение из своего Telegram-аккаунта. Данные этой семьи будут видны только её участникам.
          </p>
        </div>

        <div className="space-y-2">
          {[
            ['1', 'Нажмите кнопку ниже, чтобы создать профиль владельца семьи.'],
            ['2', 'В приложении откройте «Семья → Состав → Инвайт» и пригласите остальных.'],
            ['3', 'Групповой чат с ботом можно создать потом: он нужен для команд и быстрых ссылок.']
          ].map(([step, text]) => (
            <div key={step} className="bg-white border border-gray-100 rounded-[14px] p-3 flex gap-3 shadow-sm">
              <div className="w-7 h-7 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center shrink-0">{step}</div>
              <div className="text-sm text-gray-700 leading-snug">{text}</div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-100 rounded-[14px] p-3 shadow-sm flex items-start gap-3">
          <Bot size={22} className="text-blue-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-sm">Про групповой чат</div>
            <div className="text-xs text-gray-500 mt-1">
              Чат не обязателен для входа. Если добавите туда бота, семья сможет писать команды вроде /app, /tasks и /shopping.
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-[14px] p-3 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={acceptInvite}
          disabled={isAccepting}
          className="mt-auto h-14 rounded-2xl bg-black text-white font-bold flex items-center justify-center gap-2 shadow-xl disabled:opacity-60 active:scale-[0.98] transition-transform"
        >
          {isAccepting ? <Loader2 className="animate-spin" size={20} /> : <MessageCircle size={20} />}
          {isAccepting ? 'Принимаю...' : 'Принять приглашение'}
          {!isAccepting && <ArrowRight size={20} />}
        </button>
      </div>
    </div>
  );
};

const FamTrackApp = () => {
  const {
    data,
    isLoading,
    isError,
    isReady,
    loadError,
    retryLoad,
    toasts,
    bonusData,
    removeToast,
    closeBonusModal,
    actions
  } = useAppStore();
  
  const [activeTab, setActiveTab] = useState<Tab>('DASHBOARD');
  const [saveState, setSaveState] = useState(api.getSaveState());

  useEffect(() => {
      const unsubscribeState = api.subscribeSaveState(setSaveState);
      const unsubscribeData = api.subscribeData(nextData => queryClient.setQueryData<AppData>(KEYS.DATA, nextData));
      return () => {
          unsubscribeState();
          unsubscribeData();
      };
  }, []);
  
  // Modal State
  const [isTaskModalOpen, setTaskModalOpen] = useState(false);
  const [isEpicModalOpen, setEpicModalOpen] = useState(false);
  const [isTxModalOpen, setTxModalOpen] = useState(false);
  const [isAccModalOpen, setAccModalOpen] = useState(false);
  const [isBudgetModalOpen, setBudgetModalOpen] = useState(false);
  const [isSettingsOpen, setSettingsOpen] = useState(false);
  const [notesSheet, setNotesSheet] = useState<{ open: boolean; initialMode: 'list' | 'new'; requestId: number }>({
      open: false,
      initialMode: 'list',
      requestId: 0
  });
  
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  const [activeEpicFilter, setActiveEpicFilter] = useState<string | undefined>(undefined);
  const [initialEpicData, setInitialEpicData] = useState<Partial<Epic> | undefined>(undefined);

  // --- Daily Streak Check ---
  useEffect(() => {
      if (isReady && data.currentUser.id) {
          // Check streaks whenever data loads or user changes
          actions.app.checkDailyStreak();
      }
  }, [isReady, data.currentUser.id]);

  // --- Handlers ---

  const handleNavigate = (tab: Tab, epicFilter?: string) => {
      setActiveTab(tab);
      setActiveEpicFilter(epicFilter);
      TWA.selection();
  };

  const openNotes = (initialMode: 'list' | 'new' = 'list') => {
      setNotesSheet(prev => ({
          open: true,
          initialMode,
          requestId: prev.requestId + 1
      }));
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

  const handleEpicDelete = (id: string) => {
      if (confirm('Удалить проект? Задачи останутся без проекта.')) {
          actions.epics.delete(id);
          if (activeEpicFilter === id) setActiveEpicFilter(undefined);
          setEpicModalOpen(false);
          setInitialEpicData(undefined);
      }
  };

  // --- Render ---
  
  if (isLoading) {
      return (
          <div className="telegram-standalone-screen flex items-center justify-center bg-gray-50">
              <Loader2 className="animate-spin text-gray-400" size={32} />
          </div>
      )
  }

  if (isError) {
      const message = loadError instanceof Error
          ? loadError.message
          : 'Не удалось загрузить данные семьи';
      return (
          <div className="telegram-standalone-screen flex items-center justify-center bg-[#f5f6f8] text-gray-950">
              <div className="w-full max-w-sm rounded-[20px] border border-red-100 bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                      <AlertTriangle size={24} />
                  </div>
                  <h1 className="text-xl font-black">Данные не загружены</h1>
                  <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      FamTrack не показывает демо-данные вместо вашей семьи. Проверьте соединение и повторите загрузку.
                  </p>
                  <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs text-gray-500 break-words">
                      {message}
                  </p>
                  <button
                      type="button"
                      onClick={() => void retryLoad()}
                      className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 text-sm font-bold text-white active:scale-[0.98]"
                  >
                      <RefreshCw size={18} />
                      Повторить загрузку
                  </button>
              </div>
          </div>
      );
  }

  const navItems = [
      { id: 'DASHBOARD' as Tab, label: 'Главная', icon: Layout },
      { id: 'TASKS' as Tab, label: 'Задачи', icon: CheckSquare },
      { id: 'SHOP' as Tab, label: 'Список', icon: ShoppingBag },
      { id: 'FINANCE' as Tab, label: 'Финансы', icon: Wallet },
      { id: 'FAMILY' as Tab, label: 'Семья', icon: Users }
  ];

  return (
    <div className="telegram-shell text-gray-950 font-sans selection:bg-blue-100 transition-colors duration-300 bg-[#f5f6f8]">
       <SaveStateIndicator state={saveState} onRetry={() => api.retryOutbox()} />
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
       <div className="telegram-shell relative">
          {activeTab === 'DASHBOARD' && (
              <DashboardScreen 
                data={data} 
                onTaskClick={t => { setEditingTask(t); setTaskModalOpen(true); }} 
                onTaskStatusChange={actions.tasks.toggleStatus}
                onNavigate={handleNavigate}
                onAddTask={() => { setEditingTask(null); setTaskModalOpen(true); }}
                onAddEpic={() => openEpicModal()}
                onOpenProfile={() => setSettingsOpen(true)}
                onOpenNotes={() => openNotes('list')}
                onAddNote={() => openNotes('new')}
                householdActions={{
                    saveRoutine: actions.routines.save,
                    pauseRoutine: actions.routines.pause,
                    completeRoutine: actions.routines.complete,
                    recordRoutineUnit: actions.routines.recordUnit,
                    skipRoutine: actions.routines.skip,
                    pendingRoutineIds: actions.routines.pendingIds,
                    savePreferences: actions.routines.savePreferences,
                    saveWishlist: actions.wishlists.save,
                    saveWishlistItem: actions.wishlists.saveItem,
                    deleteWishlistItem: actions.wishlists.deleteItem,
                    reserveWishlistItem: actions.wishlists.reserve
                }}
              />
          )}
          {activeTab === 'TASKS' && (
              <TasksScreen 
	                data={data} 
	                onTaskClick={t => { setEditingTask(t); setTaskModalOpen(true); }} 
	                onAddTask={() => { setEditingTask(null); setTaskModalOpen(true); }}
	                onStatusChange={actions.tasks.toggleStatus}
	                onRoutineComplete={actions.routines.complete}
	                pendingRoutineIds={actions.routines.pendingIds}
	                onMoveTask={actions.tasks.move}
	                onAddEpic={() => openEpicModal()}
	                onEditEpic={(epic) => openEpicModal(epic)}
	                onEpicFilterChange={(epicId) => {
	                    setActiveEpicFilter(epicId);
	                    TWA.selection();
	                }}
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
                  onAdjustPantry={actions.pantry.adjust}
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
                onSaveUser={actions.family.saveUser}
                onArchiveUser={actions.family.archiveUser}
                onRestoreUser={actions.family.restoreUser}
                onSaveSettings={actions.family.saveSettings}
                onSaveReward={actions.family.saveReward}
                onArchiveReward={actions.family.archiveReward}
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
              availableTasks={data.tasks.filter(t => isVisible(t, data.currentUser))}
              currentUser={data.currentUser}
              onSave={handleTaskSave} 
              onDelete={handleTaskDelete} 
              onRoutineComplete={async (routineId, taskId) => {
                  const completed = await actions.routines.complete(routineId, taskId);
                  if (completed) setTaskModalOpen(false);
              }}
              routinePending={!!editingTask?.routineTemplateId && actions.routines.pendingIds.has(editingTask.routineTemplateId)}
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

       <Modal isOpen={isEpicModalOpen} onClose={() => setEpicModalOpen(false)} title={initialEpicData?.id ? 'Редактировать проект' : 'Новый проект'}>
           <EpicEditor 
              key={initialEpicData?.id || (initialEpicData ? 'with-data' : 'new-epic')}
              onSave={handleEpicSave} 
              onDelete={handleEpicDelete}
              members={data.members} 
              goals={data.goals.filter(g => isVisible(g, data.currentUser))}
              initialData={initialEpicData}
           />
       </Modal>

       <Modal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} title="Настройки">
            <SettingsModal
               data={data}
            />
       </Modal>

       <NotesSheet
          isOpen={notesSheet.open}
          initialMode={notesSheet.initialMode}
          requestId={notesSheet.requestId}
          data={data}
          onClose={() => setNotesSheet(prev => ({ ...prev, open: false }))}
          onSave={actions.notes.save}
          onDelete={actions.notes.delete}
       />
    </div>
  );
};

const App = () => {
  useTelegramShell();
  const [inviteToken, setInviteToken] = useState(readInviteToken);

  if (inviteToken) {
      return <InviteOnboardingScreen token={inviteToken} onAccepted={() => setInviteToken(null)} />;
  }

  return <FamTrackApp />;
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <QueryClientProvider client={queryClient}>
        <App />
    </QueryClientProvider>
);
