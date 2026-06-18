import { AppData, User } from './types';
import { Task, Epic } from './tasks.model';
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

export interface ApiInterface {
    loadData(): Promise<AppData>;
    saveTask(task: Task): Promise<Task>;
    deleteTask(id: string): Promise<void>;
    saveEpic(epic: Epic): Promise<Epic>;
    saveTransaction(tx: Transaction): Promise<Transaction>;
    saveAccount(acc: Account): Promise<Account>;
    saveGoal(goal: FinancialGoal): Promise<FinancialGoal>;
    saveBudgets(budgets: BudgetPlan[]): Promise<BudgetPlan[]>;
    updateUser(user: User): Promise<User>;
    saveRewardLog(log: RewardLog): Promise<RewardLog>;
    saveInventoryItem(item: InventoryItem): Promise<InventoryItem>;
    saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal>;
    saveContribution(contribution: GoalContribution): Promise<GoalContribution>;
    saveSubscription(sub: Subscription): Promise<Subscription>;
    batchUpdate(updates: Partial<AppData>): Promise<void>;
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
        return data;
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
        return this.queue.enqueue(async () => {
            const data = this.getData();
            data.members = data.members.map(member => member.id === user.id ? user : member);
            if (data.currentUser.id === user.id) data.currentUser = user;
            this.saveData(data);
            return user;
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

    async batchUpdate(updates: Partial<AppData>): Promise<void> {
        return this.queue.enqueue(async () => {
            this.saveData({ ...this.getData(), ...updates });
        });
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

    async saveEpic(epic: Epic): Promise<Epic> {
        return this.write('/api/epics/save', { epic }, epic);
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

    async batchUpdate(updates: Partial<AppData>): Promise<void> {
        await this.requestEnvelope('/api/batch', { updates });
    }
}

export const api = new ServerAdapter();
