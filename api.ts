import type { AiResult, AppData, DashboardPreferences, FamilyInvite, FamilySettings, User } from './types';
import type { Task, Epic, SubTask, TaskStatus } from './tasks.model';
import type { Transaction, Account, FinancialGoal, BudgetPlan, SavingsGoal, Subscription } from './finance.model';
import type { Reward } from './family.model';
import type { Note } from './notes.model';
import type { ShoppingCategoryType } from './shopping.model';
import type { RoutineTemplate } from './routines.model';
import type { Wishlist, WishlistItem } from './wishlist.model';
import type { PurchaseImportJob } from './purchase-import.model';
import { getTelegramInitData } from './utils';
import {
    createOutboxRecord,
    ResilientOutboxPersistence,
    type CommandEnvelope,
    type OutboxRecord,
    type OutboxPersistence
} from './outbox';

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
    saveRoutine(routine: Partial<RoutineTemplate> & { presetId?: string }): Promise<AppData>;
    pauseRoutine(routineId: string, paused: boolean): Promise<AppData>;
    completeRoutine(input: { routineId: string; taskId?: string; units?: number }): Promise<AppData>;
    recordRoutineUnit(routineId: string, units?: number): Promise<AppData>;
    skipRoutine(routineId: string): Promise<AppData>;
    saveDashboardPreferences(preferences: Partial<DashboardPreferences>): Promise<AppData>;
    saveWishlist(wishlist: Partial<Wishlist>): Promise<AppData>;
    saveWishlistItem(item: Partial<WishlistItem> & { wishlistId: string }): Promise<AppData>;
    deleteWishlistItem(wishlistId: string, itemId: string): Promise<AppData>;
    reserveWishlistItem(wishlistId: string, itemId: string, reserved: boolean): Promise<AppData>;
    adjustPantry(input: {
        productId?: string;
        quantityDelta?: number;
        type?: string;
        name?: string;
        barcode?: string;
        unit?: string;
        location?: string;
        note?: string;
        finished?: boolean;
    }): Promise<AppData>;
    createPurchaseImport(input: {
        id: string;
        source: 'BARCODE' | 'RECEIPT';
        stockOnly?: boolean;
        accountId?: string;
        totalAmount?: number;
        merchant?: string;
    }): Promise<AppData>;
    updatePurchaseImport(importId: string, input: Partial<PurchaseImportJob>): Promise<AppData>;
    addPurchaseBarcode(importId: string, input: { barcode: string; name?: string; quantity?: number; unit?: string; location?: string }): Promise<AppData>;
    savePurchaseImportItem(importId: string, item: Partial<PurchaseImportJob['items'][number]>): Promise<AppData>;
    confirmPurchaseImport(importId: string): Promise<AppData>;
    loadPurchaseImport(importId: string): Promise<PurchaseImportJob>;
    listPurchaseImports(): Promise<PurchaseImportJob[]>;
    uploadPurchaseImportPage(importId: string, page: number, file: Blob): Promise<AppData>;
    processPurchaseImport(importId: string): Promise<AppData>;
    cancelPurchaseImport(importId: string): Promise<AppData>;
}

export class ApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
    }
}

export type SaveState = {
    status: 'SAVED' | 'SAVING' | 'CHECK';
    pending: number;
    attempts: number;
    message?: string;
};

class AsyncQueue {
    private queue: Promise<unknown> = Promise.resolve();

    enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.queue.then(operation);
        this.queue = next.catch(() => undefined);
        return next;
    }
}

export class ServerAdapter implements ApiInterface {
    private latestRevision: number | null = null;
    private latestData?: AppData;
    private latestEtag?: string;
    private requestQueue = new AsyncQueue();
    private readonly outbox: OutboxPersistence;
    private saveState: SaveState = { status: 'SAVED', pending: 0, attempts: 0 };
    private readonly saveStateListeners = new Set<(state: SaveState) => void>();
    private readonly dataListeners = new Set<(data: AppData) => void>();
    private flushScheduled = false;

