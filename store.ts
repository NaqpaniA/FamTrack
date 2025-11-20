
import { useState, useEffect } from 'react';
import { AppData, ToastMessage, TaskStatus } from './types';
import { Task, Epic, getNextRecurringDate } from './tasks.model';
import { Transaction, Account, FinancialGoal, BudgetPlan } from './finance.model';
import { User, Reward, RewardLog, calculateLevel } from './family.model';
import { INITIAL_DATA } from './data';
import { LocalDatabase, TWA } from './utils';

export const useAppStore = () => {
  const [data, setData] = useState<AppData>(INITIAL_DATA);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // --- Persistence ---
  useEffect(() => {
    const loaded = LocalDatabase.load();
    setData(loaded);
  }, []);

  useEffect(() => {
    if (data !== INITIAL_DATA) {
        LocalDatabase.save(data);
    }
  }, [data]);

  // --- Utils ---
  const addToast = (msg: string, type: 'SUCCESS' | 'INFO' | 'ERROR' = 'SUCCESS') => {
      const id = Math.random().toString();
      setToasts(prev => [...prev, { id, message: msg, type }]);
      // Trigger haptic feedback on toast
      if (type === 'SUCCESS') TWA.notification('success');
      if (type === 'ERROR') TWA.notification('error');
      
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  };

  const removeToast = (id: string) => {
      setToasts(prev => prev.filter(t => t.id !== id));
  };

  // --- App Actions ---
  const switchUser = (userId: string) => {
      const user = data.members.find(m => m.id === userId);
      if (user) {
          setData(prev => ({ ...prev, currentUser: user }));
          TWA.haptic('medium');
          addToast(`Вы вошли как ${user.name}`, 'INFO');
      }
  };

  const resetData = () => {
      if (confirm('Вы уверены? Все данные будут удалены.')) {
          LocalDatabase.reset();
      }
  };

  // --- Tasks Actions ---
  const saveTask = (task: Task) => {
      setData(prev => {
          const exists = prev.tasks.find(t => t.id === task.id);
          let newTasks = exists 
              ? prev.tasks.map(t => t.id === task.id ? task : t)
              : [...prev.tasks, task];
          return { ...prev, tasks: newTasks };
      });
      TWA.haptic('light');
  };

  const deleteTask = (id: string) => {
      setData(prev => ({ ...prev, tasks: prev.tasks.filter(t => t.id !== id) }));
      TWA.haptic('medium');
  };

  const toggleTaskStatus = (id: string, status: TaskStatus) => {
      const taskForToast = data.tasks.find(t => t.id === id);
      
      setData(prev => {
          const task = prev.tasks.find(t => t.id === id);
          if (!task) return prev;
          
          const isCompleting = status === 'DONE' && task.status !== 'DONE';
          let newMembers = [...prev.members];
          let newLogs = [...prev.rewardLogs];
          let updatedTask = { ...task, status };

          // XP Logic
          if (isCompleting) {
              newMembers = newMembers.map(u => {
                  if (u.id === task.assigneeId) {
                      const newXp = u.xp + task.points;
                      return { ...u, xp: newXp, level: calculateLevel(newXp) };
                  }
                  return u;
              });
              newLogs.push({
                  id: Math.random().toString(),
                  userId: task.assigneeId || 'unknown',
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
              members: newMembers,
              rewardLogs: newLogs,
              tasks: prev.tasks.map(t => t.id === id ? updatedTask : t),
              currentUser: newMembers.find(m => m.id === prev.currentUser.id) || prev.currentUser
          };
      });

      if (taskForToast && status === 'DONE' && taskForToast.status !== 'DONE' && taskForToast.isRecurring) {
           const nextDate = getNextRecurringDate(taskForToast.dueDate, taskForToast.frequency);
           const formattedDate = new Date(nextDate).toLocaleDateString('ru-RU');
           addToast(`Задача выполнена! Следующий срок: ${formattedDate}`, 'INFO');
      } else if (status === 'DONE') {
          addToast(`Задача выполнена! +${taskForToast?.points} XP`, 'SUCCESS');
      } else {
          TWA.selection();
      }
  };

  // --- Finance Actions ---
  const saveTransaction = (txData: any) => {
      const isUpdate = !!txData.id;
      const txId = txData.id || Math.random().toString(36).substr(2,9);
      let revertData = isUpdate ? data.transactions.find(t => t.id === txId) : null;

      const newTx: Transaction = {
          id: txId,
          createdById: data.currentUser.id,
          date: new Date().toISOString(),
          ...txData,
          ...(revertData ? { createdById: revertData.createdById, date: revertData.date } : {}) 
      };

      setData(prev => {
          let accs = [...prev.accounts];

          // Revert old logic
          if (revertData) {
              accs = accs.map(a => {
                  if (a.id === revertData!.accountId) {
                      const diff = revertData!.type === 'INCOME' ? -revertData!.amount : revertData!.amount;
                      return { ...a, balance: a.balance + diff };
                  }
                  return a;
              });
          }

          // Apply new logic
          accs = accs.map(a => {
              if (a.id === newTx.accountId) {
                  const diff = newTx.type === 'INCOME' ? newTx.amount : -newTx.amount;
                  return { ...a, balance: a.balance + diff };
              }
              return a;
          });

          const goals = prev.goals.map(g => {
              if (g.accountId === newTx.accountId && newTx.type === 'INCOME') {
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

          return { ...prev, accounts: accs, goals, transactions: newTransactions };
      });
      TWA.haptic('medium');
  };

  const saveAccount = (acc: Account, goal?: FinancialGoal) => {
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
      TWA.haptic('light');
  };

  const saveBudgets = (newBudgets: BudgetPlan[]) => {
      setData(prev => ({ ...prev, budgets: newBudgets }));
      TWA.haptic('light');
  };

  // --- Epic Actions ---
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
      TWA.haptic('light');
  };

  // --- Family Actions ---
  const updateUser = (updatedUser: User) => {
      setData(prev => ({
          ...prev,
          members: prev.members.map(m => m.id === updatedUser.id ? updatedUser : m),
          currentUser: prev.currentUser.id === updatedUser.id ? updatedUser : prev.currentUser
      }));
      TWA.haptic('light');
  };

  const buyReward = (reward: Reward) => {
      if (data.currentUser.xp < reward.cost) {
          addToast('Недостаточно XP!', 'ERROR');
          return;
      }

      setData(prev => {
          const newXp = prev.currentUser.xp - reward.cost;
          const updatedUser = { ...prev.currentUser, xp: newXp, level: calculateLevel(newXp) };
          
          const newLog: RewardLog = {
              id: Math.random().toString(),
              userId: updatedUser.id,
              action: 'SPENT',
              amount: reward.cost,
              description: `Купил: ${reward.title}`,
              timestamp: Date.now()
          };

          return {
              ...prev,
              currentUser: updatedUser,
              members: prev.members.map(m => m.id === updatedUser.id ? updatedUser : m),
              rewardLogs: [newLog, ...prev.rewardLogs]
          }
      });
      addToast(`Вы купили: ${reward.title}`, 'SUCCESS');
  };

  return {
    data,
    toasts,
    addToast,
    removeToast,
    actions: {
      app: { switchUser, resetData },
      tasks: { save: saveTask, delete: deleteTask, toggleStatus: toggleTaskStatus },
      finance: { saveTransaction, saveAccount, saveBudgets },
      epics: { save: saveEpic },
      family: { updateUser, buyReward }
    }
  };
};
