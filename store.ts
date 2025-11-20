
import { useState } from 'react';
import { AppData, ToastMessage, TaskStatus } from './types';
import { Task, Epic, getNextRecurringDate } from './tasks.model';
import { Transaction, Account, FinancialGoal, BudgetPlan, SavingsGoal, GoalContribution } from './finance.model';
import { User, Reward, RewardLog, calculateLevel, InventoryItem, calculateStreakBonus } from './family.model';
import { TWA, generateId } from './utils';
import { useFamilyData, useMutations } from './queries';

export const useAppStore = () => {
  // React Query Data
  const { data, isLoading, isError } = useFamilyData();
  const mutations = useMutations();

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [bonusData, setBonusData] = useState<{ streak: number, xp: number } | null>(null);

  // --- Utils ---
  const addToast = (msg: string, type: 'SUCCESS' | 'INFO' | 'ERROR' = 'SUCCESS') => {
      const id = Math.random().toString();
      setToasts(prev => [...prev, { id, message: msg, type }]);
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
      
      // Already logged in today
      if (user.lastLoginDate === today) return;

      // Calculate date diff
      const lastDate = user.lastLoginDate ? new Date(user.lastLoginDate) : new Date(0);
      const nowDate = new Date(today);
      const diffTime = Math.abs(nowDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

      let newStreak = 1;
      let bonusXp = 0;

      if (diffDays === 1) {
          // Consecutive day
          newStreak = (user.streak || 0) + 1;
          bonusXp = calculateStreakBonus(newStreak);
      } else if (diffDays > 1) {
          // Streak broken (or first login ever)
          newStreak = 1;
          bonusXp = 10; // Day 1 bonus
      } else {
          return;
      }

      // Update User
      const newXp = user.xp + bonusXp;
      const updatedUser: User = {
          ...user,
          streak: newStreak,
          lastLoginDate: today,
          xp: newXp,
          level: calculateLevel(newXp)
      };

      // Log it
      const newLog: RewardLog = {
          id: generateId(),
          userId: user.id,
          action: 'EARNED',
          amount: bonusXp,
          description: `Ежедневный бонус (День ${newStreak}) 🔥`,
          timestamp: Date.now()
      };

      const newMembers = data.members.map(m => m.id === user.id ? updatedUser : m);
      const newLogs = [newLog, ...data.rewardLogs];

      mutations.batchUpdate.mutate({
          currentUser: updatedUser,
          members: newMembers,
          rewardLogs: newLogs
      });

      setBonusData({ streak: newStreak, xp: bonusXp });
      TWA.notification('success');
  };

  const switchUser = (userId: string) => {
      const user = data.members.find(m => m.id === userId);
      if (user) {
          mutations.batchUpdate.mutate({ currentUser: user });
          TWA.haptic('medium');
          addToast(`Вы вошли как ${user.name}`, 'INFO');
      }
  };

  const resetData = () => {
      if (confirm('Вы уверены? Все данные будут удалены.')) {
          localStorage.clear();
          window.location.reload();
      }
  };

  const saveTask = (task: Task) => {
      mutations.saveTask.mutate(task);
      TWA.haptic('light');
  };

  const deleteTask = (id: string) => {
      mutations.deleteTask.mutate(id);
      TWA.haptic('medium');
  };

  const toggleTaskStatus = (id: string, status: TaskStatus) => {
      const task = data.tasks.find(t => t.id === id);
      if (!task) return;

      const isCompleting = status === 'DONE' && task.status !== 'DONE';
      
      let updates: Partial<AppData> = {};
      let newTasks = [...data.tasks];
      let newMembers = [...data.members];
      let newLogs = [...data.rewardLogs];

      // 1. Update Status
      const updatedTask = { ...task, status };
      newTasks = newTasks.map(t => t.id === id ? updatedTask : t);
      updates.tasks = newTasks;

      // 2. Handle XP
      if (isCompleting) {
          newMembers = newMembers.map(u => {
              if (u.id === task.assigneeId) {
                  const newXp = u.xp + task.points;
                  return { ...u, xp: newXp, level: calculateLevel(newXp) };
              }
              return u;
          });
          updates.members = newMembers;
          
          if (data.currentUser.id === task.assigneeId) {
              updates.currentUser = newMembers.find(m => m.id === data.currentUser.id);
          }

          newLogs.unshift({
              id: generateId(),
              userId: task.assigneeId || 'unknown',
              action: 'EARNED',
              amount: task.points,
              description: `Выполнил: ${task.title}`,
              timestamp: Date.now()
          });
          updates.rewardLogs = newLogs;

          // 3. Recurring Logic
          if (task.isRecurring) {
               const nextDate = getNextRecurringDate(task.dueDate, task.frequency);
               const nextTask: Task = {
                   ...task,
                   id: generateId(),
                   status: 'TODO',
                   dueDate: nextDate,
                   subtasks: task.subtasks.map(s => ({ ...s, isCompleted: false })),
                   createdAt: Date.now()
               };
               newTasks.push(nextTask);
               updates.tasks = newTasks;
               
               setTimeout(() => addToast(`Создана следующая задача на ${new Date(nextDate).toLocaleDateString('ru-RU')}`, 'INFO'), 500);
          }
      }

      mutations.batchUpdate.mutate(updates);

      if (isCompleting) {
          addToast(`Задача выполнена! +${task.points} XP`, 'SUCCESS');
      } else {
          TWA.selection();
      }
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

      let accs = [...data.accounts];
      let goals = [...data.goals];

      if (originalTx) {
          accs = accs.map(a => {
              if (a.id === originalTx.accountId) {
                  const diff = originalTx.type === 'INCOME' ? -originalTx.amount : originalTx.amount;
                  return { ...a, balance: a.balance + diff };
              }
              return a;
          });
          goals = goals.map(g => {
               if (g.accountId === originalTx.accountId && originalTx.type === 'INCOME') {
                   return { ...g, currentAmount: g.currentAmount - originalTx.amount };
               }
               return g;
          });
      }

      accs = accs.map(a => {
          if (a.id === newTx.accountId) {
              const diff = newTx.type === 'INCOME' ? newTx.amount : -newTx.amount;
              return { ...a, balance: a.balance + diff };
          }
          return a;
      });
      goals = goals.map(g => {
          if (g.accountId === newTx.accountId && newTx.type === 'INCOME') {
              return { ...g, currentAmount: g.currentAmount + newTx.amount };
          }
          return g;
      });
      
      const newTransactions = isUpdate 
        ? data.transactions.map(t => t.id === newTx.id ? newTx : t)
        : [newTx, ...data.transactions];

      mutations.batchUpdate.mutate({
          transactions: newTransactions,
          accounts: accs,
          goals: goals
      });
      TWA.haptic('medium');
  };

  const saveAccount = (acc: Account, goal?: FinancialGoal) => {
      mutations.saveAccount.mutate({ acc, goal });
      TWA.haptic('light');
  };

  const saveBudgets = (budgets: BudgetPlan[]) => {
      mutations.saveBudgets.mutate(budgets);
      TWA.haptic('light');
  };

  const saveEpic = (epic: Epic) => {
      mutations.saveEpic.mutate(epic);
      TWA.haptic('light');
  };

  const updateUser = (updatedUser: User) => {
      const newMembers = data.members.map(m => m.id === updatedUser.id ? updatedUser : m);
      mutations.batchUpdate.mutate({ 
          members: newMembers,
          currentUser: data.currentUser.id === updatedUser.id ? updatedUser : data.currentUser
      });
      TWA.haptic('light');
  };

  const buyReward = (reward: Reward) => {
      if (data.currentUser.xp < reward.cost) {
          addToast('Недостаточно XP!', 'ERROR');
          return;
      }

      const newXp = data.currentUser.xp - reward.cost;
      const updatedUser = { ...data.currentUser, xp: newXp, level: calculateLevel(newXp) };
      
      const newLog: RewardLog = {
          id: generateId(),
          userId: updatedUser.id,
          action: 'SPENT',
          amount: reward.cost,
          description: `Купил: ${reward.title}`,
          timestamp: Date.now()
      };

      const newItem: InventoryItem = {
          id: generateId(),
          rewardId: reward.id,
          ownerId: updatedUser.id,
          status: 'AVAILABLE',
          purchasedAt: Date.now()
      };

      const newMembers = data.members.map(m => m.id === updatedUser.id ? updatedUser : m);
      const newLogs = [newLog, ...data.rewardLogs];
      const newInventory = [newItem, ...(data.inventory || [])];

      mutations.batchUpdate.mutate({
          currentUser: updatedUser,
          members: newMembers,
          rewardLogs: newLogs,
          inventory: newInventory
      });

      addToast(`Куплено! Предмет в рюкзаке.`, 'SUCCESS');
  };

  const consumeItem = (item: InventoryItem, rewardTitle: string) => {
      if (item.status !== 'AVAILABLE') return;

      const updatedItem: InventoryItem = { ...item, status: 'USED', usedAt: Date.now() };
      
      const newLog: RewardLog = {
          id: generateId(),
          userId: data.currentUser.id,
          action: 'USED',
          amount: 0,
          description: `Активировал: ${rewardTitle}`,
          timestamp: Date.now()
      };

      const newInventory = data.inventory.map(i => i.id === item.id ? updatedItem : i);
      const newLogs = [newLog, ...data.rewardLogs];

      mutations.batchUpdate.mutate({
          inventory: newInventory,
          rewardLogs: newLogs
      });

      addToast('Награда активирована! Наслаждайся.', 'SUCCESS');
  };

  // --- New Savings Goals Actions ---

  const saveSavingsGoal = (goal: SavingsGoal) => {
      const isUpdate = !!data.savingsGoals.find(g => g.id === goal.id);
      let newGoals = [...data.savingsGoals];
      if (isUpdate) {
          newGoals = newGoals.map(g => g.id === goal.id ? goal : g);
      } else {
          newGoals.push(goal);
      }
      mutations.batchUpdate.mutate({ savingsGoals: newGoals });
      TWA.haptic('light');
  };

  const contributeToGoal = (goalId: string, amount: number, sourceAccountId: string, message?: string) => {
      const goal = data.savingsGoals.find(g => g.id === goalId);
      const account = data.accounts.find(a => a.id === sourceAccountId);
      
      if (amount <= 0) {
           addToast('Сумма должна быть больше нуля', 'ERROR');
           return;
      }

      if (!goal || !account) return;

      if (account.balance < amount) {
          addToast('Недостаточно средств на счете', 'ERROR');
          return;
      }

      // 1. Update Account (Deduct)
      const updatedAccount = { ...account, balance: account.balance - amount };
      const newAccounts = data.accounts.map(a => a.id === account.id ? updatedAccount : a);

      // 2. Update Goal (Add)
      const updatedGoal = { ...goal, currentAmount: goal.currentAmount + amount };
      const newGoals = data.savingsGoals.map(g => g.id === goal.id ? updatedGoal : g);

      // 3. Create Contribution Record
      const contribution: GoalContribution = {
          id: generateId(),
          goalId,
          userId: data.currentUser.id,
          amount,
          message,
          date: Date.now()
      };
      const newContributions = [contribution, ...data.contributions];

      // 4. Create Transaction Record (So we know where money went in history)
      const transaction: Transaction = {
          id: generateId(),
          amount,
          type: 'EXPENSE', // Technically a transfer, but leaves the "Wallet"
          categoryId: 'goal_contrib', // System category
          accountId: sourceAccountId,
          title: `В копилку: ${goal.title}`,
          date: new Date().toISOString(),
          createdById: data.currentUser.id
      };
      const newTransactions = [transaction, ...data.transactions];

      mutations.batchUpdate.mutate({
          accounts: newAccounts,
          savingsGoals: newGoals,
          contributions: newContributions,
          transactions: newTransactions
      });

      addToast(`Отложено в копилку! 💰`, 'SUCCESS');
      TWA.notification('success');
  };

  return {
    data,
    isLoading,
    isError,
    toasts,
    bonusData,
    closeBonusModal,
    addToast,
    removeToast,
    actions: {
      app: { switchUser, resetData, checkDailyStreak },
      tasks: { save: saveTask, delete: deleteTask, toggleStatus: toggleTaskStatus },
      finance: { saveTransaction, saveAccount, saveBudgets, saveSavingsGoal, contributeToGoal },
      epics: { save: saveEpic },
      family: { updateUser, buyReward, consumeItem }
    }
  };
};
