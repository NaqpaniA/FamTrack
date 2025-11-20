
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { AppData, User } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account, FinancialGoal, BudgetPlan } from './finance.model';
import { Reward, RewardLog } from './family.model';
import { INITIAL_DATA } from './data';
import { TWA } from './utils';

// Keys
export const KEYS = {
    DATA: ['appData'],
};

// --- Hooks ---

export const useFamilyData = () => {
    return useQuery({
        queryKey: KEYS.DATA,
        queryFn: () => api.loadData(),
        initialData: INITIAL_DATA,
        staleTime: 1000 * 60 * 5, // 5 minutes considered fresh
    });
};

export const useMutations = () => {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: KEYS.DATA });
    };

    // Helper to get current data from cache for optimistic updates
    const getData = (): AppData => {
        return queryClient.getQueryData(KEYS.DATA) || INITIAL_DATA;
    };

    // Helper to set data in cache
    const setData = (newData: AppData) => {
        queryClient.setQueryData(KEYS.DATA, newData);
    };

    return {
        saveTask: useMutation({
            mutationFn: (task: Task) => api.saveTask(task),
            onMutate: async (newTask) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                
                // Optimistic Update
                const existingIdx = prevData.tasks.findIndex(t => t.id === newTask.id);
                const newTasks = [...prevData.tasks];
                if (existingIdx >= 0) newTasks[existingIdx] = newTask;
                else newTasks.push(newTask);
                
                setData({ ...prevData, tasks: newTasks });
                return { prevData };
            },
            onError: (err, newTask, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        }),

        deleteTask: useMutation({
            mutationFn: (id: string) => api.deleteTask(id),
            onMutate: async (id) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                setData({ ...prevData, tasks: prevData.tasks.filter(t => t.id !== id) });
                return { prevData };
            },
            onSettled: () => invalidate()
        }),

        saveTransaction: useMutation({
            mutationFn: (tx: Transaction) => api.saveTransaction(tx),
            onMutate: async (tx) => {
                // Note: Simple optimistic update. 
                // Complex logic (balance updates) usually handled by refetching 
                // or replicating business logic here. 
                // For now, we rely on 'onSettled' to sync correct balances from backend/api.
            },
            onSettled: () => invalidate()
        }),

        saveAccount: useMutation({
            mutationFn: async ({ acc, goal }: { acc: Account, goal?: FinancialGoal }) => {
                await api.saveAccount(acc);
                if (goal) await api.saveGoal(goal);
            },
            onSettled: () => invalidate()
        }),

        saveBudgets: useMutation({
            mutationFn: (budgets: BudgetPlan[]) => api.saveBudgets(budgets),
            onMutate: async (budgets) => {
                const prevData = getData();
                setData({ ...prevData, budgets });
                return { prevData };
            },
            onSettled: () => invalidate()
        }),
        
        saveEpic: useMutation({
            mutationFn: (epic: Epic) => api.saveEpic(epic),
            onSettled: () => invalidate()
        }),

        // Special mutation for handling complex logic (Buying Reward, Completing Task)
        // In a real backend, this would be a single API endpoint /rpc/complete_task
        batchUpdate: useMutation({
            mutationFn: (updates: Partial<AppData>) => api.batchUpdate(updates),
            onMutate: async (updates) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                setData({ ...prevData, ...updates });
                return { prevData };
            },
            onSettled: () => invalidate()
        })
    };
};