    constructor(outbox: OutboxPersistence = new ResilientOutboxPersistence()) {
        this.outbox = outbox;
        void this.refreshSaveState();
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.scheduleOutboxReplay());
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') this.scheduleOutboxReplay();
            });
        }
    }

    getSaveState() {
        return this.saveState;
    }

    subscribeSaveState(listener: (state: SaveState) => void) {
        this.saveStateListeners.add(listener);
        listener(this.saveState);
        return () => { this.saveStateListeners.delete(listener); };
    }

    subscribeData(listener: (data: AppData) => void) {
        this.dataListeners.add(listener);
        return () => { this.dataListeners.delete(listener); };
    }

    retryOutbox() {
        return this.requestQueue.enqueue(() => this.flushThrough());
    }

    private authHeaders(): HeadersInit {
        const initData = getTelegramInitData();
        return initData ? { 'X-Telegram-Init-Data': initData } : {};
    }

    private async requestEnvelope(path: string, body?: Record<string, unknown>): Promise<AppData> {
        if (!body) return this.performLoadRequest(path);
        if (this.latestRevision === null) {
            throw new ApiError('Данные семьи ещё не загружены. Обновите экран и повторите действие.', 428);
        }

        const envelope: CommandEnvelope = {
            revision: this.latestRevision,
            mutationId: createMutationId(),
            ...body
        };
        const record = createOutboxRecord(path, envelope);
        await this.outbox.put(record);
        await this.refreshSaveState();
        return this.requestQueue.enqueue(() => this.flushThrough(record.mutationId));
    }

    private async requestBinaryEnvelope(path: string, binary: Blob): Promise<AppData> {
        if (this.latestRevision === null) {
            throw new ApiError('Данные семьи ещё не загружены. Обновите экран и повторите действие.', 428);
        }
        const digest = await crypto.subtle.digest('SHA-256', await binary.arrayBuffer());
        const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
        const envelope: CommandEnvelope = {
            revision: this.latestRevision,
            mutationId: createMutationId(),
            sha256,
            sizeBytes: binary.size,
            mimeType: binary.type
        };
        const record = createOutboxRecord(path, envelope, Date.now(), binary, binary.type || 'application/octet-stream');
        await this.outbox.put(record);
        await this.refreshSaveState();
        return this.requestQueue.enqueue(() => this.flushThrough(record.mutationId));
    }

    private async performLoadRequest(path: string): Promise<AppData> {
        const response = await fetch(path, {
            headers: {
                ...this.authHeaders(),
                ...(this.latestEtag ? { 'If-None-Match': this.latestEtag } : {})
            }
        });
        if (response.status === 304) {
            if (!this.latestData) throw new ApiError('FamTrack API returned 304 without cached data', 502);
            this.scheduleOutboxReplay();
            return this.latestData;
        }
        if (!response.ok) throw await this.apiError(response);
        const envelope = await response.json();
        if (typeof envelope?.revision !== 'number' || !envelope?.data) {
            throw new ApiError('FamTrack API returned an invalid state envelope', 502);
        }
        this.latestRevision = envelope.revision;
        this.latestData = envelope.data as AppData;
        this.latestEtag = response.headers.get('etag') || undefined;
        this.scheduleOutboxReplay();
        return this.latestData;
    }

    private async deliverRecord(record: OutboxRecord): Promise<AppData> {
        const nextRecord: OutboxRecord = {
            ...record,
            attempts: record.attempts + 1,
            lastAttemptAt: Date.now(),
            lastError: undefined
        };
        await this.outbox.put(nextRecord);
        await this.refreshSaveState();

        try {
            const response = await fetch(record.path, {
                method: 'POST',
                headers: {
                    ...this.authHeaders(),
                    'Content-Type': record.binary ? record.contentType || 'application/octet-stream' : 'application/json',
                    ...(record.binary ? {
                        'X-FamTrack-Revision': String(record.envelope.revision),
                        'X-FamTrack-Mutation-Id': record.mutationId,
                        'X-FamTrack-File-SHA256': String(record.envelope.sha256 || '')
                    } : {}),
                    'X-FamTrack-Outbox-Retry': String(Math.max(0, nextRecord.attempts - 1))
                },
                body: record.binary || JSON.stringify(record.envelope)
            });
            if (!response.ok) {
                const error = await this.apiError(response);
                await this.recordDeliveryFailure(nextRecord, error, error.status < 500);
                throw error;
            }
            const envelope = await response.json();
            if (typeof envelope?.revision !== 'number'
                || !envelope?.data
                || envelope?.command?.mutationId !== record.mutationId) {
                const error = new ApiError('FamTrack API returned an invalid command acknowledgement', 502);
                await this.recordDeliveryFailure(nextRecord, error, false);
                throw error;
            }
            this.latestRevision = envelope.revision;
            this.latestData = envelope.data as AppData;
            this.latestEtag = response.headers.get('etag') || undefined;
            await this.outbox.remove(record.mutationId);
            await this.refreshSaveState();
            for (const listener of this.dataListeners) listener(this.latestData);
            return this.latestData;
        } catch (error) {
            if (!(error instanceof ApiError)) {
                await this.recordDeliveryFailure(
                    nextRecord,
                    error instanceof Error ? error : new Error('Network request failed'),
                    false
                );
            }
            throw error;
        }
    }

    private async recordDeliveryFailure(record: OutboxRecord, error: Error, needsReview: boolean) {
        await this.outbox.put({
            ...record,
            lastError: error.message.slice(0, 300),
            needsReview: record.needsReview || needsReview
        });
        await this.refreshSaveState();
    }

    private async flushThrough(targetMutationId?: string): Promise<AppData> {
        const records = await this.outbox.list();
        let lastData = this.latestData;
        for (const record of records) {
            if (record.needsReview) {
                if (record.mutationId === targetMutationId) {
                    throw new ApiError(record.lastError || 'Команда требует проверки', 409);
                }
                continue;
            }
            try {
                lastData = await this.deliverRecord(record);
            } catch (error) {
                if (record.mutationId === targetMutationId) throw error;
                const retryable = !(error instanceof ApiError) || error.status >= 500;
                if (retryable) break;
            }
            if (record.mutationId === targetMutationId && lastData) return lastData;
        }

        if (targetMutationId) {
            const pending = await this.outbox.get(targetMutationId);
            if (pending) throw new ApiError(pending.lastError || 'Команда ожидает соединения', 503);
        }
        if (!lastData) throw new ApiError('Данные семьи ещё не загружены', 428);
        return lastData;
    }

    private scheduleOutboxReplay() {
        if (this.flushScheduled) return;
        this.flushScheduled = true;
        void this.requestQueue.enqueue(async () => {
            this.flushScheduled = false;
            try {
                await this.flushThrough();
            } catch {
                // The exact envelope remains durable and will be replayed on the next poll/foreground/reconnect.
            }
        });
    }

    private async refreshSaveState() {
        const records = await this.outbox.list();
        const attempts = records.reduce((total, record) => total + record.attempts, 0);
        const attention = records.some(record => record.needsReview || record.attempts >= 5);
        const next: SaveState = records.length === 0
            ? { status: 'SAVED', pending: 0, attempts: 0 }
            : attention
                ? {
                    status: 'CHECK',
                    pending: records.length,
                    attempts,
                    message: records.find(record => record.lastError)?.lastError
                }
                : { status: 'SAVING', pending: records.length, attempts };
        this.saveState = next;
        for (const listener of this.saveStateListeners) listener(next);
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

    private async getJson<T>(path: string): Promise<T> {
        const response = await fetch(path, { headers: this.authHeaders() });
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

    saveRoutine(routine: Partial<RoutineTemplate> & { presetId?: string }) {
        return this.requestEnvelope('/api/routines/save', { routine });
    }

    pauseRoutine(routineId: string, paused: boolean) {
        return this.requestEnvelope('/api/routines/pause', { routineId, paused });
    }

    completeRoutine(input: { routineId: string; taskId?: string; units?: number }) {
        return this.requestEnvelope('/api/routines/complete', input);
    }

    recordRoutineUnit(routineId: string, units = 1) {
        return this.requestEnvelope('/api/routines/record-unit', { routineId, units });
    }

    skipRoutine(routineId: string) {
        return this.requestEnvelope('/api/routines/skip', { routineId });
    }

    saveDashboardPreferences(preferences: Partial<DashboardPreferences>) {
        return this.requestEnvelope('/api/users/preferences', { preferences });
    }

    saveWishlist(wishlist: Partial<Wishlist>) {
        return this.requestEnvelope('/api/wishlists/save', { wishlist });
    }

    saveWishlistItem(item: Partial<WishlistItem> & { wishlistId: string }) {
        return this.requestEnvelope('/api/wishlists/items/save', { item });
    }

    deleteWishlistItem(wishlistId: string, itemId: string) {
        return this.requestEnvelope('/api/wishlists/items/delete', { wishlistId, itemId });
    }

    reserveWishlistItem(wishlistId: string, itemId: string, reserved: boolean) {
        return this.requestEnvelope(`/api/wishlists/items/${reserved ? 'reserve' : 'release'}`, { wishlistId, itemId });
    }

    adjustPantry(input: {
        productId?: string;
        quantityDelta?: number;
        type?: string;
        name?: string;
        barcode?: string;
        unit?: string;
        location?: string;
        note?: string;
        finished?: boolean;
    }) {
        const path = input.productId
            ? `/api/pantry/${encodeURIComponent(input.productId)}/adjust`
            : '/api/pantry/adjust';
        return this.requestEnvelope(path, input);
    }

    createPurchaseImport(input: {
        id: string;
        source: 'BARCODE' | 'RECEIPT';
        stockOnly?: boolean;
        accountId?: string;
        totalAmount?: number;
        merchant?: string;
    }) {
        return this.requestEnvelope('/api/purchase-imports', input);
    }

    updatePurchaseImport(importId: string, input: Partial<PurchaseImportJob>) {
        return this.requestEnvelope(`/api/purchase-imports/${encodeURIComponent(importId)}`, input as Record<string, unknown>);
    }

    addPurchaseBarcode(importId: string, input: { barcode: string; name?: string; quantity?: number; unit?: string; location?: string }) {
        return this.requestEnvelope(`/api/purchase-imports/${encodeURIComponent(importId)}/barcodes`, input);
    }

    savePurchaseImportItem(importId: string, item: Partial<PurchaseImportJob['items'][number]>) {
        const itemId = item.id || `purchase-item-${createMutationId()}`;
        return this.requestEnvelope(`/api/purchase-imports/${encodeURIComponent(importId)}/items/${encodeURIComponent(itemId)}`, item as Record<string, unknown>);
    }

    confirmPurchaseImport(importId: string) {
        return this.requestEnvelope(`/api/purchase-imports/${encodeURIComponent(importId)}/confirm`, {});
    }

    uploadPurchaseImportPage(importId: string, page: number, file: Blob) {
        return this.requestBinaryEnvelope(
            `/api/purchase-imports/${encodeURIComponent(importId)}/files/${page}`,
            file
        );
    }

    processPurchaseImport(importId: string) {
        return this.requestEnvelope(`/api/purchase-imports/${encodeURIComponent(importId)}/process`, {});
    }

    cancelPurchaseImport(importId: string) {
        return this.requestEnvelope(`/api/purchase-imports/${encodeURIComponent(importId)}/cancel`, {});
    }

    async loadPurchaseImport(importId: string) {
        const response = await this.getJson<{ job: PurchaseImportJob }>(`/api/purchase-imports/${encodeURIComponent(importId)}`);
        return response.job;
    }

    async listPurchaseImports() {
        const response = await this.getJson<{ jobs: PurchaseImportJob[] }>('/api/purchase-imports');
        return response.jobs;
    }
}

export const api = new ServerAdapter();

const createMutationId = () => {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
};
