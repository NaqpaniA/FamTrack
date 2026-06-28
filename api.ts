import { AiResult, AppData, FamilyInvite, User } from './types';
import { Task, Epic, SubTask, TaskStatus } from './tasks.model';
import {
    Transaction,
    Account,
    FinancialGoal,
    BudgetPlan,
    SavingsGoal,
    GoalContribution,
    Subscription
} from './finance.model';
import { RewardLog, InventoryItem } from './family.model';
import { LocalDatabase, getTelegramInitData } from './utils';
import { INITIAL_DATA } from './data';
import { Note } from './notes.model';

export interface ApiInterface {
    loadData(): Promise<AppData>;
    saveTask(task: Task): Promise<Task>;
    deleteTask(id: string): Promise<void>;
    reorderTasks(tasks: Array<{ id: string; status: TaskStatus; sortOrder: number }>): Promise<void>;
    saveEpic(epic: Epic): Promise<Epic>;
    deleteEpic(id: string): Promise<void>;
    saveTransaction(tx: Transaction): Promise<Transaction>;
    saveAccount(acc: Account): Promise<Account>;
    saveGoal(goal: FinancialGoal): Promise<FinancialGoal>;
    saveBudgets(budgets: BudgetPlan[]): Promise<BudgetPlan[]>;
    updateUser(user: User): Promise<User>;
    saveUser(user: User): Promise<User>;
    archiveUser(id: string): Promise<void>;
    restoreUser(id: string): Promise<void>;
    saveRewardLog(log: RewardLog): Promise<RewardLog>;
    saveInventoryItem(item: InventoryItem): Promise<InventoryItem>;
    saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal>;
    saveContribution(contribution: GoalContribution): Promise<GoalContribution>;
    saveSubscription(sub: Subscription): Promise<Subscription>;
    saveNote(note: Note): Promise<Note>;
    deleteNote(id: string): Promise<void>;
    batchUpdate(updates: Partial<AppData>): Promise<void>;
    createFamilyInvite(input?: { role?: User['role']; familyName?: string; newFamily?: boolean }): Promise<{ invite: FamilyInvite; url: string }>;
    acceptFamilyInvite(token: string): Promise<AppData>;
    breakdownTask(input: { title: string; description?: string }): Promise<AiResult<{ title: string; summary: string; subtasks: SubTask[] }>>;
    analyzeExpenses(input?: { prompt?: string }): Promise<AiResult<Record<string, unknown>>>;
}

class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

class AsyncQueue {
    private queue: Promise<unknown> = Promise.resolve();

    enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.queue.then(operation);
        this.queue = next.catch(() => undefined);
        return next;
    }
}

class LocalAdapter implements ApiInterface {
    private queue = new AsyncQueue();

    private getData(): AppData {
        const data = LocalDatabase.load();
        if (!data.tasks) return INITIAL_DATA;
        if (!data.savingsGoals) data.savingsGoals = [];
        if (!data.contributions) data.contributions = [];
        if (!data.shoppingList) data.shoppingList = [];
        if (!data.subscriptions) data.subscriptions = [];
        if (!data.events) data.events = [];
        if (!data.notes) data.notes = [];
        const members = this.allMembers(data).map(member => ({
            ...member,
            isActive: member.id === 'u4' && member.name === 'Дочь' && member.role === 'CHILD' && !member.telegramId
                ? false
                : member.isActive ?? true
        }));
        return this.splitMembers(data, members);
    }

    private allMembers(data: AppData): User[] {
        const archived = data.archivedMembers || [];
        return [
            ...data.members,
            ...archived.filter(user => !data.members.some(member => member.id === user.id))
        ];
    }

    private splitMembers(data: AppData, members: User[]): AppData {
        return {
            ...data,
            members: members.filter(member => member.isActive !== false),
            archivedMembers: members.filter(member => member.isActive === false)
        };
    }

    private saveData(data: AppData) {
        LocalDatabase.save(data);
    }

    async loadData(): Promise<AppData> {
        return this.queue.enqueue(async () => this.getData());
    }

