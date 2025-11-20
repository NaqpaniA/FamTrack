
import { AppData, User } from './types';
import { Task, Epic } from './tasks.model';
import { Transaction, Account, FinancialGoal, BudgetPlan, SavingsGoal, GoalContribution } from './finance.model';
import { Reward, RewardLog, InventoryItem } from './family.model';
import { LocalDatabase, generateId } from './utils';
import { INITIAL_DATA } from './data';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// --- Interface ---

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
    
    // New Methods
    saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal>;
    saveContribution(contribution: GoalContribution): Promise<GoalContribution>;

    batchUpdate(updates: Partial<AppData>): Promise<void>; 
}

// --- Helper: Async Queue for Mutex ---

class AsyncQueue {
    private queue: Promise<any> = Promise.resolve();

    enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const next = this.queue.then(operation).catch(err => {
            console.error("Queue operation failed", err);
            throw err;
        });
        this.queue = next;
        return next;
    }
}

// --- Local Adapter (Wraps localStorage in Promises to simulate Async API) ---

class LocalAdapter implements ApiInterface {
    private queue = new AsyncQueue();

    private async delay(ms: number = 300) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private getData(): AppData {
        const data = LocalDatabase.load();
        // Ensure we always have structure even if DB was empty/corrupted
        if (!data.tasks) return INITIAL_DATA;
        // Migration for Savings Goals
        if (!data.savingsGoals) data.savingsGoals = [];
        if (!data.contributions) data.contributions = [];
        return data;
    }

    private saveData(data: AppData) {
        LocalDatabase.save(data);
    }

    // All public methods are wrapped in the queue to ensure atomic execution
    // strictly sequential, preventing race conditions on the shared LocalStorage resource.

    async loadData(): Promise<AppData> {
        return this.queue.enqueue(async () => {
            await this.delay(500); 
            return this.getData();
        });
    }

    async saveTask(task: Task): Promise<Task> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            const idx = data.tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) {
                data.tasks[idx] = task;
            } else {
                data.tasks.push(task);
            }
            this.saveData(data);
            return task;
        });
    }

    async deleteTask(id: string): Promise<void> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            data.tasks = data.tasks.filter(t => t.id !== id);
            this.saveData(data);
        });
    }

    async saveEpic(epic: Epic): Promise<Epic> {
        return this.queue.enqueue(async () => {
            await this.delay();
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
            await this.delay();
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
            await this.delay();
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
            await this.delay();
            const data = this.getData();
            const idx = data.goals.findIndex(g => g.id === goal.id);
            if (idx >= 0) data.goals[idx] = goal;
            else data.goals.push(goal);
            this.saveData(data);
            return goal;
        });
    }

    async saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal> {
        return this.queue.enqueue(async () => {
            await this.delay();
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
            await this.delay();
            const data = this.getData();
            data.contributions.unshift(contribution);
            this.saveData(data);
            return contribution;
        });
    }

    async saveBudgets(budgets: BudgetPlan[]): Promise<BudgetPlan[]> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            data.budgets = budgets;
            this.saveData(data);
            return budgets;
        });
    }

    async updateUser(user: User): Promise<User> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            const idx = data.members.findIndex(u => u.id === user.id);
            if (idx >= 0) data.members[idx] = user;
            
            if (data.currentUser.id === user.id) {
                data.currentUser = user;
            }
            this.saveData(data);
            return user;
        });
    }

    async saveRewardLog(log: RewardLog): Promise<RewardLog> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            data.rewardLogs.unshift(log);
            this.saveData(data);
            return log;
        });
    }

    async saveInventoryItem(item: InventoryItem): Promise<InventoryItem> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            const idx = data.inventory.findIndex(i => i.id === item.id);
            if (idx >= 0) data.inventory[idx] = item;
            else data.inventory.push(item);
            this.saveData(data);
            return item;
        });
    }

    async batchUpdate(updates: Partial<AppData>): Promise<void> {
        return this.queue.enqueue(async () => {
            await this.delay();
            const data = this.getData();
            const newData = { ...data, ...updates };
            this.saveData(newData);
        });
    }
}

// --- Supabase Adapter (The Future) ---

class SupabaseAdapter implements ApiInterface {
    // Placeholder for Phase 2
    
    async loadData(): Promise<AppData> {
        console.log("Supabase load not fully implemented yet, using fallback");
        return INITIAL_DATA;
    }

    async saveTask(task: Task): Promise<Task> { return task; }
    async deleteTask(id: string) {}
    async saveEpic(epic: Epic): Promise<Epic> { return epic; }
    async saveTransaction(tx: Transaction): Promise<Transaction> { return tx; }
    async saveAccount(acc: Account): Promise<Account> { return acc; }
    async saveGoal(goal: FinancialGoal): Promise<FinancialGoal> { return goal; }
    async saveSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal> { return goal; }
    async saveContribution(c: GoalContribution): Promise<GoalContribution> { return c; }
    async saveBudgets(budgets: BudgetPlan[]): Promise<BudgetPlan[]> { return budgets; }
    async updateUser(user: User): Promise<User> { return user; }
    async saveRewardLog(log: RewardLog): Promise<RewardLog> { return log; }
    async saveInventoryItem(item: InventoryItem): Promise<InventoryItem> { return item; }
    async batchUpdate(updates: Partial<AppData>): Promise<void> {}
}

// --- Export Factory ---

const useSupabase = isSupabaseConfigured(); 
export const api = new LocalAdapter();
