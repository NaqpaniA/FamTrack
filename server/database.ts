import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { INITIAL_DATA } from '../data.js';
import type { AppData } from '../types.js';
import type { User } from '../family.model.js';
import type { Task, Epic } from '../tasks.model.js';
import type {
    Account,
    FinancialGoal,
    BudgetPlan,
    Transaction,
    SavingsGoal,
    GoalContribution,
    Subscription
} from '../finance.model.js';
import type { Reward, RewardLog, InventoryItem } from '../family.model.js';
import type { ShoppingItem } from '../shopping.model.js';
import type { AppEvent } from '../events.model.js';

const require = createRequire(import.meta.url);

type Row = Record<string, unknown>;

const TABLES = [
    'events',
    'shopping_items',
    'inventory',
    'reward_logs',
    'rewards',
    'transactions',
    'budgets',
    'subscriptions',
    'goal_contributions',
    'savings_goals',
    'financial_goals',
    'accounts',
    'tasks',
    'epics',
    'users'
];

const boolToInt = (value?: boolean) => value ? 1 : 0;
const intToBool = (value: unknown) => Number(value) === 1;
const nullable = <T>(value: T | undefined | null) => value ?? null;
const json = (value: unknown) => JSON.stringify(value ?? null);
const parseJson = <T>(value: unknown, fallback: T): T => {
    if (typeof value !== 'string' || value.length === 0) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
};

const toNumber = (value: unknown, fallback = 0) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

const cloneInitialData = (): AppData => JSON.parse(JSON.stringify(INITIAL_DATA));

export class RevisionConflictError extends Error {
    status = 409;
}

export class FamTrackDatabase {
    private constructor(
        private SQL: SqlJsStatic,
        private db: Database,
        private dbPath: string
    ) {}

    static async open(dbPath: string) {
        const sqlJsDir = path.dirname(require.resolve('sql.js'));
        const SQL = await initSqlJs({
            locateFile: file => path.join(sqlJsDir, file)
        });

        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const db = fs.existsSync(dbPath)
            ? new SQL.Database(fs.readFileSync(dbPath))
            : new SQL.Database();
        const store = new FamTrackDatabase(SQL, db, dbPath);
        store.migrate();
        if (store.isEmpty()) {
            store.replaceAll(cloneInitialData());
            store.setRevision(1);
            store.persist();
        }
        return store;
    }

    health() {
        return {
            ok: true,
            revision: this.getRevision()
        };
    }

    getRevision() {
        return Number(this.getState('revision') || 0);
    }

    getAppData(currentUserOverride?: User): AppData {
        const members = this.selectRows('SELECT * FROM users ORDER BY rowid').map(rowToUser);
        const currentUserId = this.getState('current_user_id');
        const currentUser = currentUserOverride
            || members.find(user => user.id === currentUserId)
            || members[0]
            || cloneInitialData().currentUser;

        return {
            currentUser,
            members,
            epics: this.selectRows('SELECT * FROM epics ORDER BY rowid').map(rowToEpic),
            tasks: this.selectRows('SELECT * FROM tasks ORDER BY rowid').map(rowToTask),
            accounts: this.selectRows('SELECT * FROM accounts ORDER BY rowid').map(rowToAccount),
            goals: this.selectRows('SELECT * FROM financial_goals ORDER BY rowid').map(rowToFinancialGoal),
            savingsGoals: this.selectRows('SELECT * FROM savings_goals ORDER BY rowid').map(rowToSavingsGoal),
            contributions: this.selectRows('SELECT * FROM goal_contributions ORDER BY rowid').map(rowToContribution),
            subscriptions: this.selectRows('SELECT * FROM subscriptions ORDER BY rowid').map(rowToSubscription),
            budgets: this.selectRows('SELECT * FROM budgets ORDER BY rowid').map(rowToBudget),
            transactions: this.selectRows('SELECT * FROM transactions ORDER BY rowid').map(rowToTransaction),
            rewards: this.selectRows('SELECT * FROM rewards ORDER BY rowid').map(rowToReward),
            rewardLogs: this.selectRows('SELECT * FROM reward_logs ORDER BY rowid').map(rowToRewardLog),
            inventory: this.selectRows('SELECT * FROM inventory ORDER BY rowid').map(rowToInventoryItem),
            shoppingList: this.selectRows('SELECT * FROM shopping_items ORDER BY rowid').map(rowToShoppingItem),
            events: this.selectRows('SELECT * FROM events ORDER BY rowid').map(rowToEvent)
        };
    }