    async saveTask(task: Task): Promise<Task> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) data.tasks[idx] = task;
            else data.tasks.push(task);
            this.saveData(data);
            return task;
        });
    }

    async deleteTask(id: string): Promise<void> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.tasks = data.tasks.filter(t => t.id !== id);
            this.saveData(data);
        });
    }

    async reorderTasks(tasks: Array<{ id: string; status: TaskStatus; sortOrder: number }>): Promise<void> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const updates = new Map(tasks.map(task => [task.id, task]));
            data.tasks = data.tasks.map(task => {
                const update = updates.get(task.id);
                return update ? { ...task, status: update.status, sortOrder: update.sortOrder } : task;
            });
            this.saveData(data);
        });
    }

    async saveEpic(epic: Epic): Promise<Epic> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.epics.findIndex(e => e.id === epic.id);
            if (idx >= 0) data.epics[idx] = epic;
            else data.epics.push(epic);
            this.saveData(data);
            return epic;
        });
    }

    async deleteEpic(id: string): Promise<void> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.epics = data.epics.filter(epic => epic.id !== id);
            data.tasks = data.tasks.map(task => task.epicId === id ? { ...task, epicId: undefined } : task);
            data.goals = data.goals.map(goal => goal.epicId === id ? { ...goal, epicId: undefined } : goal);
            this.saveData(data);
        });
    }

    async saveTransaction(tx: Transaction): Promise<Transaction> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.transactions.findIndex(t => t.id === tx.id);
            if (idx >= 0) data.transactions[idx] = tx;
            else data.transactions.unshift(tx);
            this.saveData(data);
            return tx;
        });
    }

    async saveAccount(acc: Account): Promise<Account> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.accounts.findIndex(a => a.id === acc.id);
            if (idx >= 0) data.accounts[idx] = acc;
            else data.accounts.push(acc);
            this.saveData(data);
            return acc;
        });
    }

    async saveGoal(goal: FinancialGoal): Promise<FinancialGoal> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.goals.findIndex(g => g.id === goal.id);
            if (idx >= 0) data.goals[idx] = goal;
            else data.goals.push(goal);
            this.saveData(data);
            return goal;
        });
    }

    async saveBudgets(budgets: BudgetPlan[]): Promise<BudgetPlan[]> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.budgets = budgets;
            this.saveData(data);
            return budgets;
        });
    }

    async updateUser(user: User): Promise<User> {
        return this.saveUser(user);
    }

    async saveUser(user: User): Promise<User> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const members = this.allMembers(data);
            const nextUser = { ...user, isActive: user.isActive !== false };
            const idx = members.findIndex(member => member.id === nextUser.id);
            const nextMembers = [...members];
            if (idx >= 0) nextMembers[idx] = nextUser;
            else nextMembers.push(nextUser);
            const nextData = this.splitMembers(data, nextMembers);
            if (nextData.currentUser.id === nextUser.id) nextData.currentUser = nextUser;
            this.saveData(nextData);
            return user;
        });
    }

    async archiveUser(id: string): Promise<void> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const members = this.allMembers(data).map(member => member.id === id ? { ...member, isActive: false } : member);
            this.saveData(this.splitMembers(data, members));
        });
    }

    async restoreUser(id: string): Promise<void> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const members = this.allMembers(data).map(member => member.id === id ? { ...member, isActive: true } : member);
            this.saveData(this.splitMembers(data, members));
        });
    }

    async saveRewardLog(log: RewardLog): Promise<RewardLog> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.rewardLogs.unshift(log);
            this.saveData(data);
            return log;
        });
    }

    async saveInventoryItem(item: InventoryItem): Promise<InventoryItem> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.inventory.findIndex(i => i.id === item.id);
            if (idx >= 0) data.inventory[idx] = item;
            else data.inventory.push(item);
            this.saveData(data);
            return item;
        });
    }

    async saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.savingsGoals.findIndex(g => g.id === goal.id);
            if (idx >= 0) data.savingsGoals[idx] = goal;
            else data.savingsGoals.push(goal);
            this.saveData(data);
            return goal;
        });
    }

    async saveContribution(contribution: GoalContribution): Promise<GoalContribution> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.contributions.unshift(contribution);
            this.saveData(data);
            return contribution;
        });
    }

    async saveSubscription(sub: Subscription): Promise<Subscription> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.subscriptions.findIndex(s => s.id === sub.id);
            if (idx >= 0) data.subscriptions[idx] = sub;
            else data.subscriptions.push(sub);
            this.saveData(data);
            return sub;
        });
    }

    async saveNote(note: Note): Promise<Note> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            const idx = data.notes.findIndex(item => item.id === note.id);
            if (idx >= 0) data.notes[idx] = note;
            else data.notes.unshift(note);
            this.saveData(data);
            return note;
        });
    }

    async deleteNote(id: string): Promise<void> {
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.notes = data.notes.filter(note => note.id !== id);
            this.saveData(data);
        });
    }

    async batchUpdate(updates: Partial<AppData>): Promise<void> {
        return this.queue.enqueue(async () => {
            const current = this.getData();
            const next = { ...current, ...updates };
            if (updates.members) {
                const incomingById = new Map(updates.members.map(member => [member.id, member]));
                const merged = this.allMembers(current).map(member => incomingById.get(member.id) || member);
                const existingIds = new Set(merged.map(member => member.id));
                for (const member of updates.members) {
                    if (!existingIds.has(member.id)) merged.push(member);
                }
                return this.saveData(this.splitMembers(next, merged));
            }
            this.saveData(next);
        });
    }

    async createFamilyInvite(): Promise<{ invite: FamilyInvite; url: string }> {
        const token = `local-${Date.now()}`;
        return {
            invite: {
                token,
                familyId: 'local',
                role: 'CHILD',
                createdById: this.getData().currentUser.id,
                createdAt: Date.now()
            },
            url: `${window.location.origin}${window.location.pathname}?invite=${token}`
        };
    }

    async acceptFamilyInvite(): Promise<AppData> {
        return this.getData();
    }

    async breakdownTask(input: { title: string; description?: string }) {
        const parts = (input.description || '')
            .split(/[\n.;]+/g)
            .map(part => part.trim())
            .filter(Boolean)
            .slice(0, 8);
        return {
            cached: false,
            model: 'local-fallback',
            remainingToday: 999,
            result: {
                title: input.title,
                summary: 'Локальная декомпозиция',
                subtasks: (parts.length ? parts : ['Уточнить результат', 'Сделать основной шаг', 'Проверить']).map(title => ({
                    id: Math.random().toString(36).slice(2),
                    title,
                    isCompleted: false
                }))
            }
        };
    }

    async analyzeExpenses() {
        const data = this.getData();
        const totalExpenses = data.transactions
            .filter(tx => tx.type === 'EXPENSE')
            .reduce((sum, tx) => sum + tx.amount, 0);
        return {
            cached: false,
            model: 'local-fallback',
            remainingToday: 999,
            result: {
                totalExpenses,
                summary: `Расходы в локальном режиме: ${totalExpenses}`,
                suggestions: ['Настройте серверный API для полного анализа.']
            }
        };
    }
}

