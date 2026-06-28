
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { AppData, User } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account, FinancialGoal, BudgetPlan } from './finance.model';
import { Note } from './notes.model';
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
            onError: (err, id, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        }),

        reorderTasks: useMutation({
            mutationFn: (tasks: Array<{ id: string; status: Task['status']; sortOrder: number }>) => api.reorderTasks(tasks),
            onMutate: async (updates) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                const byId = new Map(updates.map(update => [update.id, update]));
                setData({
                    ...prevData,
                    tasks: prevData.tasks.map(task => {
                        const update = byId.get(task.id);
                        return update ? { ...task, status: update.status, sortOrder: update.sortOrder } : task;
                    })
                });
                return { prevData };
            },
            onError: (err, updates, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
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
            onError: (err, budgets, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        }),
        
        saveEpic: useMutation({
            mutationFn: (epic: Epic) => api.saveEpic(epic),
            onMutate: async (epic) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                const existingIdx = prevData.epics.findIndex(item => item.id === epic.id);
                const epics = [...prevData.epics];
                if (existingIdx >= 0) epics[existingIdx] = epic;
                else epics.push(epic);
                setData({ ...prevData, epics });
                return { prevData };
            },
            onError: (err, epic, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        }),

        deleteEpic: useMutation({
            mutationFn: (id: string) => api.deleteEpic(id),
            onMutate: async (id) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                setData({
                    ...prevData,
                    epics: prevData.epics.filter(epic => epic.id !== id),
                    tasks: prevData.tasks.map(task => task.epicId === id ? { ...task, epicId: undefined } : task),
                    goals: prevData.goals.map(goal => goal.epicId === id ? { ...goal, epicId: undefined } : goal)
                });
                return { prevData };
            },
            onError: (err, id, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        }),

        saveUser: useMutation({
            mutationFn: (user: User) => api.saveUser(user),
            onSettled: () => invalidate()
        }),

        archiveUser: useMutation({
            mutationFn: (id: string) => api.archiveUser(id),
            onSettled: () => invalidate()
        }),

        restoreUser: useMutation({
            mutationFn: (id: string) => api.restoreUser(id),
            onSettled: () => invalidate()
        }),

        saveNote: useMutation({
            mutationFn: (note: Note) => api.saveNote(note),
            onMutate: async (note) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                const notes = [...(prevData.notes || [])];
                const existingIdx = notes.findIndex(item => item.id === note.id);
                if (existingIdx >= 0) notes[existingIdx] = note;
                else notes.unshift(note);
                setData({ ...prevData, notes });
                return { prevData };
            },
            onError: (err, note, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        }),

        deleteNote: useMutation({
            mutationFn: (id: string) => api.deleteNote(id),
            onMutate: async (id) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                setData({ ...prevData, notes: (prevData.notes || []).filter(note => note.id !== id) });
                return { prevData };
            },
            onError: (err, id, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
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
            onError: (err, updates, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSettled: () => invalidate()
        })
    };
};
