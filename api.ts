import type { AiResult, AppData, FamilyInvite, FamilySettings, User } from './types';
import type { Task, Epic, SubTask, TaskStatus } from './tasks.model';
import type { Transaction, Account, FinancialGoal, BudgetPlan, SavingsGoal, Subscription } from './finance.model';
import type { Reward } from './family.model';
import type { Note } from './notes.model';
import type { ShoppingCategoryType } from './shopping.model';
import { getTelegramInitData } from './utils';

export interface ApiInterface {
    loadData(): Promise<AppData>;
    saveTask(task: Task): Promise<AppData>;
    deleteTask(id: string): Promise<AppData>;
    setTaskStatus(id: string, status: TaskStatus, beforeTaskId?: string): Promise<AppData>;
    saveEpic(epic: Epic): Promise<AppData>;
    deleteEpic(id: string): Promise<AppData>;
    saveTransaction(tx: Transaction): Promise<AppData>;
    saveAccount(acc: Account, goal?: FinancialGoal): Promise<AppData>;
    saveGoal(goal: FinancialGoal): Promise<AppData>;
    saveBudgets(budgets: BudgetPlan[]): Promise<AppData>;
    saveSavingsGoal(goal: SavingsGoal): Promise<AppData>;
    contributeToSavingsGoal(input: { goalId: string; amount: number; sourceAccountId: string; message?: string }): Promise<AppData>;
    saveSubscription(subscription: Subscription): Promise<AppData>;
    deleteSubscription(id: string): Promise<AppData>;
    paySubscription(id: string): Promise<AppData>;
    addShoppingItem(input: { id: string; title: string; category: ShoppingCategoryType }): Promise<AppData>;
    setShoppingItemCompleted(id: string, completed: boolean): Promise<AppData>;
    deleteShoppingItem(id: string): Promise<AppData>;
    checkoutShopping(input: { itemIds: string[]; totalAmount: number; accountId: string }): Promise<AppData>;
    saveUser(user: User): Promise<AppData>;
    archiveUser(id: string): Promise<AppData>;
    restoreUser(id: string): Promise<AppData>;
    checkIn(): Promise<AppData>;
    saveFamilySettings(settings: FamilySettings): Promise<AppData>;
    saveReward(reward: Reward): Promise<AppData>;
    archiveReward(id: string): Promise<AppData>;
    purchaseReward(id: string): Promise<AppData>;
    useReward(inventoryId: string): Promise<AppData>;
    saveNote(note: Note): Promise<AppData>;
    deleteNote(id: string): Promise<AppData>;
    createFamilyInvite(input?: { role?: User['role']; familyName?: string; newFamily?: boolean }): Promise<{ invite: FamilyInvite; url: string }>;
    acceptFamilyInvite(token: string): Promise<AppData>;
    breakdownTask(input: { title: string; description?: string }): Promise<AiResult<{ title: string; summary: string; subtasks: SubTask[] }>>;
    analyzeExpenses(input?: { prompt?: string }): Promise<AiResult<Record<string, unknown>>>;
}

export class ApiError extends Error {
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

class ServerAdapter implements ApiInterface {
    private latestRevision: number | null = null;
    private requestQueue = new AsyncQueue();

    private authHeaders(): HeadersInit {
        const initData = getTelegramInitData();
        return initData ? { 'X-Telegram-Init-Data': initData } : {};
    }

    private requestEnvelope(path: string, body?: Record<string, unknown>): Promise<AppData> {
        const commandBody = body ? { mutationId: createMutationId(), ...body } : undefined;
        return this.requestQueue.enqueue(() => this.performEnvelopeRequest(path, commandBody));
    }

