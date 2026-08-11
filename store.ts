
import { useState } from 'react';
import { AppData, FamilySettings, ToastMessage, TaskStatus } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account, FinancialGoal, BudgetPlan, SavingsGoal, Subscription } from './finance.model';
import { User, Reward, InventoryItem, calculateStreakBonus } from './family.model';
import { ShoppingCategoryType } from './shopping.model';
import { Note } from './notes.model';
import { TWA, generateId } from './utils';
import { useFamilyData, useMutations } from './queries';

const EMPTY_DATA: AppData = {
  currentUser: {
    id: '',
    name: '',
    role: 'CHILD',
    avatar: '🙂',
    xp: 0,
    level: 1,
    streak: 0
  },
  members: [],
  epics: [],
  tasks: [],
  accounts: [],
  goals: [],
  savingsGoals: [],
  contributions: [],
  subscriptions: [],
  budgets: [],
  transactions: [],
  rewards: [],
  rewardLogs: [],
  inventory: [],
  shoppingList: [],
  notes: [],
  events: []
};

export const useAppStore = () => {
  // React Query Data
  const familyQuery = useFamilyData();
  const data = familyQuery.data ?? EMPTY_DATA;
  const isLoading = !familyQuery.data && familyQuery.isPending;
  const isError = !familyQuery.data && familyQuery.isError;
  const mutations = useMutations();

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [bonusData, setBonusData] = useState<{ streak: number, xp: number } | null>(null);

  // --- Utils ---
  const addToast = (msg: string, type: 'SUCCESS' | 'INFO' | 'ERROR' = 'SUCCESS') => {
      const id = Math.random().toString();
      setToasts([{ id, message: msg, type }]);
      if (type === 'SUCCESS') TWA.notification('success');
      if (type === 'ERROR') TWA.notification('error');
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const removeToast = (id: string) => {
      setToasts(prev => prev.filter(t => t.id !== id));
  };

  const closeBonusModal = () => setBonusData(null);

  // --- Actions Wrappers ---

  const checkDailyStreak = () => {
      if (!data || !data.currentUser) return;
      const user = data.currentUser;
      const today = new Date().toISOString().split('T')[0];
      if (user.lastLoginDate === today) return;
      const lastDate = user.lastLoginDate ? new Date(user.lastLoginDate) : new Date(0);
      const nowDate = new Date(today);
      const diffTime = Math.abs(nowDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const newStreak = diffDays === 1 ? (user.streak || 0) + 1 : 1;
      const bonusXp = calculateStreakBonus(newStreak);
      mutations.checkIn.mutate(undefined, {
          onSuccess: () => setBonusData({ streak: newStreak, xp: bonusXp }),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось начислить ежедневный бонус', 'ERROR')
      });
  };

  const switchUser = (userId: string) => {
      const user = data.members.find(m => m.id === userId);
      if (user) {
          TWA.haptic('medium');
          addToast(`Профиль определяется Telegram: ${user.name}`, 'INFO');
      }
  };

  const saveTask = (task: Task) => {
      mutations.saveTask.mutate(task, {
          onSuccess: () => addToast('Задача сохранена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить задачу', 'ERROR')
      });
      TWA.haptic('light');
  };

  const deleteTask = (id: string) => {
      mutations.deleteTask.mutate(id, {
          onSuccess: () => addToast('Задача удалена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось удалить задачу', 'ERROR')
      });
      TWA.haptic('medium');
  };

  const toggleTaskStatus = (id: string, status: TaskStatus) => {
      const task = data.tasks.find(t => t.id === id);
      if (!task) return;
      const isCompleting = status === 'DONE' && task.status !== 'DONE';
      const willAwardXp = isCompleting && !task.rewardedAt;
      mutations.setTaskStatus.mutate({ id, status }, {
          onSuccess: () => addToast(
              willAwardXp
                ? `Задача выполнена · +${task.points} XP исполнителю`
                : isCompleting ? 'Задача снова завершена · XP уже начислялись' : 'Статус задачи обновлён',
              'SUCCESS'
          ),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось изменить статус', 'ERROR')
      });
      TWA.selection();
  };

  const moveTask = (id: string, status: TaskStatus, beforeTaskId?: string) => {
      const task = data.tasks.find(t => t.id === id);
      if (!task) return;

      mutations.setTaskStatus.mutate({ id, status, beforeTaskId }, {
          onSuccess: () => addToast(status === 'DONE' ? 'Задача завершена' : 'Положение задачи сохранено', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось переместить задачу', 'ERROR')
      });
      TWA.selection();
  };

  const saveTransaction = (txData: any) => {
      const isUpdate = !!txData.id;
      const txId = txData.id || generateId();
      const originalTx = isUpdate ? data.transactions.find(t => t.id === txId) : null;

      const newTx: Transaction = {
          id: txId,
          createdById: data.currentUser.id,
          date: new Date().toISOString(),
          ...txData,
          ...(originalTx ? { createdById: originalTx.createdById, date: originalTx.date } : {})
      };

      mutations.saveTransaction.mutate(newTx, {
          onSuccess: () => addToast('Операция сохранена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить операцию', 'ERROR')
      });
      TWA.haptic('medium');
  };

  const saveAccount = (acc: Account, goal?: FinancialGoal) => {
      mutations.saveAccount.mutate({ acc, goal }, {
          onSuccess: () => addToast('Счёт сохранён', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить счёт', 'ERROR')
      });
      TWA.haptic('light');
  };

  const saveBudgets = (budgets: BudgetPlan[]) => {
      mutations.saveBudgets.mutate(budgets, {
          onSuccess: () => addToast('Бюджеты сохранены', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить бюджеты', 'ERROR')
      });
      TWA.haptic('light');
  };

  const saveEpic = (epic: Epic) => {
      mutations.saveEpic.mutate({
          ...epic,
          createdById: epic.createdById || data.currentUser.id
      }, {
          onSuccess: () => addToast('Проект сохранён', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить проект', 'ERROR')
      });
      TWA.haptic('light');
  };

  const deleteEpic = (id: string) => {
      mutations.deleteEpic.mutate(id, {
          onSuccess: () => addToast('Проект удалён', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось удалить проект', 'ERROR')
      });
      TWA.haptic('medium');
  };

  const saveNote = (note: Note) => {
      mutations.saveNote.mutate(note, {
          onSuccess: () => addToast(note.isArchived ? 'Заметка архивирована' : 'Заметка сохранена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить заметку', 'ERROR')
      });
      TWA.haptic('light');
  };

  const deleteNote = (id: string) => {
      mutations.deleteNote.mutate(id, {
          onSuccess: () => addToast('Заметка удалена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось удалить заметку', 'ERROR')
      });
      TWA.haptic('medium');
  };

  const updateUser = (updatedUser: User) => {
      mutations.saveUser.mutate(updatedUser, {
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить профиль', 'ERROR')
      });
      TWA.haptic('light');
  };

  const saveFamilyUser = (user: User) => {
      mutations.saveUser.mutate(user, {
          onSuccess: () => addToast('Состав семьи обновлён', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить участника', 'ERROR')
      });
      TWA.haptic('light');
  };

  const archiveFamilyUser = (id: string) => {
      mutations.archiveUser.mutate(id, {
          onSuccess: () => addToast('Участник перемещён в архив', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось архивировать участника', 'ERROR')
      });
      TWA.haptic('medium');
  };

  const restoreFamilyUser = (id: string) => {
      mutations.restoreUser.mutate(id, {
          onSuccess: () => addToast('Участник восстановлен', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось восстановить участника', 'ERROR')
      });
      TWA.haptic('light');
  };

  const buyReward = (reward: Reward) => {
      if (data.currentUser.xp < reward.cost) {
          addToast('Недостаточно XP!', 'ERROR');
          return;
      }

      mutations.purchaseReward.mutate(reward.id, {
          onSuccess: () => addToast('Куплено! Предмет уже в рюкзаке.', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось купить награду', 'ERROR')
      });
  };

  const consumeItem = (item: InventoryItem, rewardTitle: string) => {
      if (item.status !== 'AVAILABLE') return;

      mutations.useReward.mutate(item.id, {
          onSuccess: () => addToast(`Награда «${rewardTitle}» активирована`, 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось использовать награду', 'ERROR')
      });
  };

  const saveFamilySettings = (settings: FamilySettings) => {
      mutations.saveFamilySettings.mutate(settings, {
          onSuccess: () => addToast('Настройки семьи сохранены', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить настройки', 'ERROR')
      });
  };

  const saveReward = (reward: Reward) => {
      mutations.saveReward.mutate(reward, {
          onSuccess: () => addToast('Награда сохранена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить награду', 'ERROR')
      });
  };

  const archiveReward = (id: string) => {
      mutations.archiveReward.mutate(id, {
          onSuccess: () => addToast('Награда убрана из магазина', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось архивировать награду', 'ERROR')
      });
  };

  const saveSavingsGoal = (goal: SavingsGoal) => {
      mutations.saveSavingsGoal.mutate(goal, {
          onSuccess: () => addToast('Копилка сохранена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить копилку', 'ERROR')
      });
      TWA.haptic('light');
  };

  const contributeToGoal = (goalId: string, amount: number, sourceAccountId: string, message?: string) => {
      if (amount <= 0) {
           addToast('Сумма должна быть больше нуля', 'ERROR');
           return;
      }

      mutations.contributeToSavingsGoal.mutate({ goalId, amount, sourceAccountId, message }, {
          onSuccess: () => addToast('Отложено в копилку! 💰', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось пополнить копилку', 'ERROR')
      });
  };

  // --- Subscriptions Actions ---

  const saveSubscription = (sub: Subscription) => {
      mutations.saveSubscription.mutate(sub, {
          onSuccess: () => addToast('Подписка сохранена', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось сохранить подписку', 'ERROR')
      });
      TWA.haptic('light');
  };

  const deleteSubscription = (id: string) => {
      if (confirm('Удалить подписку?')) {
          mutations.deleteSubscription.mutate(id, {
              onSuccess: () => addToast('Подписка удалена', 'SUCCESS'),
              onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось удалить подписку', 'ERROR')
          });
          TWA.haptic('medium');
      }
  };

  const paySubscription = (sub: Subscription) => {
      mutations.paySubscription.mutate(sub.id, {
          onSuccess: () => addToast('Подписка оплачена!', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось оплатить подписку', 'ERROR')
      });
  };

  // --- Shopping List Actions ---

  const addShoppingItem = (title: string, category: ShoppingCategoryType = 'FOOD') => {
      mutations.addShoppingItem.mutate({ id: generateId(), title, category }, {
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось добавить покупку', 'ERROR')
      });
      TWA.haptic('light');
  };

  const toggleShoppingItem = (id: string) => {
      const item = data.shoppingList.find(candidate => candidate.id === id);
      if (!item) return;
      mutations.setShoppingItemCompleted.mutate({ id, completed: !item.isCompleted }, {
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось обновить покупку', 'ERROR')
      });
      TWA.selection();
  };

  const deleteShoppingItem = (id: string) => {
      mutations.deleteShoppingItem.mutate(id, {
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось удалить покупку', 'ERROR')
      });
      TWA.haptic('light');
  };

  const checkoutShoppingList = (totalAmount: number, accountId: string) => {
      const completedItems = (data.shoppingList || []).filter(i => i.isCompleted);
      if (completedItems.length === 0) return;

      mutations.checkoutShopping.mutate({
          itemIds: completedItems.map(item => item.id),
          totalAmount,
          accountId
      }, {
          onSuccess: () => addToast('Список покупок оплачен!', 'SUCCESS'),
          onError: (error) => addToast(error instanceof Error ? error.message : 'Не удалось оплатить покупки', 'ERROR')
      });
  };

  return {
    data,
    isLoading,
    isError,
    loadError: familyQuery.error,
    retryLoad: familyQuery.refetch,
    isReady: !!familyQuery.data,
    toasts,
    bonusData,
    closeBonusModal,
    addToast,
    removeToast,
    actions: {
      app: { switchUser, checkDailyStreak },
      tasks: { save: saveTask, delete: deleteTask, toggleStatus: toggleTaskStatus, move: moveTask },
      finance: { saveTransaction, saveAccount, saveBudgets, saveSavingsGoal, contributeToGoal, saveSubscription, deleteSubscription, paySubscription },
      epics: { save: saveEpic, delete: deleteEpic },
      notes: { save: saveNote, delete: deleteNote },
      family: {
        updateUser,
        saveUser: saveFamilyUser,
        archiveUser: archiveFamilyUser,
        restoreUser: restoreFamilyUser,
        saveSettings: saveFamilySettings,
        saveReward,
        archiveReward,
        buyReward,
        consumeItem
      },
      shopping: { addItem: addShoppingItem, toggle: toggleShoppingItem, delete: deleteShoppingItem, checkout: checkoutShoppingList }
    }
  };
};