class ServerAdapter implements ApiInterface {
    private latestRevision: number | null = null;
    private fallback = new LocalAdapter();
    private warnedAboutFallback = false;

    private authHeaders(): HeadersInit {
        const initData = getTelegramInitData();
        return initData ? { 'X-Telegram-Init-Data': initData } : {};
    }

    private async requestEnvelope(path: string, body?: Record<string, unknown>): Promise<AppData> {
        const headers: HeadersInit = {
            ...this.authHeaders(),
            ...(body ? { 'Content-Type': 'application/json' } : {})
        };
        const response = await fetch(path, {
            method: body ? 'POST' : 'GET',
            headers,
            body: body ? JSON.stringify({ revision: this.latestRevision, ...body }) : undefined
        });

        if (!response.ok) {
            let message = `FamTrack API error ${response.status}`;
            try {
                const payload = await response.json();
                if (payload?.error) message = payload.error;
            } catch {
                // Keep the generic status message.
            }
            throw new ApiError(message, response.status);
        }

        const envelope = await response.json();
        this.latestRevision = envelope.revision;
        return envelope.data;
    }

    private async requestJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
        const response = await fetch(path, {
            method: 'POST',
            headers: {
                ...this.authHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!response.ok) {
            let message = `FamTrack API error ${response.status}`;
            try {
                const payload = await response.json();
                if (payload?.error) message = payload.error;
            } catch {
                // Keep the generic status message.
            }
            throw new ApiError(message, response.status);
        }
        return response.json();
    }

    private async write<T>(path: string, body: Record<string, unknown>, value: T): Promise<T> {
        await this.requestEnvelope(path, body);
        return value;
    }

    private shouldUseLocalFallback(error: unknown) {
        const host = window.location.hostname;
        return error instanceof TypeError && (host === 'localhost' || host === '127.0.0.1');
    }

    private warnLocalFallback() {
        if (this.warnedAboutFallback) return;
        this.warnedAboutFallback = true;
        console.warn('FamTrack API is unavailable; using localStorage fallback for local development.');
    }

    async loadData(): Promise<AppData> {
        try {
            return await this.requestEnvelope('/api/app-data');
        } catch (error) {
            if (this.shouldUseLocalFallback(error)) {
                this.warnLocalFallback();
                return this.fallback.loadData();
            }
            throw error;
        }
    }

    async saveTask(task: Task): Promise<Task> {
        return this.write('/api/tasks/save', { task }, task);
    }

    async deleteTask(id: string): Promise<void> {
        await this.requestEnvelope('/api/tasks/delete', { id });
    }

    async reorderTasks(tasks: Array<{ id: string; status: TaskStatus; sortOrder: number }>): Promise<void> {
        await this.requestEnvelope('/api/tasks/reorder', { tasks });
    }

    async saveEpic(epic: Epic): Promise<Epic> {
        return this.write('/api/epics/save', { epic }, epic);
    }

    async deleteEpic(id: string): Promise<void> {
        await this.requestEnvelope('/api/epics/delete', { id });
    }

    async saveTransaction(tx: Transaction): Promise<Transaction> {
        return this.write('/api/transactions/save', { transaction: tx }, tx);
    }

    async saveAccount(acc: Account): Promise<Account> {
        return this.write('/api/accounts/save', { account: acc }, acc);
    }

    async saveGoal(goal: FinancialGoal): Promise<FinancialGoal> {
        return this.write('/api/goals/save', { goal }, goal);
    }

    async saveBudgets(budgets: BudgetPlan[]): Promise<BudgetPlan[]> {
        return this.write('/api/budgets/save', { budgets }, budgets);
    }

    async updateUser(user: User): Promise<User> {
        return this.write('/api/users/update', { user }, user);
    }

    async saveUser(user: User): Promise<User> {
        return this.write('/api/users/save', { user }, user);
    }

    async archiveUser(id: string): Promise<void> {
        await this.requestEnvelope('/api/users/archive', { id });
    }

    async restoreUser(id: string): Promise<void> {
        await this.requestEnvelope('/api/users/restore', { id });
    }

    async saveRewardLog(log: RewardLog): Promise<RewardLog> {
        return this.write('/api/reward-logs/save', { log }, log);
    }

    async saveInventoryItem(item: InventoryItem): Promise<InventoryItem> {
        return this.write('/api/inventory/save', { item }, item);
    }

    async saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal> {
        return this.write('/api/savings-goals/save', { goal }, goal);
    }

    async saveContribution(contribution: GoalContribution): Promise<GoalContribution> {
        return this.write('/api/contributions/save', { contribution }, contribution);
    }

    async saveSubscription(sub: Subscription): Promise<Subscription> {
        return this.write('/api/subscriptions/save', { subscription: sub }, sub);
    }

    async saveNote(note: Note): Promise<Note> {
        return this.write('/api/notes/save', { note }, note);
    }

    async deleteNote(id: string): Promise<void> {
        await this.requestEnvelope('/api/notes/delete', { id });
    }

    async batchUpdate(updates: Partial<AppData>): Promise<void> {
        await this.requestEnvelope('/api/batch', { updates });
    }

    async createFamilyInvite(input: { role?: User['role']; familyName?: string; newFamily?: boolean } = {}) {
        return this.requestJson<{ invite: FamilyInvite; url: string }>('/api/family/invites', input);
    }

    async acceptFamilyInvite(token: string): Promise<AppData> {
        const envelope = await this.requestJson<{ revision: number; data: AppData }>('/api/family/invites/accept', { token });
        this.latestRevision = envelope.revision;
        return envelope.data;
    }

    async breakdownTask(input: { title: string; description?: string }) {
        return this.requestJson<AiResult<{ title: string; summary: string; subtasks: SubTask[] }>>('/api/ai/task-breakdown', input);
    }

    async analyzeExpenses(input: { prompt?: string } = {}) {
        return this.requestJson<AiResult<Record<string, unknown>>>('/api/ai/expense-analysis', input);
    }
}

export const api = new ServerAdapter();