    private async performEnvelopeRequest(path: string, body?: Record<string, unknown>): Promise<AppData> {
        if (body && this.latestRevision === null) {
            throw new ApiError('Данные семьи ещё не загружены. Обновите экран и повторите действие.', 428);
        }
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await this.fetchEnvelope(path, body);
                if (!response.ok) throw await this.apiError(response);
                const envelope = await response.json();
                if (typeof envelope?.revision !== 'number' || !envelope?.data) {
                    throw new ApiError('FamTrack API returned an invalid state envelope', 502);
                }
                this.latestRevision = envelope.revision;
                return envelope.data as AppData;
            } catch (error) {
                const isLastAttempt = attempt === 1;
                const retryable = !(error instanceof ApiError) || error.status >= 500;
                if (isLastAttempt || !retryable) throw error;
            }
        }
        throw new ApiError('FamTrack API request failed', 502);
    }

    private fetchEnvelope(path: string, body?: Record<string, unknown>) {
        return fetch(path, {
            method: body ? 'POST' : 'GET',
            headers: {
                ...this.authHeaders(),
                ...(body ? { 'Content-Type': 'application/json' } : {})
            },
            body: body ? JSON.stringify({ revision: this.latestRevision, ...body }) : undefined
        });
    }

    private async requestJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
        const response = await fetch(path, {
            method: 'POST',
            headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw await this.apiError(response);
        return response.json() as Promise<T>;
    }

    private async apiError(response: Response) {
        let message = `FamTrack API error ${response.status}`;
        try {
            const payload = await response.json();
            if (payload?.error) message = String(payload.error);
        } catch {
            // Keep the generic status message when the response is not JSON.
        }
        return new ApiError(message, response.status);
    }

    loadData() {
        return this.requestEnvelope('/api/app-data');
    }

    saveTask(task: Task) {
        return this.requestEnvelope('/api/tasks/save', { task });
    }

    deleteTask(id: string) {
        return this.requestEnvelope('/api/tasks/delete', { id });
    }

    setTaskStatus(id: string, status: TaskStatus, beforeTaskId?: string) {
        return this.requestEnvelope('/api/tasks/status', { taskId: id, status, beforeTaskId });
    }

    saveEpic(epic: Epic) {
        return this.requestEnvelope('/api/epics/save', { epic });
    }

    deleteEpic(id: string) {
        return this.requestEnvelope('/api/epics/delete', { id });
    }

    saveTransaction(tx: Transaction) {
        return this.requestEnvelope('/api/transactions/save', { transaction: tx });
    }

    saveAccount(acc: Account, goal?: FinancialGoal) {
        return this.requestEnvelope('/api/accounts/save', { account: acc, ...(goal ? { goal } : {}) });
    }

    saveGoal(goal: FinancialGoal) {
        return this.requestEnvelope('/api/goals/save', { goal });
    }

    saveBudgets(budgets: BudgetPlan[]) {
        return this.requestEnvelope('/api/budgets/save', { budgets });
    }

    saveSavingsGoal(goal: SavingsGoal) {
        return this.requestEnvelope('/api/savings-goals/save', { goal });
    }

    contributeToSavingsGoal(input: { goalId: string; amount: number; sourceAccountId: string; message?: string }) {
        return this.requestEnvelope('/api/savings-goals/contribute', input);
    }

    saveSubscription(subscription: Subscription) {
        return this.requestEnvelope('/api/subscriptions/save', { subscription });
    }

    deleteSubscription(id: string) {
        return this.requestEnvelope('/api/subscriptions/delete', { id });
    }

    paySubscription(id: string) {
        return this.requestEnvelope('/api/subscriptions/pay', { subscriptionId: id });
    }

    addShoppingItem(input: { id: string; title: string; category: ShoppingCategoryType }) {
        return this.requestEnvelope('/api/shopping/items/add', input);
    }

    setShoppingItemCompleted(id: string, completed: boolean) {
        return this.requestEnvelope('/api/shopping/items/set-completed', { id, completed });
    }

    deleteShoppingItem(id: string) {
        return this.requestEnvelope('/api/shopping/items/delete', { id });
    }

    checkoutShopping(input: { itemIds: string[]; totalAmount: number; accountId: string }) {
        return this.requestEnvelope('/api/shopping/checkout', input);
    }

    saveUser(user: User) {
        return this.requestEnvelope('/api/users/save', { user });
    }

    archiveUser(id: string) {
        return this.requestEnvelope('/api/users/archive', { id });
    }

    restoreUser(id: string) {
        return this.requestEnvelope('/api/users/restore', { id });
    }

    checkIn() {
        return this.requestEnvelope('/api/users/check-in', {});
    }

    saveFamilySettings(settings: FamilySettings) {
        return this.requestEnvelope('/api/family/settings', { settings });
    }

    saveReward(reward: Reward) {
        return this.requestEnvelope('/api/rewards/save', { reward });
    }

    archiveReward(id: string) {
        return this.requestEnvelope('/api/rewards/archive', { rewardId: id });
    }

    purchaseReward(id: string) {
        return this.requestEnvelope('/api/rewards/purchase', { rewardId: id });
    }

    useReward(inventoryId: string) {
        return this.requestEnvelope('/api/rewards/use', { inventoryId });
    }

    saveNote(note: Note) {
        return this.requestEnvelope('/api/notes/save', { note });
    }

    deleteNote(id: string) {
        return this.requestEnvelope('/api/notes/delete', { id });
    }

    createFamilyInvite(input: { role?: User['role']; familyName?: string; newFamily?: boolean } = {}) {
        return this.requestJson<{ invite: FamilyInvite; url: string }>('/api/family/invites', input);
    }

    acceptFamilyInvite(token: string) {
        return this.requestQueue.enqueue(async () => {
            const envelope = await this.requestJson<{ revision: number; data: AppData }>('/api/family/invites/accept', { token });
            this.latestRevision = envelope.revision;
            return envelope.data;
        });
    }

    breakdownTask(input: { title: string; description?: string }) {
        return this.requestJson<AiResult<{ title: string; summary: string; subtasks: SubTask[] }>>('/api/ai/task-breakdown', input);
    }

    analyzeExpenses(input: { prompt?: string } = {}) {
        return this.requestJson<AiResult<Record<string, unknown>>>('/api/ai/expense-analysis', input);
    }
}

export const api = new ServerAdapter();

const createMutationId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};