    mutate(expectedRevision: number | null | undefined, mutator: (data: AppData) => AppData, currentUserOverride?: User) {
        const revision = this.getRevision();
        if (typeof expectedRevision === 'number' && expectedRevision !== revision) {
            throw new RevisionConflictError(`Data changed on the server; reload required (server revision ${revision})`);
        }

        this.db.run('BEGIN IMMEDIATE');
        try {
            const current = this.getAppData(currentUserOverride);
            const next = mutator(current);
            this.replaceAll(next);
            const nextRevision = revision + 1;
            this.setRevision(nextRevision);
            this.db.run('COMMIT');
            this.persist();
            return {
                revision: nextRevision,
                data: this.getAppData(currentUserOverride)
            };
        } catch (error) {
            this.db.run('ROLLBACK');
            throw error;
        }
    }

    exportEnvelope(currentUserOverride?: User) {
        return {
            revision: this.getRevision(),
            data: this.getAppData(currentUserOverride)
        };
    }

    close() {
        this.db.close();
    }

    private migrate() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                avatar TEXT NOT NULL,
                xp INTEGER NOT NULL,
                level INTEGER NOT NULL,
                telegram_id INTEGER,
                telegram_username TEXT,
                streak INTEGER NOT NULL,
                last_login_date TEXT
            );
            CREATE TABLE IF NOT EXISTS epics (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                priority TEXT NOT NULL,
                color TEXT NOT NULL,
                is_completed INTEGER NOT NULL,
                goal_id TEXT,
                created_by_id TEXT,
                visible_to_json TEXT
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                points INTEGER NOT NULL,
                assignee_id TEXT,
                created_by_id TEXT NOT NULL,
                epic_id TEXT,
                subtasks_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                due_date TEXT,
                reminder_time TEXT,
                visible_to_json TEXT,
                is_recurring INTEGER NOT NULL,
                frequency TEXT
            );
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                balance INTEGER NOT NULL,
                type TEXT NOT NULL,
                goal_id TEXT,
                created_by_id TEXT,
                visible_to_json TEXT
            );
            CREATE TABLE IF NOT EXISTS financial_goals (
                id TEXT PRIMARY KEY,
                account_id TEXT NOT NULL,
                title TEXT NOT NULL,
                target_amount INTEGER NOT NULL,
                current_amount INTEGER NOT NULL,
                deadline TEXT,
                epic_id TEXT,
                created_by_id TEXT,
                visible_to_json TEXT
            );
            CREATE TABLE IF NOT EXISTS savings_goals (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                target_amount INTEGER NOT NULL,
                current_amount INTEGER NOT NULL,
                status TEXT NOT NULL,
                icon TEXT NOT NULL,
                created_by_id TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS goal_contributions (
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                message TEXT,
                date INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                amount INTEGER NOT NULL,
                currency TEXT NOT NULL,
                service_id TEXT,
                frequency TEXT NOT NULL,
                next_payment_date TEXT NOT NULL,
                is_auto_pay INTEGER NOT NULL,
                account_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                active INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS budgets (
                category_id TEXT PRIMARY KEY,
                limit_amount INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                amount INTEGER NOT NULL,
                title TEXT,
                type TEXT NOT NULL,
                category_id TEXT NOT NULL,
                account_id TEXT NOT NULL,
                to_account_id TEXT,
                date TEXT NOT NULL,
                created_by_id TEXT NOT NULL,
                deviation_reason TEXT
            );
            CREATE TABLE IF NOT EXISTS rewards (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                cost INTEGER NOT NULL,
                icon TEXT NOT NULL,
                description TEXT
            );
            CREATE TABLE IF NOT EXISTS reward_logs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS inventory (
                id TEXT PRIMARY KEY,
                reward_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                status TEXT NOT NULL,
                purchased_at INTEGER NOT NULL,
                used_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS shopping_items (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                added_by_id TEXT NOT NULL,
                is_completed INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
        `);
    }

    private isEmpty() {
        return Number(this.selectValue('SELECT COUNT(*) FROM users')) === 0;
    }

    private replaceAll(data: AppData) {
        for (const table of TABLES) {
            this.db.run(`DELETE FROM ${table}`);
        }

        this.insertUsers(data.members || []);
        this.insertEpics(data.epics || []);
        this.insertTasks(data.tasks || []);
        this.insertAccounts(data.accounts || []);
        this.insertFinancialGoals(data.goals || []);
        this.insertSavingsGoals(data.savingsGoals || []);
        this.insertContributions(data.contributions || []);
        this.insertSubscriptions(data.subscriptions || []);
        this.insertBudgets(data.budgets || []);
        this.insertTransactions(data.transactions || []);
        this.insertRewards(data.rewards || []);
        this.insertRewardLogs(data.rewardLogs || []);
        this.insertInventory(data.inventory || []);
        this.insertShoppingItems(data.shoppingList || []);
        this.insertEvents(data.events || []);
        this.setState('current_user_id', data.currentUser?.id || data.members?.[0]?.id || '');
    }

    private insertUsers(users: User[]) {
        const stmt = this.db.prepare(`
            INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const user of users) {
                stmt.run([
                    user.id,
                    user.name,
                    user.role,
                    user.avatar,
                    user.xp,
                    user.level,
                    nullable(user.telegramId),
                    nullable(user.telegramUsername),
                    user.streak || 0,
                    nullable(user.lastLoginDate)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertEpics(epics: Epic[]) {
        const stmt = this.db.prepare('INSERT INTO epics VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const epic of epics) {
                stmt.run([
                    epic.id,
                    epic.title,
                    epic.priority,
                    epic.color,
                    boolToInt(epic.isCompleted),
                    nullable(epic.goalId),
                    nullable(epic.createdById),
                    json(epic.visibleTo)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertTasks(tasks: Task[]) {
        const stmt = this.db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const task of tasks) {
                stmt.run([
                    task.id,
                    task.title,
                    nullable(task.description),
                    task.status,
                    task.priority,
                    task.points,
                    nullable(task.assigneeId),
                    task.createdById,
                    nullable(task.epicId),
                    json(task.subtasks || []),
                    task.createdAt,
                    nullable(task.dueDate),
                    nullable(task.reminderTime),
                    json(task.visibleTo),
                    boolToInt(task.isRecurring),
                    nullable(task.frequency)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertAccounts(accounts: Account[]) {
        const stmt = this.db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const account of accounts) {
                stmt.run([
                    account.id,
                    account.name,
                    account.balance,
                    account.type,
                    nullable(account.goalId),
                    nullable(account.createdById),
                    json(account.visibleTo)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertFinancialGoals(goals: FinancialGoal[]) {
        const stmt = this.db.prepare('INSERT INTO financial_goals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const goal of goals) {
                stmt.run([
                    goal.id,
                    goal.accountId,
                    goal.title,
                    goal.targetAmount,
                    goal.currentAmount,
                    nullable(goal.deadline),
                    nullable(goal.epicId),
                    nullable(goal.createdById),
                    json(goal.visibleTo)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertSavingsGoals(goals: SavingsGoal[]) {
        const stmt = this.db.prepare('INSERT INTO savings_goals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const goal of goals) {
                stmt.run([
                    goal.id,
                    goal.title,
                    nullable(goal.description),
                    goal.targetAmount,
                    goal.currentAmount,
                    goal.status,
                    goal.icon,
                    goal.createdById,
                    goal.createdAt
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertContributions(contributions: GoalContribution[]) {
        const stmt = this.db.prepare('INSERT INTO goal_contributions VALUES (?, ?, ?, ?, ?, ?)');
        try {
            for (const contribution of contributions) {
                stmt.run([
                    contribution.id,
                    contribution.goalId,
                    contribution.userId,
                    contribution.amount,
                    nullable(contribution.message),
                    contribution.date
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertSubscriptions(subscriptions: Subscription[]) {
        const stmt = this.db.prepare('INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const sub of subscriptions) {
                stmt.run([
                    sub.id,
                    sub.title,
                    sub.amount,
                    sub.currency,
                    nullable(sub.serviceId),
                    sub.frequency,
                    sub.nextPaymentDate,
                    boolToInt(sub.isAutoPay),
                    sub.accountId,
                    sub.categoryId,
                    boolToInt(sub.active)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertBudgets(budgets: BudgetPlan[]) {
        const stmt = this.db.prepare('INSERT INTO budgets VALUES (?, ?)');
        try {
            for (const budget of budgets) {
                stmt.run([budget.categoryId, budget.limit]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertTransactions(transactions: Transaction[]) {
        const stmt = this.db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        try {
            for (const tx of transactions) {
                stmt.run([
                    tx.id,
                    tx.amount,
                    nullable(tx.title),
                    tx.type,
                    tx.categoryId,
                    tx.accountId,
                    nullable(tx.toAccountId),
                    tx.date,
                    tx.createdById,
                    nullable(tx.deviationReason)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertRewards(rewards: Reward[]) {
        const stmt = this.db.prepare('INSERT INTO rewards VALUES (?, ?, ?, ?, ?)');
        try {
            for (const reward of rewards) {
                stmt.run([
                    reward.id,
                    reward.title,
                    reward.cost,
                    reward.icon,
                    nullable(reward.description)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertRewardLogs(logs: RewardLog[]) {
        const stmt = this.db.prepare('INSERT INTO reward_logs VALUES (?, ?, ?, ?, ?, ?)');
        try {
            for (const log of logs) {
                stmt.run([
                    log.id,
                    log.userId,
                    log.action,
                    log.amount,
                    log.description,
                    log.timestamp
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertInventory(items: InventoryItem[]) {
        const stmt = this.db.prepare('INSERT INTO inventory VALUES (?, ?, ?, ?, ?, ?)');
        try {
            for (const item of items) {
                stmt.run([
                    item.id,
                    item.rewardId,
                    item.ownerId,
                    item.status,
                    item.purchasedAt,
                    nullable(item.usedAt)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertShoppingItems(items: ShoppingItem[]) {
        const stmt = this.db.prepare('INSERT INTO shopping_items VALUES (?, ?, ?, ?, ?, ?)');
        try {
            for (const item of items) {
                stmt.run([
                    item.id,
                    item.title,
                    item.category,
                    item.addedById,
                    boolToInt(item.isCompleted),
                    item.createdAt
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertEvents(events: AppEvent[]) {
        const stmt = this.db.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?)');
        try {
            for (const event of events) {
                stmt.run([
                    event.id,
                    event.type,
                    event.actorId,
                    json(event.payload || {}),
                    event.timestamp
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private setRevision(revision: number) {
        this.setState('revision', String(revision));
    }

    private getState(key: string) {
        const value = this.selectValue('SELECT value FROM app_state WHERE key = ?', [key]);
        return typeof value === 'string' ? value : undefined;
    }

    private setState(key: string, value: string) {
        this.db.run('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)', [key, value]);
    }

    private selectValue(sql: string, params: unknown[] = []) {
        const stmt = this.db.prepare(sql);
        try {
            stmt.bind(params as never[]);
            if (!stmt.step()) return undefined;
            const row = stmt.getAsObject();
            return Object.values(row)[0];
        } finally {
            stmt.free();
        }
    }

    private selectRows(sql: string, params: unknown[] = []): Row[] {
        const stmt = this.db.prepare(sql);
        const rows: Row[] = [];
        try {
            stmt.bind(params as never[]);
            while (stmt.step()) {
                rows.push(stmt.getAsObject());
            }
            return rows;
        } finally {
            stmt.free();
        }
    }

    private persist() {
        fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
    }
}

const rowToUser = (row: Row): User => ({
    id: String(row.id),
    name: String(row.name),
    role: row.role as User['role'],
    avatar: String(row.avatar),
    xp: toNumber(row.xp),
    level: toNumber(row.level, 1),
    telegramId: row.telegram_id == null ? undefined : toNumber(row.telegram_id),
    telegramUsername: row.telegram_username == null ? undefined : String(row.telegram_username),
    streak: toNumber(row.streak),
    lastLoginDate: row.last_login_date == null ? undefined : String(row.last_login_date)
});

const rowToEpic = (row: Row): Epic => ({
    id: String(row.id),
    title: String(row.title),
    priority: row.priority as Epic['priority'],
    color: String(row.color),
    isCompleted: intToBool(row.is_completed),
    goalId: row.goal_id == null ? undefined : String(row.goal_id),
    createdById: row.created_by_id == null ? undefined : String(row.created_by_id),
    visibleTo: parseJson<string[] | undefined>(row.visible_to_json, undefined)
});

const rowToTask = (row: Row): Task => ({
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? undefined : String(row.description),
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    points: toNumber(row.points),
    assigneeId: row.assignee_id == null ? undefined : String(row.assignee_id),
    createdById: String(row.created_by_id),
    epicId: row.epic_id == null ? undefined : String(row.epic_id),
    subtasks: parseJson(row.subtasks_json, []),
    createdAt: toNumber(row.created_at),
    dueDate: row.due_date == null ? undefined : String(row.due_date),
    reminderTime: row.reminder_time == null ? undefined : String(row.reminder_time),
    visibleTo: parseJson<string[] | undefined>(row.visible_to_json, undefined),
    isRecurring: intToBool(row.is_recurring),
    frequency: row.frequency == null ? undefined : row.frequency as Task['frequency']
});

const rowToAccount = (row: Row): Account => ({
    id: String(row.id),
    name: String(row.name),
    balance: toNumber(row.balance),
    type: row.type as Account['type'],
    goalId: row.goal_id == null ? undefined : String(row.goal_id),
    createdById: row.created_by_id == null ? undefined : String(row.created_by_id),
    visibleTo: parseJson<string[] | undefined>(row.visible_to_json, undefined)
});

const rowToFinancialGoal = (row: Row): FinancialGoal => ({
    id: String(row.id),
    accountId: String(row.account_id),
    title: String(row.title),
    targetAmount: toNumber(row.target_amount),
    currentAmount: toNumber(row.current_amount),
    deadline: row.deadline == null ? undefined : String(row.deadline),
    epicId: row.epic_id == null ? undefined : String(row.epic_id),
    createdById: row.created_by_id == null ? undefined : String(row.created_by_id),
    visibleTo: parseJson<string[] | undefined>(row.visible_to_json, undefined)
});

const rowToSavingsGoal = (row: Row): SavingsGoal => ({
    id: String(row.id),
    title: String(row.title),
    description: row.description == null ? undefined : String(row.description),
    targetAmount: toNumber(row.target_amount),
    currentAmount: toNumber(row.current_amount),
    status: row.status as SavingsGoal['status'],
    icon: String(row.icon),
    createdById: String(row.created_by_id),
    createdAt: toNumber(row.created_at)
});

const rowToContribution = (row: Row): GoalContribution => ({
    id: String(row.id),
    goalId: String(row.goal_id),
    userId: String(row.user_id),
    amount: toNumber(row.amount),
    message: row.message == null ? undefined : String(row.message),
    date: toNumber(row.date)
});

const rowToSubscription = (row: Row): Subscription => ({
    id: String(row.id),
    title: String(row.title),
    amount: toNumber(row.amount),
    currency: row.currency as Subscription['currency'],
    serviceId: row.service_id == null ? undefined : String(row.service_id),
    frequency: row.frequency as Subscription['frequency'],
    nextPaymentDate: String(row.next_payment_date),
    isAutoPay: intToBool(row.is_auto_pay),
    accountId: String(row.account_id),
    categoryId: String(row.category_id),
    active: intToBool(row.active)
});

const rowToBudget = (row: Row): BudgetPlan => ({
    categoryId: String(row.category_id),
    limit: toNumber(row.limit_amount)
});

const rowToTransaction = (row: Row): Transaction => ({
    id: String(row.id),
    amount: toNumber(row.amount),
    title: row.title == null ? undefined : String(row.title),
    type: row.type as Transaction['type'],
    categoryId: String(row.category_id),
    accountId: String(row.account_id),
    toAccountId: row.to_account_id == null ? undefined : String(row.to_account_id),
    date: String(row.date),
    createdById: String(row.created_by_id),
    deviationReason: row.deviation_reason == null ? undefined : String(row.deviation_reason)
});

const rowToReward = (row: Row): Reward => ({
    id: String(row.id),
    title: String(row.title),
    cost: toNumber(row.cost),
    icon: String(row.icon),
    description: row.description == null ? undefined : String(row.description)
});

const rowToRewardLog = (row: Row): RewardLog => ({
    id: String(row.id),
    userId: String(row.user_id),
    action: row.action as RewardLog['action'],
    amount: toNumber(row.amount),
    description: String(row.description),
    timestamp: toNumber(row.timestamp)
});

const rowToInventoryItem = (row: Row): InventoryItem => ({
    id: String(row.id),
    rewardId: String(row.reward_id),
    ownerId: String(row.owner_id),
    status: row.status as InventoryItem['status'],
    purchasedAt: toNumber(row.purchased_at),
    usedAt: row.used_at == null ? undefined : toNumber(row.used_at)
});

const rowToShoppingItem = (row: Row): ShoppingItem => ({
    id: String(row.id),
    title: String(row.title),
    category: row.category as ShoppingItem['category'],
    addedById: String(row.added_by_id),
    isCompleted: intToBool(row.is_completed),
    createdAt: toNumber(row.created_at)
});

const rowToEvent = (row: Row): AppEvent => ({
    id: String(row.id),
    type: row.type as AppEvent['type'],
    actorId: String(row.actor_id),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    timestamp: toNumber(row.timestamp)
});
