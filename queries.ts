
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { AppData, FamilySettings, User } from './types';
import { Task, Epic } from './tasks.model';
import { Reward } from './family.model';
import { Transaction, Account, FinancialGoal, BudgetPlan, SavingsGoal, Subscription } from './finance.model';
import { Note } from './notes.model';
import { ShoppingCategoryType } from './shopping.model';
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
        staleTime: 1000,
        refetchInterval: 4000,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: 'always',
        refetchOnReconnect: 'always',
    });
};

export const useMutations = () => {
    const queryClient = useQueryClient();

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: KEYS.DATA });
    };

    // Helper to get current data from cache for optimistic updates
    const getData = (): AppData => {
        const data = queryClient.getQueryData<AppData>(KEYS.DATA);
        if (!data) {
            throw new Error('Данные семьи ещё не загружены');
        }
        return data;
    };

    // Helper to set data in cache
    const setData = (newData: AppData) => {
        queryClient.setQueryData(KEYS.DATA, newData);
    };

    const syncServerData = (serverData: AppData) => setData(serverData);

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
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        setTaskStatus: useMutation({
            mutationFn: ({ id, status, beforeTaskId }: { id: string; status: Task['status']; beforeTaskId?: string }) => (
                api.setTaskStatus(id, status, beforeTaskId)
            ),
            onMutate: async ({ id, status, beforeTaskId }) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                const task = prevData.tasks.find(item => item.id === id);
                if (!task) return { prevData };
                const column = prevData.tasks
                    .filter(item => item.id !== id && item.status === status)
                    .sort((left, right) => (left.sortOrder ?? left.createdAt) - (right.sortOrder ?? right.createdAt));
                const rawIndex = beforeTaskId ? column.findIndex(item => item.id === beforeTaskId) : column.length;
                column.splice(rawIndex < 0 ? column.length : rawIndex, 0, { ...task, status });
                const ordered = new Map(column.map((item, index) => [item.id, (index + 1) * 1000]));
                setData({
                    ...prevData,
                    tasks: prevData.tasks.map(item => ordered.has(item.id)
                        ? { ...item, status, sortOrder: ordered.get(item.id) }
                        : item)
                });
                return { prevData };
            },
            onError: (error, input, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        saveAccount: useMutation({
            mutationFn: ({ acc, goal }: { acc: Account, goal?: FinancialGoal }) => api.saveAccount(acc, goal),
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        saveUser: useMutation({
            mutationFn: (user: User) => api.saveUser(user),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        archiveUser: useMutation({
            mutationFn: (id: string) => api.archiveUser(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        restoreUser: useMutation({
            mutationFn: (id: string) => api.restoreUser(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        checkIn: useMutation({
            mutationFn: () => api.checkIn(),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        saveFamilySettings: useMutation({
            mutationFn: (settings: FamilySettings) => api.saveFamilySettings(settings),
            onMutate: async (settings) => {
                await queryClient.cancelQueries({ queryKey: KEYS.DATA });
                const prevData = getData();
                if (prevData.family) {
                    setData({ ...prevData, family: { ...prevData.family, settings } });
                }
                return { prevData };
            },
            onError: (error, settings, context) => {
                if (context?.prevData) setData(context.prevData);
                TWA.notification('error');
            },
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        saveReward: useMutation({
            mutationFn: (reward: Reward) => api.saveReward(reward),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        archiveReward: useMutation({
            mutationFn: (id: string) => api.archiveReward(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        purchaseReward: useMutation({
            mutationFn: (id: string) => api.purchaseReward(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        useReward: useMutation({
            mutationFn: (inventoryId: string) => api.useReward(inventoryId),
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
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
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        saveSavingsGoal: useMutation({
            mutationFn: (goal: SavingsGoal) => api.saveSavingsGoal(goal),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        contributeToSavingsGoal: useMutation({
            mutationFn: (input: { goalId: string; amount: number; sourceAccountId: string; message?: string }) => (
                api.contributeToSavingsGoal(input)
            ),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        saveSubscription: useMutation({
            mutationFn: (subscription: Subscription) => api.saveSubscription(subscription),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        deleteSubscription: useMutation({
            mutationFn: (id: string) => api.deleteSubscription(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        paySubscription: useMutation({
            mutationFn: (id: string) => api.paySubscription(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        addShoppingItem: useMutation({
            mutationFn: (input: { id: string; title: string; category: ShoppingCategoryType }) => api.addShoppingItem(input),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        setShoppingItemCompleted: useMutation({
            mutationFn: (input: { id: string; completed: boolean }) => api.setShoppingItemCompleted(input.id, input.completed),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        deleteShoppingItem: useMutation({
            mutationFn: (id: string) => api.deleteShoppingItem(id),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        }),

        checkoutShopping: useMutation({
            mutationFn: (input: { itemIds: string[]; totalAmount: number; accountId: string }) => api.checkoutShopping(input),
            onSuccess: syncServerData,
            onSettled: () => invalidate()
        })
    };
};
