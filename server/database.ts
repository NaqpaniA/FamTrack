import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import { INITIAL_DATA } from '../data.js';
import { DEFAULT_DASHBOARD_HIDDEN_WIDGETS, type AiHelperType, type AiUsage, type AppData, type DashboardPreferences, type Family, type FamilyInvite } from '../types.js';
import type { User, Role } from '../family.model.js';
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
import type { Note } from '../notes.model.js';
import type { AuthContext } from './auth.js';
import { DEFAULT_FAMILY_SETTINGS, normalizeFamilySettings } from '../settings.model.js';
import type { RoutineEvent, RoutineTemplate } from '../routines.model.js';
import type { Wishlist } from '../wishlist.model.js';
import type { PantryMovement, PantryProduct } from '../pantry.model.js';
import type { PurchaseImportFile, PurchaseImportItem, PurchaseImportJob } from '../purchase-import.model.js';
import { summarizeRoutines, summarizeRoutineScopes } from './routines.js';

const require = createRequire(import.meta.url);

type Row = Record<string, unknown>;

export const DEFAULT_FAMILY_ID = 'fam-default';
const DEFAULT_FAMILY_NAME = 'Naqpania Family';
const MIGRATION_VERSION = '2026-08-11-routines-pantry-capture-v1';
const DEMO_PLAYSTATION_CLEANUP_MIGRATION = '2026-06-19-remove-demo-playstation-savings-goal';
const MUTATION_RECEIPT_RETENTION_MS = 1000 * 60 * 60 * 24 * 30;
const DEMO_PLAYSTATION_SAVINGS_GOAL = {
    id: 'sg1',
    title: 'Sony PlayStation 5',
    targetAmount: 6000000,
    currentAmount: 1500000,
    status: 'ACTIVE',
    icon: '🎮',
    createdById: 'u3'
};

const TENANT_TABLES = [
    'purchase_import_files',
    'purchase_import_items',
    'purchase_imports',
    'pantry_movements',
    'pantry_products',
    'user_preferences',
    'wishlists',
    'routine_events',
    'routine_templates',
    'events',
    'notes',
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
] as const;

export type FamilyWriteTarget =
    | 'family'
    | 'members'
    | 'epics'
    | 'tasks'
    | 'accounts'
    | 'goals'
    | 'savingsGoals'
    | 'contributions'
    | 'subscriptions'
    | 'budgets'
    | 'transactions'
    | 'rewards'
    | 'rewardLogs'
    | 'inventory'
    | 'shoppingList'
    | 'notes'
    | 'events'
    | 'routines'
    | 'routineEvents'
    | 'wishlists'
    | 'dashboardPreferences'
    | 'pantry'
    | 'purchaseImports';

const ALL_FAMILY_WRITE_TARGETS: readonly FamilyWriteTarget[] = [
    'family', 'members', 'epics', 'tasks', 'accounts', 'goals', 'savingsGoals',
    'contributions', 'subscriptions', 'budgets', 'transactions', 'rewards',
    'rewardLogs', 'inventory', 'shoppingList', 'notes', 'events', 'routines',
    'routineEvents', 'wishlists', 'dashboardPreferences', 'pantry', 'purchaseImports'
];

const COMMAND_WRITE_TARGETS: Record<string, readonly FamilyWriteTarget[]> = {
    '/api/tasks/reorder': ['tasks'],
    '/api/tasks/status': ['tasks', 'members', 'rewardLogs', 'events'],
    '/api/tasks/save': ['tasks'],
    '/api/tasks/delete': ['tasks'],
    '/api/notes/save': ['notes', 'events'],
    '/api/notes/delete': ['notes'],
    '/api/epics/save': ['epics'],
    '/api/epics/delete': ['epics'],
    '/api/transactions/save': ['accounts', 'goals', 'transactions', 'events'],
    '/api/accounts/save': ['accounts', 'goals'],
    '/api/goals/save': ['goals'],
    '/api/budgets/save': ['budgets'],
    '/api/savings-goals/save': ['savingsGoals'],
    '/api/savings-goals/contribute': ['accounts', 'savingsGoals', 'contributions', 'transactions', 'events'],
    '/api/subscriptions/save': ['subscriptions'],
    '/api/subscriptions/delete': ['subscriptions'],
    '/api/subscriptions/pay': ['accounts', 'subscriptions', 'transactions', 'events'],
    '/api/shopping/items/add': ['shoppingList'],
    '/api/shopping/items/set-completed': ['shoppingList'],
    '/api/shopping/items/delete': ['shoppingList'],
    '/api/shopping/checkout': ['accounts', 'transactions', 'shoppingList', 'events'],
    '/api/users/save': ['family', 'members'],
    '/api/users/archive': ['family', 'members'],
    '/api/users/restore': ['family', 'members'],
    '/api/users/check-in': ['members', 'rewardLogs', 'events'],
    '/api/family/settings': ['family'],
    '/api/rewards/save': ['rewards'],
    '/api/rewards/archive': ['rewards'],
    '/api/rewards/purchase': ['members', 'rewardLogs', 'inventory', 'events'],
    '/api/rewards/use': ['rewardLogs', 'inventory', 'events'],
    '/api/routines/save': ['tasks', 'routines', 'routineEvents'],
    '/api/routines/pause': ['tasks', 'routines', 'routineEvents'],
    '/api/routines/complete': ['tasks', 'members', 'rewardLogs', 'routines', 'routineEvents'],
    '/api/routines/record-unit': ['tasks', 'routines', 'routineEvents'],
    '/api/routines/skip': ['tasks', 'routines', 'routineEvents'],
    '/api/users/preferences': ['dashboardPreferences'],
    '/api/wishlists/save': ['wishlists'],
    '/api/wishlists/items/save': ['wishlists'],
    '/api/wishlists/items/delete': ['wishlists'],
    '/api/wishlists/items/reserve': ['wishlists'],
    '/api/wishlists/items/release': ['wishlists'],
    '/api/pantry/adjust': ['pantry'],
    '/api/purchase-imports': ['purchaseImports'],
    '/api/purchase-imports/update': ['purchaseImports'],
    '/api/purchase-imports/barcodes': ['purchaseImports'],
    '/api/purchase-imports/items/save': ['purchaseImports'],
    '/api/purchase-imports/confirm': ['accounts', 'goals', 'transactions', 'shoppingList', 'events', 'pantry', 'purchaseImports']
};

const commandWriteTargets = (operation: string) => {
    if (/^\/api\/pantry\/[^/]+\/adjust$/.test(operation)) return ['pantry'] as const;
    if (/^\/api\/purchase-imports\/[^/]+\/barcodes$/.test(operation)) return ['purchaseImports'] as const;
    if (/^\/api\/purchase-imports\/[^/]+$/.test(operation)) return ['purchaseImports'] as const;
    if (/^\/api\/purchase-imports\/[^/]+\/items\/[^/]+$/.test(operation)) return ['purchaseImports'] as const;
    if (/^\/api\/purchase-imports\/[^/]+\/files\/[1-3]$/.test(operation)) return ['purchaseImports'] as const;
    if (/^\/api\/purchase-imports\/[^/]+\/(?:process|cancel)$/.test(operation)) return ['purchaseImports'] as const;
    if (/^\/api\/internal\/purchase-imports\/[^/]+\/(?:claim|result|failure|recover|retry|retention)$/.test(operation)) return ['purchaseImports'] as const;
    if (/^\/api\/purchase-imports\/[^/]+\/confirm$/.test(operation)) {
        return ['accounts', 'goals', 'transactions', 'shoppingList', 'events', 'pantry', 'purchaseImports'] as const;
    }
    return COMMAND_WRITE_TARGETS[operation];
};

const percentile95 = (values: number[]) => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
};

const boolToInt = (value?: boolean) => value ? 1 : 0;
const activeToInt = (value?: boolean) => value === false ? 0 : 1;
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
const safeIsoClock = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(11, 16) : undefined;
};

const toNumber = (value: unknown, fallback = 0) => {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
};

const normalizeAvatarUrl = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' ? url.toString() : undefined;
    } catch {
        return undefined;
    }
};

const cloneInitialData = (): AppData => JSON.parse(JSON.stringify(INITIAL_DATA));

const hashInput = (value: string) => createHash('sha256').update(value).digest('hex');

const backupDatabaseFile = (dbPath: string) => {
    if (fs.statSync(dbPath).size === 0) return;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${dbPath}.backup-${stamp}`;
    fs.copyFileSync(dbPath, backupPath);
    const retention = Math.max(1, Math.round(Number(process.env.FAMTRACK_BACKUP_RETENTION) || 10));
    const directory = path.dirname(dbPath);
    const prefix = `${path.basename(dbPath)}.backup-`;
    const backups = fs.readdirSync(directory)
        .filter(name => name.startsWith(prefix))
        .sort()
        .reverse();
    for (const name of backups.slice(retention)) {
        fs.unlinkSync(path.join(directory, name));
    }
};

export class RevisionConflictError extends Error {
    status = 409;
}

export class RevisionRequiredError extends Error {
    status = 428;
}

export class MutationIdConflictError extends Error {
    status = 409;
    code = 'IDEMPOTENCY_CONFLICT';
}

export class InviteError extends Error {
    status = 400;
}

export class FamTrackDatabase {
    private readonly operationMetrics = {
        commandRebased: 0,
        commandDuplicate: 0,
        persistFailure: 0,
        persistDurationsMs: [] as number[],
        writeDurationsMs: [] as number[]
    };

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
        const existed = fs.existsSync(dbPath);
        if (existed) {
            backupDatabaseFile(dbPath);
        }
        const db = existed
            ? new SQL.Database(fs.readFileSync(dbPath))
            : new SQL.Database();
        const store = new FamTrackDatabase(SQL, db, dbPath);
        store.migrate();
        store.seedIfEmpty();
        store.validateMigration();
        store.persist();
        return store;
    }

    health() {
        return {
            ok: true,
            revision: this.getRevision(),
            families: Number(this.selectValue('SELECT COUNT(*) FROM families') || 0)
        };
    }

    operationalMetrics() {
        const persistDurations = this.operationMetrics.persistDurationsMs;
        const writeDurations = this.operationMetrics.writeDurationsMs;
        let databaseSizeBytes = 0;
        try {
            databaseSizeBytes = fs.statSync(this.dbPath).size;
        } catch {
            databaseSizeBytes = this.db.export().byteLength;
        }
        return {
            command_rebased: this.operationMetrics.commandRebased,
            command_duplicate: this.operationMetrics.commandDuplicate,
            persist_failure: this.operationMetrics.persistFailure,
            persist_duration: {
                count: persistDurations.length,
                latestMs: persistDurations.at(-1) || 0,
                p95Ms: percentile95(persistDurations)
            },
            write_latency: {
                count: writeDurations.length,
                latestMs: writeDurations.at(-1) || 0,
                p95Ms: percentile95(writeDurations)
            },
            database_size_bytes: databaseSizeBytes
        };
    }

    integrityReport() {
        const quickCheck = this.selectRows('PRAGMA quick_check')
            .flatMap(row => Object.values(row).map(value => String(value)));
        const families = this.listFamilyIds().map(familyId => {
            const data = this.getAppData(familyId);
            return {
                familyId,
                revision: this.getRevision(familyId),
                counts: {
                    members: data.members.length,
                    epics: data.epics.length,
                    tasks: data.tasks.length,
                    accounts: data.accounts.length,
                    goals: data.goals.length,
                    savingsGoals: data.savingsGoals.length,
                    contributions: data.contributions.length,
                    subscriptions: data.subscriptions.length,
                    budgets: data.budgets.length,
                    transactions: data.transactions.length,
                    rewards: data.rewards.length,
                    rewardLogs: data.rewardLogs.length,
                    inventory: data.inventory.length,
                    shoppingList: data.shoppingList.length,
                    notes: data.notes.length,
                    events: data.events.length
                }
            };
        });
        return {
            ok: quickCheck.length === 1 && quickCheck[0].toLowerCase() === 'ok',
            quickCheck,
            families
        };
    }

    getRevision(familyId = DEFAULT_FAMILY_ID) {
        return Number(this.selectValue('SELECT revision FROM families WHERE id = ?', [familyId]) || 0);
    }

    listFamilyIds() {
        return this.selectRows('SELECT id FROM families ORDER BY created_at, id').map(row => String(row.id));
    }

    syncTelegramProfile(auth: AuthContext) {
        if (!auth.telegramId) return false;
        const byId = this.selectRows('SELECT * FROM users WHERE telegram_id = ? LIMIT 1', [auth.telegramId])[0];
        const byUsername = !byId && auth.username
            ? this.selectRows('SELECT * FROM users WHERE lower(telegram_username) = ? LIMIT 1', [auth.username.toLowerCase()])[0]
            : undefined;
        const row = byId || byUsername;
        if (!row) return false;
        const current = rowToUser(row);
        const next = {
            telegramId: auth.telegramId,
            telegramUsername: auth.username || current.telegramUsername,
            telegramFirstName: auth.firstName || current.telegramFirstName,
            telegramLastName: auth.lastName || current.telegramLastName,
            avatarUrl: normalizeAvatarUrl(auth.photoUrl) || current.avatarUrl
        };
        if (current.telegramId === next.telegramId
            && current.telegramUsername === next.telegramUsername
            && current.telegramFirstName === next.telegramFirstName
            && current.telegramLastName === next.telegramLastName
            && current.avatarUrl === next.avatarUrl) {
            return false;
        }
        return this.persistedTransaction(() => {
            this.db.run(
                `UPDATE users SET telegram_id = ?, telegram_username = ?, telegram_first_name = ?,
                 telegram_last_name = ?, avatar_url = ? WHERE id = ?`,
                [
                    next.telegramId,
                    nullable(next.telegramUsername),
                    nullable(next.telegramFirstName),
                    nullable(next.telegramLastName),
                    nullable(next.avatarUrl),
                    current.id
                ]
            );
            this.db.run('UPDATE families SET revision = revision + 1 WHERE id = ?', [current.familyId]);
            return true;
        });
    }

    getAppData(familyOrActor?: string | User, currentUserOverride?: User): AppData {
        const familyId = this.resolveFamilyId(familyOrActor);
        const override = typeof familyOrActor === 'object' ? familyOrActor : currentUserOverride;
        const family = this.getFamily(familyId);
        const members = this.selectRows('SELECT * FROM users WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToUser);
        const activeMembers = members.filter(user => user.isActive !== false);
        const currentUser = (override ? members.find(user => user.id === override.id) : undefined)
            || override
            || activeMembers.find(user => user.id === family?.ownerUserId)
            || activeMembers[0]
            || members[0]
            || cloneInitialData().currentUser;

        const routines = this.selectRows('SELECT data_json FROM routine_templates WHERE family_id = ? ORDER BY rowid', [familyId])
            .map(row => parseJson<RoutineTemplate>(row.data_json, {} as RoutineTemplate))
            .filter(item => !!item.id);
        const routineEvents = this.selectRows('SELECT data_json FROM routine_events WHERE family_id = ? ORDER BY timestamp, rowid', [familyId])
            .map(row => parseJson<RoutineEvent>(row.data_json, {} as RoutineEvent))
            .filter(item => !!item.id);
        const wishlists = this.selectRows('SELECT data_json FROM wishlists WHERE family_id = ? ORDER BY rowid', [familyId])
            .map(row => parseJson<Wishlist>(row.data_json, {} as Wishlist))
            .filter(item => !!item.id);
        const preferenceRow = this.selectRows(
            'SELECT data_json FROM user_preferences WHERE family_id = ? AND user_id = ?',
            [familyId, currentUser.id]
        )[0];
        const dashboardPreferences = parseJson<DashboardPreferences>(preferenceRow?.data_json, {
            userId: currentUser.id,
            scope: 'FAMILY',
            hiddenWidgets: [...DEFAULT_DASHBOARD_HIDDEN_WIDGETS],
            widgetOrder: [],
            weatherOptIn: false
        });
        const pantryProducts = this.selectRows('SELECT data_json FROM pantry_products WHERE family_id = ? ORDER BY rowid', [familyId])
            .map(row => parseJson<PantryProduct>(row.data_json, {} as PantryProduct))
            .filter(item => !!item.id);
        const pantryMovements = this.selectRows(
            'SELECT * FROM pantry_movements WHERE family_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50',
            [familyId]
        ).map(rowToPantryMovement);
        const purchaseImports = this.selectRows(
            'SELECT data_json FROM purchase_imports WHERE family_id = ? ORDER BY created_at DESC, rowid DESC',
            [familyId]
        ).map(row => parseJson<PurchaseImportJob>(row.data_json, {} as PurchaseImportJob))
            .filter(job => !!job.id)
            .map(job => {
                const storedFiles = this.selectRows(
                    'SELECT * FROM purchase_import_files WHERE family_id = ? AND import_id = ? ORDER BY page',
                    [familyId, job.id]
                ).map(rowToPurchaseImportFile);
                return {
                    ...job,
                    files: storedFiles.length > 0 ? storedFiles : job.files,
                    items: this.selectRows(
                        'SELECT data_json FROM purchase_import_items WHERE family_id = ? AND import_id = ? ORDER BY rowid',
                        [familyId, job.id]
                    ).map(row => parseJson<PurchaseImportItem>(row.data_json, {} as PurchaseImportItem)).filter(item => !!item.id)
                };
            });

        const data: AppData = {
            family,
            currentUser: { ...currentUser, familyId },
            members,
            epics: this.selectRows('SELECT * FROM epics WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToEpic),
            tasks: this.selectRows('SELECT * FROM tasks WHERE family_id = ? ORDER BY sort_order, rowid', [familyId]).map(rowToTask),
            accounts: this.selectRows('SELECT * FROM accounts WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToAccount),
            goals: this.selectRows('SELECT * FROM financial_goals WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToFinancialGoal),
            savingsGoals: this.selectRows('SELECT * FROM savings_goals WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToSavingsGoal),
            contributions: this.selectRows('SELECT * FROM goal_contributions WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToContribution),
            subscriptions: this.selectRows('SELECT * FROM subscriptions WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToSubscription),
            budgets: this.selectRows('SELECT * FROM budgets WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToBudget),
            transactions: this.selectRows('SELECT * FROM transactions WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToTransaction),
            rewards: this.selectRows('SELECT * FROM rewards WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToReward),
            rewardLogs: this.selectRows('SELECT * FROM reward_logs WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToRewardLog),
            inventory: this.selectRows('SELECT * FROM inventory WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToInventoryItem),
            shoppingList: this.selectRows('SELECT * FROM shopping_items WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToShoppingItem),
            notes: this.selectRows('SELECT * FROM notes WHERE family_id = ? ORDER BY is_pinned DESC, updated_at DESC, rowid DESC', [familyId]).map(rowToNote),
            events: this.selectRows('SELECT * FROM events WHERE family_id = ? ORDER BY rowid', [familyId]).map(rowToEvent),
            routines,
            routineEvents,
            wishlists,
            dashboardPreferences,
            pantry: {
                products: pantryProducts,
                recentMovements: pantryMovements,
                totalProducts: pantryProducts.length,
                lowStockCount: pantryProducts.filter(product => product.quantity <= (product.lowStockThreshold ?? 0)).length
            },
            purchaseImports
        };
        data.routineSummary = summarizeRoutines(data);
        data.routineSummaries = summarizeRoutineScopes(data, currentUser.id);
        return data;
    }

    mutate(
        familyIdOrRevision: string | number | null | undefined,
        expectedRevisionOrMutator: number | null | undefined | ((data: AppData) => AppData),
        mutatorOrActor?: ((data: AppData) => AppData) | User,
        currentUserOverride?: User
    ) {
        const familyId = typeof familyIdOrRevision === 'string'
            ? familyIdOrRevision
            : this.resolveFamilyId(currentUserOverride || (typeof mutatorOrActor === 'object' ? mutatorOrActor : undefined));
        const expectedRevision = typeof familyIdOrRevision === 'string'
            ? expectedRevisionOrMutator as number | null | undefined
            : familyIdOrRevision;
        const mutator = typeof familyIdOrRevision === 'string'
            ? mutatorOrActor as (data: AppData) => AppData
            : expectedRevisionOrMutator as (data: AppData) => AppData;
        const actor = typeof mutatorOrActor === 'object' ? mutatorOrActor : currentUserOverride;

        const revision = this.getRevision(familyId);
        if (typeof expectedRevision !== 'number') {
            throw new RevisionRequiredError('A loaded server revision is required before changing family data');
        }
        if (expectedRevision !== revision) {
            throw new RevisionConflictError(`Data changed on the server; reload required (server revision ${revision})`);
        }

        return this.persistedTransaction(() => {
            const current = this.getAppData(familyId, actor);
            const next = mutator(current);
            this.replaceFamilyData(familyId, next);
            const nextRevision = revision + 1;
            this.setFamilyRevision(familyId, nextRevision);
            return {
                revision: nextRevision,
                data: this.getAppData(familyId, actor)
            };
        });
    }

    mutateCommand(
        familyId: string,
        expectedRevision: number | null | undefined,
        receipt: { mutationId: string; actorId: string; operation: string; requestHash: string },
        mutator: (data: AppData) => AppData,
        actor: User
    ) {
        if (typeof expectedRevision !== 'number') {
            throw new RevisionRequiredError('A loaded server revision is required before changing family data');
        }

        const existing = this.selectRows(
            'SELECT * FROM mutation_receipts WHERE family_id = ? AND mutation_id = ?',
            [familyId, receipt.mutationId]
        )[0];
        if (existing) {
            this.assertMatchingReceipt(existing, receipt);
            const revision = this.getRevision(familyId);
            this.operationMetrics.commandDuplicate += 1;
            if (expectedRevision !== revision) this.operationMetrics.commandRebased += 1;
            return {
                revision,
                data: this.getAppData(familyId, actor),
                command: {
                    duplicate: true,
                    rebased: expectedRevision !== revision
                }
            };
        }

        const writeTargets = commandWriteTargets(receipt.operation);
        if (!writeTargets) {
            throw new Error(`No route-scoped write set is registered for ${receipt.operation}`);
        }

        const result = this.persistedTransaction(() => {
            const revision = this.getRevision(familyId);
            const receiptInTransaction = this.selectRows(
                'SELECT * FROM mutation_receipts WHERE family_id = ? AND mutation_id = ?',
                [familyId, receipt.mutationId]
            )[0];
            if (receiptInTransaction) {
                this.assertMatchingReceipt(receiptInTransaction, receipt);
                return {
                    revision,
                    data: this.getAppData(familyId, actor),
                    command: {
                        duplicate: true,
                        rebased: expectedRevision !== revision
                    }
                };
            }
            if (expectedRevision > revision) {
                throw new RevisionConflictError(
                    `Client revision ${expectedRevision} is ahead of server revision ${revision}`
                );
            }

            const current = this.getAppData(familyId, actor);
            const next = mutator(current);
            this.assertWriteSetCoversChanges(current, next, writeTargets, receipt.operation);
            const hasChanges = writeTargets.some(target => (
                JSON.stringify(this.writeTargetValue(current, target)) !== JSON.stringify(this.writeTargetValue(next, target))
            ));
            if (hasChanges) this.replaceFamilyData(familyId, next, writeTargets);
            const nextRevision = hasChanges ? revision + 1 : revision;
            if (hasChanges) this.setFamilyRevision(familyId, nextRevision);
            const now = Date.now();
            this.db.run(
                `INSERT INTO mutation_receipts (
                    family_id, mutation_id, actor_id, operation, request_hash, revision, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    familyId,
                    receipt.mutationId,
                    receipt.actorId,
                    receipt.operation,
                    receipt.requestHash,
                    nextRevision,
                    now
                ]
            );
            this.db.run('DELETE FROM mutation_receipts WHERE created_at < ?', [now - MUTATION_RECEIPT_RETENTION_MS]);
            return {
                revision: nextRevision,
                data: this.getAppData(familyId, actor),
                command: {
                    duplicate: false,
                    rebased: expectedRevision !== revision
                }
            };
        });
        if (result.command.duplicate) this.operationMetrics.commandDuplicate += 1;
        if (result.command.rebased) this.operationMetrics.commandRebased += 1;
        return result;
    }

    exportEnvelope(familyOrActor?: string | User) {
        const familyId = this.resolveFamilyId(familyOrActor);
        return {
            revision: this.getRevision(familyId),
            data: this.getAppData(familyOrActor)
        };
    }

    getFamily(familyId: string): Family | undefined {
        const row = this.selectRows('SELECT * FROM families WHERE id = ?', [familyId])[0];
        return row ? rowToFamily(row) : undefined;
    }

    resolveActor(auth: AuthContext): User | undefined {
        if (auth.telegramId === 0) {
            return this.getAppData(DEFAULT_FAMILY_ID).currentUser;
        }
        const byId = auth.telegramId
            ? this.selectRows('SELECT * FROM users WHERE is_active = 1 AND telegram_id = ? LIMIT 1', [auth.telegramId])[0]
            : undefined;
        if (byId) return rowToUser(byId);
        if (!auth.username) return undefined;
        const row = this.selectRows(
            'SELECT * FROM users WHERE is_active = 1 AND lower(telegram_username) = ? LIMIT 1',
            [auth.username.toLowerCase()]
        )[0];
        return row ? rowToUser(row) : undefined;
    }

    createFamilyInvite(options: {
        familyId?: string;
        familyName?: string;
        createdById: string;
        role?: Role;
        ttlMs?: number;
    }): FamilyInvite {
        const now = Date.now();
        const token = `fi_${randomUUID().replace(/-/g, '')}`;
        const invite: FamilyInvite = {
            token,
            familyId: options.familyId,
            familyName: options.familyName,
            role: options.role || 'CHILD',
            createdById: options.createdById,
            createdAt: now,
            expiresAt: now + (options.ttlMs || 1000 * 60 * 60 * 24 * 14)
        };
        return this.persistedTransaction(() => {
            this.db.run(
                `INSERT INTO family_invites (
                    token, family_id, family_name, role, created_by_id, created_at, expires_at, used_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    invite.token,
                    nullable(invite.familyId),
                    nullable(invite.familyName),
                    invite.role,
                    invite.createdById,
                    invite.createdAt,
                    nullable(invite.expiresAt),
                    null
                ]
            );
            return invite;
        });
    }

    acceptFamilyInvite(token: string, auth: AuthContext) {
        const inviteRow = this.selectRows('SELECT * FROM family_invites WHERE token = ?', [token])[0];
        if (!inviteRow) throw Object.assign(new InviteError('Invite not found'), { status: 404 });
        const invite = rowToFamilyInvite(inviteRow);
        if (invite.usedAt) throw Object.assign(new InviteError('Invite was already used'), { status: 409 });
        if (invite.expiresAt && invite.expiresAt < Date.now()) throw Object.assign(new InviteError('Invite expired'), { status: 410 });
        if (!auth.telegramId) throw Object.assign(new InviteError('Telegram identity is required'), { status: 401 });

        const existing = this.resolveActor(auth);
        if (existing) {
            if (invite.familyId && existing.familyId === invite.familyId) {
                this.markInviteUsed(token);
                return this.exportEnvelope(existing);
            }
            throw Object.assign(new InviteError('This Telegram account already belongs to another family'), { status: 409 });
        }

        const familyId = invite.familyId || `fam-${randomUUID()}`;
        const user: User = {
            id: `u-${randomUUID()}`,
            familyId,
            name: auth.firstName || auth.username || 'Новый участник',
            role: invite.familyId ? invite.role : 'OWNER',
            avatar: invite.familyId && invite.role === 'CHILD' ? '👦🏻' : '🙂',
            xp: 0,
            level: 1,
            isActive: true,
            telegramId: auth.telegramId,
            telegramUsername: auth.username,
            telegramFirstName: auth.firstName,
            telegramLastName: auth.lastName,
            avatarUrl: normalizeAvatarUrl(auth.photoUrl),
            streak: 0
        };

        return this.persistedTransaction(() => {
            if (!invite.familyId) {
                this.insertFamily({
                    id: familyId,
                    name: invite.familyName || `${user.name}'s family`,
                    ownerUserId: user.id,
                    createdAt: Date.now(),
                    revision: 1,
                    settings: { ...DEFAULT_FAMILY_SETTINGS }
                });
                this.replaceFamilyData(familyId, createNewFamilyData(familyId, user, invite.familyName));
            } else {
                this.insertUsers(familyId, [user]);
                this.setFamilyRevision(familyId, this.getRevision(familyId) + 1);
            }
            this.db.run('UPDATE family_invites SET used_at = ? WHERE token = ?', [Date.now(), token]);
            return this.exportEnvelope(user);
        });
    }

    getCachedAiUsage(familyId: string, helperType: AiHelperType, inputHash: string): AiUsage | undefined {
        const row = this.selectRows(
            `SELECT * FROM ai_usage
             WHERE family_id = ? AND helper_type = ? AND input_hash = ? AND response_json IS NOT NULL
             ORDER BY created_at DESC LIMIT 1`,
            [familyId, helperType, inputHash]
        )[0];
        return row ? rowToAiUsage(row) : undefined;
    }

    countAiUsageSince(familyId: string, since: number) {
        return Number(this.selectValue(
            'SELECT COUNT(*) FROM ai_usage WHERE family_id = ? AND created_at >= ? AND cached = 0',
            [familyId, since]
        ) || 0);
    }

    logAiUsage(usage: Omit<AiUsage, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
        const row: AiUsage = {
            id: usage.id || `ai-${randomUUID()}`,
            createdAt: usage.createdAt || Date.now(),
            ...usage
        };
        return this.persistedTransaction(() => {
            this.db.run(
                `INSERT INTO ai_usage (
                    id, family_id, actor_id, helper_type, input_hash, model, input_chars,
                    output_tokens, estimated_cost, cached, response_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    row.id,
                    row.familyId,
                    row.actorId,
                    row.helperType,
                    row.inputHash,
                    row.model,
                    row.inputChars,
                    row.outputTokens,
                    row.estimatedCost,
                    boolToInt(row.cached),
                    row.responseJson,
                    row.createdAt
                ]
            );
            return row;
        });
    }

    close() {
        this.db.close();
    }

    private migrate() {
        this.createSchema();
        this.ensureLegacyFamilyIds();
        this.ensureBudgetsSchema();
        this.addColumnIfMissing('tasks', 'sort_order', 'INTEGER');
        this.addColumnIfMissing('tasks', 'difficulty', "TEXT NOT NULL DEFAULT 'MEDIUM'");
        this.db.run("UPDATE tasks SET difficulty = 'MEDIUM' WHERE difficulty NOT IN ('EASY', 'MEDIUM', 'HARD')");
        this.addColumnIfMissing('families', 'settings_json', 'TEXT');
        this.addColumnIfMissing('users', 'telegram_first_name', 'TEXT');
        this.addColumnIfMissing('users', 'telegram_last_name', 'TEXT');
        this.addColumnIfMissing('users', 'avatar_url', 'TEXT');
        this.addColumnIfMissing('tasks', 'notification_mode', "TEXT NOT NULL DEFAULT 'INHERIT'");
        this.addColumnIfMissing('tasks', 'completed_at', 'INTEGER');
        this.addColumnIfMissing('tasks', 'completed_by_id', 'TEXT');
        this.addColumnIfMissing('tasks', 'rewarded_at', 'INTEGER');
        this.addColumnIfMissing('tasks', 'captured_at', 'INTEGER');
        this.addColumnIfMissing('tasks', 'next_action', 'TEXT');
        this.addColumnIfMissing('tasks', 'estimate_minutes', 'INTEGER');
        this.addColumnIfMissing('tasks', 'depends_on_ids_json', 'TEXT');
        this.addColumnIfMissing('tasks', 'routine_template_id', 'TEXT');
        this.addColumnIfMissing('tasks', 'routine_occurrence_key', 'TEXT');
        this.addColumnIfMissing('tasks', 'routine_due_at', 'INTEGER');
        this.addColumnIfMissing('tasks', 'routine_units', 'INTEGER');
        this.addColumnIfMissing('tasks', 'routine_rewarded_units', 'INTEGER');
        this.addColumnIfMissing('rewards', 'is_active', 'INTEGER NOT NULL DEFAULT 1');
        this.addColumnIfMissing('rewards', 'created_by_id', 'TEXT');
        this.addColumnIfMissing('rewards', 'updated_at', 'INTEGER');
        this.addColumnIfMissing('purchase_import_files', 'width', 'INTEGER');
        this.addColumnIfMissing('purchase_import_files', 'height', 'INTEGER');
        this.db.run('UPDATE families SET settings_json = ? WHERE settings_json IS NULL OR settings_json = ?', [json(DEFAULT_FAMILY_SETTINGS), '']);
        this.db.run("UPDATE users SET is_active = 0 WHERE id = 'u4' AND name = 'Дочь' AND role = 'CHILD' AND telegram_id IS NULL");
        this.migrateLegacyRecurringTasks();
        this.removeLegacyDemoPlaystationSavingsGoal();
        this.db.run(
            'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
            [MIGRATION_VERSION, Date.now()]
        );
    }

    private createSchema() {
        this.db.run(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS app_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS families (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                owner_user_id TEXT,
                revision INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                settings_json TEXT
            );
            CREATE TABLE IF NOT EXISTS family_invites (
                token TEXT PRIMARY KEY,
                family_id TEXT,
                family_name TEXT,
                role TEXT NOT NULL,
                created_by_id TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER,
                used_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS mutation_receipts (
                family_id TEXT NOT NULL,
                mutation_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                request_hash TEXT NOT NULL,
                revision INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (family_id, mutation_id)
            );
            CREATE INDEX IF NOT EXISTS idx_mutation_receipts_created_at
                ON mutation_receipts(created_at);
            CREATE TABLE IF NOT EXISTS ai_usage (
                id TEXT PRIMARY KEY,
                family_id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                helper_type TEXT NOT NULL,
                input_hash TEXT NOT NULL,
                model TEXT NOT NULL,
                input_chars INTEGER NOT NULL,
                output_tokens INTEGER NOT NULL,
                estimated_cost INTEGER NOT NULL,
                cached INTEGER NOT NULL,
                response_json TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS users (
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                avatar TEXT NOT NULL,
                xp INTEGER NOT NULL,
                level INTEGER NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 1,
                telegram_id INTEGER,
                telegram_username TEXT,
                telegram_first_name TEXT,
                telegram_last_name TEXT,
                avatar_url TEXT,
                streak INTEGER NOT NULL,
                last_login_date TEXT
            );
            CREATE TABLE IF NOT EXISTS epics (
                family_id TEXT NOT NULL,
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
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                status TEXT NOT NULL,
                priority TEXT NOT NULL,
                difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
                points INTEGER NOT NULL,
                assignee_id TEXT,
                created_by_id TEXT NOT NULL,
                epic_id TEXT,
                subtasks_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                sort_order INTEGER,
                due_date TEXT,
                reminder_time TEXT,
                visible_to_json TEXT,
                is_recurring INTEGER NOT NULL,
                frequency TEXT,
                notification_mode TEXT NOT NULL DEFAULT 'INHERIT',
                completed_at INTEGER,
                completed_by_id TEXT,
                rewarded_at INTEGER,
                captured_at INTEGER,
                next_action TEXT,
                estimate_minutes INTEGER,
                depends_on_ids_json TEXT,
                routine_template_id TEXT,
                routine_occurrence_key TEXT,
                routine_due_at INTEGER,
                routine_units INTEGER,
                routine_rewarded_units INTEGER
            );
            CREATE TABLE IF NOT EXISTS accounts (
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                balance INTEGER NOT NULL,
                type TEXT NOT NULL,
                goal_id TEXT,
                created_by_id TEXT,
                visible_to_json TEXT
            );
            CREATE TABLE IF NOT EXISTS financial_goals (
                family_id TEXT NOT NULL,
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
                family_id TEXT NOT NULL,
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
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                goal_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                amount INTEGER NOT NULL,
                message TEXT,
                date INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS subscriptions (
                family_id TEXT NOT NULL,
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
                family_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                limit_amount INTEGER NOT NULL,
                PRIMARY KEY (family_id, category_id)
            );
            CREATE TABLE IF NOT EXISTS transactions (
                family_id TEXT NOT NULL,
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
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                cost INTEGER NOT NULL,
                icon TEXT NOT NULL,
                description TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_by_id TEXT,
                updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS reward_logs (
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                action TEXT NOT NULL,
                amount INTEGER NOT NULL,
                description TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS inventory (
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                reward_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                status TEXT NOT NULL,
                purchased_at INTEGER NOT NULL,
                used_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS shopping_items (
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                added_by_id TEXT NOT NULL,
                is_completed INTEGER NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS events (
                family_id TEXT NOT NULL,
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                scope TEXT NOT NULL,
                content_type TEXT NOT NULL,
                title TEXT NOT NULL,
                body TEXT,
                checklist_items_json TEXT NOT NULL,
                created_by_id TEXT NOT NULL,
                updated_by_id TEXT,
                is_pinned INTEGER NOT NULL,
                is_archived INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_notes_family_scope ON notes(family_id, scope);
            CREATE INDEX IF NOT EXISTS idx_notes_family_created_by ON notes(family_id, created_by_id);
            CREATE TABLE IF NOT EXISTS routine_templates (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE TABLE IF NOT EXISTS routine_events (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                routine_id TEXT NOT NULL,
                type TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_routine_events_family_routine
                ON routine_events(family_id, routine_id, timestamp);
            CREATE TABLE IF NOT EXISTS wishlists (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE TABLE IF NOT EXISTS user_preferences (
                family_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (family_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS pantry_products (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE TABLE IF NOT EXISTS pantry_movements (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                product_id TEXT NOT NULL,
                type TEXT NOT NULL,
                quantity_delta REAL NOT NULL,
                quantity_after REAL NOT NULL,
                actor_id TEXT NOT NULL,
                source_id TEXT,
                rollback_of_id TEXT,
                note TEXT,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE INDEX IF NOT EXISTS idx_pantry_movements_family_product
                ON pantry_movements(family_id, product_id, created_at);
            CREATE TABLE IF NOT EXISTS purchase_imports (
                family_id TEXT NOT NULL,
                id TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                status TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (family_id, id)
            );
            CREATE TABLE IF NOT EXISTS purchase_import_items (
                family_id TEXT NOT NULL,
                import_id TEXT NOT NULL,
                id TEXT NOT NULL,
                data_json TEXT NOT NULL,
                PRIMARY KEY (family_id, import_id, id)
            );
            CREATE TABLE IF NOT EXISTS purchase_import_files (
                family_id TEXT NOT NULL,
                import_id TEXT NOT NULL,
                page INTEGER NOT NULL,
                path TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                created_at INTEGER NOT NULL,
                PRIMARY KEY (family_id, import_id, page)
            );
        `);
    }

    private ensureLegacyFamilyIds() {
        const legacyRevision = Number(this.getState('revision') || 0);
        this.db.run(
            'INSERT OR IGNORE INTO families (id, name, owner_user_id, revision, created_at) VALUES (?, ?, ?, ?, ?)',
            [DEFAULT_FAMILY_ID, DEFAULT_FAMILY_NAME, null, legacyRevision, Date.now()]
        );

        for (const table of TENANT_TABLES) {
            if (table === 'budgets') continue;
            this.addColumnIfMissing(table, 'family_id', 'TEXT');
            this.db.run(`UPDATE ${table} SET family_id = ? WHERE family_id IS NULL OR family_id = ''`, [DEFAULT_FAMILY_ID]);
        }
        this.addColumnIfMissing('tasks', 'sort_order', 'INTEGER');
        this.db.run('UPDATE tasks SET sort_order = rowid * 1000 WHERE sort_order IS NULL');

        const ownerId = this.selectValue(
            "SELECT id FROM users WHERE family_id = ? AND role = 'OWNER' AND is_active = 1 ORDER BY rowid LIMIT 1",
            [DEFAULT_FAMILY_ID]
        ) || this.selectValue('SELECT id FROM users WHERE family_id = ? ORDER BY rowid LIMIT 1', [DEFAULT_FAMILY_ID]);
        if (ownerId) {
            this.db.run('UPDATE families SET owner_user_id = COALESCE(owner_user_id, ?) WHERE id = ?', [String(ownerId), DEFAULT_FAMILY_ID]);
        }
    }

    private ensureBudgetsSchema() {
        const columns = this.tableInfo('budgets');
        const familyColumn = columns.find(row => row.name === 'family_id');
        const categoryColumn = columns.find(row => row.name === 'category_id');
        const hasCompositePk = Number(familyColumn?.pk) === 1 && Number(categoryColumn?.pk) === 2;
        if (familyColumn && hasCompositePk) {
            this.db.run('UPDATE budgets SET family_id = ? WHERE family_id IS NULL OR family_id = ?', [DEFAULT_FAMILY_ID, '']);
            return;
        }

        this.db.run('DROP TABLE IF EXISTS budgets_legacy_migration');
        this.db.run('ALTER TABLE budgets RENAME TO budgets_legacy_migration');
        this.db.run(`
            CREATE TABLE budgets (
                family_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                limit_amount INTEGER NOT NULL,
                PRIMARY KEY (family_id, category_id)
            )
        `);
        const hasLegacyFamily = columns.some(row => row.name === 'family_id');
        const familyExpression = hasLegacyFamily ? `COALESCE(family_id, '${DEFAULT_FAMILY_ID}')` : `'${DEFAULT_FAMILY_ID}'`;
        this.db.run(`
            INSERT OR REPLACE INTO budgets (family_id, category_id, limit_amount)
            SELECT ${familyExpression}, category_id, limit_amount FROM budgets_legacy_migration
        `);
        this.db.run('DROP TABLE budgets_legacy_migration');
    }

    private migrateLegacyRecurringTasks() {
        const rows = this.selectRows(
            `SELECT tasks.*, families.settings_json
             FROM tasks
             JOIN families ON families.id = tasks.family_id
             WHERE tasks.is_recurring = 1
               AND tasks.status NOT IN ('DONE', 'DROPPED')
               AND (tasks.routine_template_id IS NULL OR tasks.routine_template_id = '')`
        );
        for (const row of rows) {
            const taskId = String(row.id);
            const routineId = `routine-legacy-${taskId}`;
            const frequency = String(row.frequency || 'WEEKLY');
            const schedule = frequency === 'DAILY'
                ? { kind: 'DAILY' }
                : frequency === 'MONTHLY'
                    ? { kind: 'MONTHLY', dayOfMonth: Number(String(row.due_date || '').slice(8, 10)) || 1 }
                    : frequency === 'YEARLY'
                        ? {
                            kind: 'YEARLY',
                            month: Number(String(row.due_date || '').slice(5, 7)) || 1,
                            day: Number(String(row.due_date || '').slice(8, 10)) || 1
                        }
                        : { kind: 'INTERVAL_WEEKS', interval: 1, weekDays: [new Date(`${row.due_date || '1970-01-05'}T00:00:00.000Z`).getUTCDay()] };
            const settings = normalizeFamilySettings(parseJson(row.settings_json, DEFAULT_FAMILY_SETTINGS));
            const createdAt = toNumber(row.created_at, Date.now());
            const startDate = typeof row.due_date === 'string' && row.due_date ? row.due_date : new Date(createdAt).toISOString().slice(0, 10);
            const template: RoutineTemplate = {
                id: routineId,
                title: String(row.title),
                description: typeof row.description === 'string' ? row.description : undefined,
                kind: 'SCHEDULED',
                schedule: schedule as RoutineTemplate['schedule'],
                assignmentMode: row.assignee_id ? 'FIXED' : 'FREE',
                assigneeIds: row.assignee_id ? [String(row.assignee_id)] : [],
                difficulty: String(row.difficulty || 'MEDIUM') as RoutineTemplate['difficulty'],
                priority: String(row.priority || 'MEDIUM') as RoutineTemplate['priority'],
                visibility: Array.isArray(parseJson(row.visible_to_json, [])) && parseJson<unknown[]>(row.visible_to_json, []).length > 0
                    ? 'PERSONAL'
                    : 'FAMILY',
                ownerId: Array.isArray(parseJson(row.visible_to_json, [])) ? String(parseJson<unknown[]>(row.visible_to_json, [])[0] || '') || undefined : undefined,
                startDate,
                time: safeIsoClock(row.reminder_time),
                timezone: settings.timezone,
                paused: false,
                nextOccurrenceDate: typeof row.due_date === 'string' ? row.due_date : startDate,
                openTaskId: taskId,
                accumulatedUnits: 0,
                streak: 0,
                createdById: String(row.created_by_id),
                createdAt,
                updatedAt: Date.now()
            };
            const event: RoutineEvent = {
                id: `routine-event-migrated-${taskId}`,
                routineId,
                type: 'MIGRATED',
                actorId: String(row.created_by_id),
                taskId,
                occurrenceKey: template.nextOccurrenceDate,
                timestamp: Date.now(),
                payload: { legacyTaskId: taskId, legacyFrequency: frequency }
            };
            this.db.run(
                'INSERT OR IGNORE INTO routine_templates (family_id, id, data_json) VALUES (?, ?, ?)',
                [String(row.family_id), routineId, json(template)]
            );
            this.db.run(
                `INSERT OR IGNORE INTO routine_events (
                    family_id, id, routine_id, type, actor_id, timestamp, data_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [String(row.family_id), event.id, routineId, event.type, event.actorId, event.timestamp, json(event)]
            );
            this.db.run(
                `UPDATE tasks SET routine_template_id = ?, routine_occurrence_key = ?, captured_at = COALESCE(captured_at, created_at)
                 WHERE family_id = ? AND id = ?`,
                [routineId, template.nextOccurrenceDate, String(row.family_id), taskId]
            );
        }
    }

    private removeLegacyDemoPlaystationSavingsGoal() {
        const migrationRecorded = Number(this.selectValue(
            'SELECT COUNT(*) FROM schema_migrations WHERE version = ?',
            [DEMO_PLAYSTATION_CLEANUP_MIGRATION]
        ) || 0);
        if (migrationRecorded > 0) return;

        const params = [
            DEMO_PLAYSTATION_SAVINGS_GOAL.id,
            DEMO_PLAYSTATION_SAVINGS_GOAL.title,
            DEMO_PLAYSTATION_SAVINGS_GOAL.targetAmount,
            DEMO_PLAYSTATION_SAVINGS_GOAL.currentAmount,
            DEMO_PLAYSTATION_SAVINGS_GOAL.status,
            DEMO_PLAYSTATION_SAVINGS_GOAL.icon,
            DEMO_PLAYSTATION_SAVINGS_GOAL.createdById
        ];
        const matchWhere = `
            id = ?
            AND title = ?
            AND description IS NULL
            AND target_amount = ?
            AND current_amount = ?
            AND status = ?
            AND icon = ?
            AND created_by_id = ?
            AND NOT EXISTS (
                SELECT 1 FROM goal_contributions
                WHERE goal_contributions.family_id = savings_goals.family_id
                    AND goal_contributions.goal_id = savings_goals.id
            )
        `;
        const affectedFamilies = this.selectRows(
            `SELECT DISTINCT family_id FROM savings_goals WHERE ${matchWhere}`,
            params
        ).map(row => String(row.family_id));

        if (affectedFamilies.length > 0) {
            this.db.run(`DELETE FROM savings_goals WHERE ${matchWhere}`, params);
            for (const familyId of affectedFamilies) {
                this.db.run('UPDATE families SET revision = revision + 1 WHERE id = ?', [familyId]);
            }
        }

        this.db.run(
            'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
            [DEMO_PLAYSTATION_CLEANUP_MIGRATION, Date.now()]
        );
    }

    private seedIfEmpty() {
        if (Number(this.selectValue('SELECT COUNT(*) FROM users WHERE family_id = ?', [DEFAULT_FAMILY_ID]) || 0) > 0) return;
        const seed = process.env.NODE_ENV === 'production' && process.env.FAMTRACK_BOOTSTRAP_DEMO !== '1'
            ? createProductionBootstrapData()
            : cloneInitialData();
        this.insertFamily({
            id: DEFAULT_FAMILY_ID,
            name: seed.family?.name || DEFAULT_FAMILY_NAME,
            ownerUserId: seed.currentUser.id,
            createdAt: Date.now(),
            revision: 1,
            settings: { ...DEFAULT_FAMILY_SETTINGS }
        });
        this.replaceFamilyData(DEFAULT_FAMILY_ID, seed);
        this.setFamilyRevision(DEFAULT_FAMILY_ID, 1);
    }

    private validateMigration() {
        const familyCount = Number(this.selectValue('SELECT COUNT(*) FROM families') || 0);
        if (familyCount <= 0) {
            throw new Error('Migration validation failed: no families found');
        }
        for (const table of TENANT_TABLES) {
            const missing = Number(this.selectValue(`SELECT COUNT(*) FROM ${table} WHERE family_id IS NULL OR family_id = ''`) || 0);
            if (missing > 0) {
                throw new Error(`Migration validation failed: ${table} has rows without family_id`);
            }
        }
        const missingTaskOrder = Number(this.selectValue('SELECT COUNT(*) FROM tasks WHERE sort_order IS NULL') || 0);
        if (missingTaskOrder > 0) {
            throw new Error('Migration validation failed: tasks without sort_order');
        }
        const invalidTaskDifficulty = Number(this.selectValue(
            "SELECT COUNT(*) FROM tasks WHERE difficulty NOT IN ('EASY', 'MEDIUM', 'HARD')"
        ) || 0);
        if (invalidTaskDifficulty > 0) {
            throw new Error('Migration validation failed: tasks with invalid difficulty');
        }
        const migrationRecorded = Number(this.selectValue('SELECT COUNT(*) FROM schema_migrations WHERE version = ?', [MIGRATION_VERSION]) || 0);
        if (migrationRecorded <= 0) {
            throw new Error('Migration validation failed: migration version was not recorded');
        }
    }

    private replaceFamilyData(
        familyId: string,
        data: AppData,
        writeTargets: readonly FamilyWriteTarget[] = ALL_FAMILY_WRITE_TARGETS
    ) {
        const targets = new Set(writeTargets);
        const members = [
            ...(data.members || []),
            ...((data.archivedMembers || []).filter(archived => !(data.members || []).some(member => member.id === archived.id)))
        ];
        if (targets.has('members')) {
            this.deleteMissingRows(familyId, 'users', 'id', members.map(item => item.id));
            this.insertUsers(familyId, members);
        }
        if (targets.has('epics')) {
            this.deleteMissingRows(familyId, 'epics', 'id', (data.epics || []).map(item => item.id));
            this.insertEpics(familyId, data.epics || []);
        }
        if (targets.has('tasks')) {
            this.deleteMissingRows(familyId, 'tasks', 'id', (data.tasks || []).map(item => item.id));
            this.insertTasks(familyId, data.tasks || []);
        }
        if (targets.has('accounts')) {
            this.deleteMissingRows(familyId, 'accounts', 'id', (data.accounts || []).map(item => item.id));
            this.insertAccounts(familyId, data.accounts || []);
        }
        if (targets.has('goals')) {
            this.deleteMissingRows(familyId, 'financial_goals', 'id', (data.goals || []).map(item => item.id));
            this.insertFinancialGoals(familyId, data.goals || []);
        }
        if (targets.has('savingsGoals')) {
            this.deleteMissingRows(familyId, 'savings_goals', 'id', (data.savingsGoals || []).map(item => item.id));
            this.insertSavingsGoals(familyId, data.savingsGoals || []);
        }
        if (targets.has('contributions')) {
            this.deleteMissingRows(familyId, 'goal_contributions', 'id', (data.contributions || []).map(item => item.id));
            this.insertContributions(familyId, data.contributions || []);
        }
        if (targets.has('subscriptions')) {
            this.deleteMissingRows(familyId, 'subscriptions', 'id', (data.subscriptions || []).map(item => item.id));
            this.insertSubscriptions(familyId, data.subscriptions || []);
        }
        if (targets.has('budgets')) {
            this.deleteMissingRows(familyId, 'budgets', 'category_id', (data.budgets || []).map(item => item.categoryId));
            this.insertBudgets(familyId, data.budgets || []);
        }
        if (targets.has('transactions')) {
            this.deleteMissingRows(familyId, 'transactions', 'id', (data.transactions || []).map(item => item.id));
            this.insertTransactions(familyId, data.transactions || []);
        }
        if (targets.has('rewards')) {
            this.deleteMissingRows(familyId, 'rewards', 'id', (data.rewards || []).map(item => item.id));
            this.insertRewards(familyId, data.rewards || []);
        }
        if (targets.has('rewardLogs')) {
            this.deleteMissingRows(familyId, 'reward_logs', 'id', (data.rewardLogs || []).map(item => item.id));
            this.insertRewardLogs(familyId, data.rewardLogs || []);
        }
        if (targets.has('inventory')) {
            this.deleteMissingRows(familyId, 'inventory', 'id', (data.inventory || []).map(item => item.id));
            this.insertInventory(familyId, data.inventory || []);
        }
        if (targets.has('shoppingList')) {
            this.deleteMissingRows(familyId, 'shopping_items', 'id', (data.shoppingList || []).map(item => item.id));
            this.insertShoppingItems(familyId, data.shoppingList || []);
        }
        if (targets.has('notes')) {
            this.deleteMissingRows(familyId, 'notes', 'id', (data.notes || []).map(item => item.id));
            this.insertNotes(familyId, data.notes || []);
        }
        if (targets.has('events')) {
            this.deleteMissingRows(familyId, 'events', 'id', (data.events || []).map(item => item.id));
            this.insertEvents(familyId, data.events || []);
        }
        if (targets.has('routines')) {
            this.deleteMissingRows(familyId, 'routine_templates', 'id', (data.routines || []).map(item => item.id));
            this.insertRoutineTemplates(familyId, data.routines || []);
        }
        if (targets.has('routineEvents')) {
            this.insertRoutineEvents(familyId, data.routineEvents || []);
        }
        if (targets.has('wishlists')) {
            this.deleteMissingRows(familyId, 'wishlists', 'id', (data.wishlists || []).map(item => item.id));
            this.insertWishlists(familyId, data.wishlists || []);
        }
        if (targets.has('dashboardPreferences') && data.dashboardPreferences) {
            this.insertDashboardPreference(familyId, data.dashboardPreferences);
        }
        if (targets.has('pantry') && data.pantry) {
            this.deleteMissingRows(familyId, 'pantry_products', 'id', data.pantry.products.map(item => item.id));
            this.insertPantryProducts(familyId, data.pantry.products);
            this.insertPantryMovements(familyId, data.pantry.recentMovements);
        }
        if (targets.has('purchaseImports')) {
            this.deleteMissingRows(familyId, 'purchase_imports', 'id', (data.purchaseImports || []).map(job => job.id));
            this.insertPurchaseImports(familyId, data.purchaseImports || []);
            this.db.run(`
                DELETE FROM purchase_import_items
                WHERE family_id = ? AND import_id NOT IN (
                    SELECT id FROM purchase_imports WHERE family_id = ?
                )
            `, [familyId, familyId]);
            this.db.run(`
                DELETE FROM purchase_import_files
                WHERE family_id = ? AND import_id NOT IN (
                    SELECT id FROM purchase_imports WHERE family_id = ?
                )
            `, [familyId, familyId]);
        }

        if (targets.has('family')) {
            const owner = members.find(member => member.isActive !== false && member.role === 'OWNER') || members[0];
            const family = data.family;
            this.db.run(
                `UPDATE families SET name = COALESCE(?, name), owner_user_id = COALESCE(?, owner_user_id),
                 settings_json = ? WHERE id = ?`,
                [
                    nullable(family?.name),
                    family?.ownerUserId || owner?.id || data.currentUser?.id || '',
                    json(normalizeFamilySettings(family?.settings || DEFAULT_FAMILY_SETTINGS)),
                    familyId
                ]
            );
        }
    }

    private assertWriteSetCoversChanges(
        current: AppData,
        next: AppData,
        writeTargets: readonly FamilyWriteTarget[],
        operation: string
    ) {
        const allowed = new Set(writeTargets);
        const uncovered = ALL_FAMILY_WRITE_TARGETS.filter(target => (
            !allowed.has(target)
            && JSON.stringify(this.writeTargetValue(current, target)) !== JSON.stringify(this.writeTargetValue(next, target))
        ));
        if (uncovered.length > 0) {
            throw new Error(`Route-scoped write set for ${operation} misses: ${uncovered.join(', ')}`);
        }
    }

    private writeTargetValue(data: AppData, target: FamilyWriteTarget) {
        if (target === 'family') return data.family;
        if (target === 'members') {
            return [
                ...(data.members || []),
                ...((data.archivedMembers || []).filter(archived => !(data.members || []).some(member => member.id === archived.id)))
            ];
        }
        return data[target];
    }

    private deleteMissingRows(familyId: string, table: string, keyColumn: string, nextIds: string[]) {
        const keep = new Set(nextIds);
        const rows = this.selectRows(`SELECT ${keyColumn} AS id FROM ${table} WHERE family_id = ?`, [familyId]);
        const stmt = this.db.prepare(`DELETE FROM ${table} WHERE family_id = ? AND ${keyColumn} = ?`);
        try {
            for (const row of rows) {
                const id = String(row.id);
                if (!keep.has(id)) {
                    stmt.run([familyId, id]);
                }
            }
        } finally {
            stmt.free();
        }
    }

    private insertFamily(family: Family) {
        this.db.run(
            `INSERT OR REPLACE INTO families (id, name, owner_user_id, revision, created_at, settings_json)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                family.id,
                family.name,
                nullable(family.ownerUserId),
                family.revision,
                family.createdAt,
                json(normalizeFamilySettings(family.settings))
            ]
        );
    }

    private insertUsers(familyId: string, users: User[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO users (
                family_id, id, name, role, avatar, xp, level, is_active,
                telegram_id, telegram_username, telegram_first_name, telegram_last_name,
                avatar_url, streak, last_login_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const user of users) {
                stmt.run([
                    familyId,
                    user.id,
                    user.name,
                    user.role,
                    user.avatar,
                    user.xp,
                    user.level,
                    activeToInt(user.isActive),
                    nullable(user.telegramId),
                    nullable(user.telegramUsername),
                    nullable(user.telegramFirstName),
                    nullable(user.telegramLastName),
                    nullable(normalizeAvatarUrl(user.avatarUrl)),
                    user.streak || 0,
                    nullable(user.lastLoginDate)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertEpics(familyId: string, epics: Epic[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO epics (
                family_id, id, title, priority, color, is_completed, goal_id, created_by_id, visible_to_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const epic of epics) {
                stmt.run([
                    familyId,
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

    private insertTasks(familyId: string, tasks: Task[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO tasks (
                family_id, id, title, description, status, priority, difficulty, points, assignee_id,
                created_by_id, epic_id, subtasks_json, created_at, sort_order, due_date,
                reminder_time, visible_to_json, is_recurring, frequency, notification_mode,
                completed_at, completed_by_id, rewarded_at, captured_at, next_action,
                estimate_minutes, depends_on_ids_json, routine_template_id,
                routine_occurrence_key, routine_due_at, routine_units, routine_rewarded_units
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            tasks.forEach((task, index) => {
                stmt.run([
                    familyId,
                    task.id,
                    task.title,
                    nullable(task.description),
                    task.status,
                    task.priority,
                    task.difficulty || 'MEDIUM',
                    task.points,
                    nullable(task.assigneeId),
                    task.createdById,
                    nullable(task.epicId),
                    json(task.subtasks || []),
                    task.createdAt,
                    task.sortOrder ?? (index + 1) * 1000,
                    nullable(task.dueDate),
                    nullable(task.reminderTime),
                    json(task.visibleTo),
                    boolToInt(task.isRecurring),
                    nullable(task.frequency),
                    task.notificationMode || 'INHERIT',
                    nullable(task.completedAt),
                    nullable(task.completedById),
                    nullable(task.rewardedAt),
                    nullable(task.capturedAt),
                    nullable(task.nextAction),
                    nullable(task.estimateMinutes),
                    json(task.dependsOnIds),
                    nullable(task.routineTemplateId),
                    nullable(task.routineOccurrenceKey),
                    nullable(task.routineDueAt),
                    nullable(task.routineUnits),
                    nullable(task.routineRewardedUnits)
                ]);
            });
        } finally {
            stmt.free();
        }
    }

    private insertAccounts(familyId: string, accounts: Account[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO accounts (
                family_id, id, name, balance, type, goal_id, created_by_id, visible_to_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const account of accounts) {
                stmt.run([
                    familyId,
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

    private insertFinancialGoals(familyId: string, goals: FinancialGoal[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO financial_goals (
                family_id, id, account_id, title, target_amount, current_amount,
                deadline, epic_id, created_by_id, visible_to_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const goal of goals) {
                stmt.run([
                    familyId,
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

    private insertSavingsGoals(familyId: string, goals: SavingsGoal[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO savings_goals (
                family_id, id, title, description, target_amount, current_amount,
                status, icon, created_by_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const goal of goals) {
                stmt.run([
                    familyId,
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

    private insertContributions(familyId: string, contributions: GoalContribution[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO goal_contributions (
                family_id, id, goal_id, user_id, amount, message, date
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const contribution of contributions) {
                stmt.run([
                    familyId,
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

    private insertSubscriptions(familyId: string, subscriptions: Subscription[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO subscriptions (
                family_id, id, title, amount, currency, service_id, frequency,
                next_payment_date, is_auto_pay, account_id, category_id, active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const sub of subscriptions) {
                stmt.run([
                    familyId,
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

    private insertBudgets(familyId: string, budgets: BudgetPlan[]) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO budgets (family_id, category_id, limit_amount) VALUES (?, ?, ?)');
        try {
            for (const budget of budgets) {
                stmt.run([familyId, budget.categoryId, budget.limit]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertTransactions(familyId: string, transactions: Transaction[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO transactions (
                family_id, id, amount, title, type, category_id, account_id,
                to_account_id, date, created_by_id, deviation_reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const tx of transactions) {
                stmt.run([
                    familyId,
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

    private insertRewards(familyId: string, rewards: Reward[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO rewards (
                family_id, id, title, cost, icon, description, is_active, created_by_id, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const reward of rewards) {
                stmt.run([
                    familyId,
                    reward.id,
                    reward.title,
                    reward.cost,
                    reward.icon,
                    nullable(reward.description),
                    activeToInt(reward.isActive),
                    nullable(reward.createdById),
                    nullable(reward.updatedAt)
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertRewardLogs(familyId: string, logs: RewardLog[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO reward_logs (
                family_id, id, user_id, action, amount, description, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const log of logs) {
                stmt.run([
                    familyId,
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

    private insertInventory(familyId: string, items: InventoryItem[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO inventory (
                family_id, id, reward_id, owner_id, status, purchased_at, used_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const item of items) {
                stmt.run([
                    familyId,
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

    private insertShoppingItems(familyId: string, items: ShoppingItem[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO shopping_items (
                family_id, id, title, category, added_by_id, is_completed, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const item of items) {
                stmt.run([
                    familyId,
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

    private insertNotes(familyId: string, notes: Note[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO notes (
                family_id, id, scope, content_type, title, body, checklist_items_json,
                created_by_id, updated_by_id, is_pinned, is_archived, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const note of notes) {
                stmt.run([
                    familyId,
                    note.id,
                    note.scope,
                    note.contentType,
                    note.title,
                    nullable(note.body),
                    json(note.checklistItems || []),
                    note.createdById,
                    nullable(note.updatedById),
                    boolToInt(note.isPinned),
                    boolToInt(note.isArchived),
                    note.createdAt,
                    note.updatedAt
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertEvents(familyId: string, events: AppEvent[]) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO events (family_id, id, type, actor_id, payload_json, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const event of events) {
                stmt.run([
                    familyId,
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

    private insertRoutineTemplates(familyId: string, routines: RoutineTemplate[]) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO routine_templates (family_id, id, data_json) VALUES (?, ?, ?)');
        try {
            for (const routine of routines) stmt.run([familyId, routine.id, json(routine)]);
        } finally {
            stmt.free();
        }
    }

    private insertRoutineEvents(familyId: string, events: RoutineEvent[]) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO routine_events (
                family_id, id, routine_id, type, actor_id, timestamp, data_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const event of events) {
                stmt.run([familyId, event.id, event.routineId, event.type, event.actorId, event.timestamp, json(event)]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertWishlists(familyId: string, wishlists: Wishlist[]) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO wishlists (family_id, id, data_json) VALUES (?, ?, ?)');
        try {
            for (const wishlist of wishlists) stmt.run([familyId, wishlist.id, json(wishlist)]);
        } finally {
            stmt.free();
        }
    }

    private insertDashboardPreference(familyId: string, preference: DashboardPreferences) {
        this.db.run(
            'INSERT OR REPLACE INTO user_preferences (family_id, user_id, data_json) VALUES (?, ?, ?)',
            [familyId, preference.userId, json(preference)]
        );
    }

    private insertPantryProducts(familyId: string, products: PantryProduct[]) {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO pantry_products (family_id, id, data_json) VALUES (?, ?, ?)');
        try {
            for (const product of products) stmt.run([familyId, product.id, json(product)]);
        } finally {
            stmt.free();
        }
    }

    private insertPantryMovements(familyId: string, movements: PantryMovement[]) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO pantry_movements (
                family_id, id, product_id, type, quantity_delta, quantity_after,
                actor_id, source_id, rollback_of_id, note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const movement of movements) {
                stmt.run([
                    familyId,
                    movement.id,
                    movement.productId,
                    movement.type,
                    movement.quantityDelta,
                    movement.quantityAfter,
                    movement.actorId,
                    nullable(movement.sourceId),
                    nullable(movement.rollbackOfId),
                    nullable(movement.note),
                    movement.createdAt
                ]);
            }
        } finally {
            stmt.free();
        }
    }

    private insertPurchaseImports(familyId: string, jobs: PurchaseImportJob[]) {
        const jobStmt = this.db.prepare(`
            INSERT OR REPLACE INTO purchase_imports (
                family_id, id, actor_id, status, data_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const itemStmt = this.db.prepare(`
            INSERT OR REPLACE INTO purchase_import_items (family_id, import_id, id, data_json)
            VALUES (?, ?, ?, ?)
        `);
        const fileStmt = this.db.prepare(`
            INSERT OR REPLACE INTO purchase_import_files (
                family_id, import_id, page, path, mime_type, size_bytes, sha256, width, height, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        try {
            for (const job of jobs) {
                const { items: _items, files: _files, ...storedJob } = job;
                jobStmt.run([familyId, job.id, job.actorId, job.status, json({ ...storedJob, items: [] }), job.createdAt, job.updatedAt]);
                const keepIds = new Set(job.items.map(item => item.id));
                const existingItems = this.selectRows(
                    'SELECT id FROM purchase_import_items WHERE family_id = ? AND import_id = ?',
                    [familyId, job.id]
                );
                for (const row of existingItems) {
                    const itemId = String(row.id);
                    if (!keepIds.has(itemId)) {
                        this.db.run(
                            'DELETE FROM purchase_import_items WHERE family_id = ? AND import_id = ? AND id = ?',
                            [familyId, job.id, itemId]
                        );
                    }
                }
                for (const item of job.items) itemStmt.run([familyId, job.id, item.id, json(item)]);
                const keepPages = new Set((job.files || []).map(file => file.page));
                const existingFiles = this.selectRows(
                    'SELECT page FROM purchase_import_files WHERE family_id = ? AND import_id = ?',
                    [familyId, job.id]
                );
                for (const row of existingFiles) {
                    const page = Number(row.page);
                    if (!keepPages.has(page)) {
                        this.db.run(
                            'DELETE FROM purchase_import_files WHERE family_id = ? AND import_id = ? AND page = ?',
                            [familyId, job.id, page]
                        );
                    }
                }
                for (const file of job.files || []) {
                    if (!file.path) continue;
                    fileStmt.run([
                        familyId,
                        job.id,
                        file.page,
                        file.path,
                        file.mimeType,
                        file.sizeBytes,
                        file.sha256,
                        file.width,
                        file.height,
                        file.createdAt
                    ]);
                }
            }
        } finally {
            jobStmt.free();
            itemStmt.free();
            fileStmt.free();
        }
    }

    private markInviteUsed(token: string) {
        this.persistedTransaction(() => {
            this.db.run('UPDATE family_invites SET used_at = ? WHERE token = ?', [Date.now(), token]);
        });
    }

    private setFamilyRevision(familyId: string, revision: number) {
        this.db.run('UPDATE families SET revision = ? WHERE id = ?', [revision, familyId]);
    }

    private assertMatchingReceipt(
        row: Row,
        receipt: { actorId: string; operation: string; requestHash: string }
    ) {
        if (String(row.actor_id) !== receipt.actorId
            || String(row.operation) !== receipt.operation
            || String(row.request_hash) !== receipt.requestHash) {
            throw new MutationIdConflictError('Mutation id was already used for a different command');
        }
    }

    private persistedTransaction<T>(operation: () => T): T {
        const before = this.db.export();
        const writeStarted = performance.now();
        let committed = false;
        this.db.run('BEGIN IMMEDIATE');
        try {
            const result = operation();
            this.db.run('COMMIT');
            committed = true;
            const persistStarted = performance.now();
            try {
                this.persist();
            } catch (error) {
                this.operationMetrics.persistFailure += 1;
                const restored = new this.SQL.Database(before);
                this.db.close();
                this.db = restored;
                throw error;
            } finally {
                this.recordMetricSample(this.operationMetrics.persistDurationsMs, performance.now() - persistStarted);
            }
            this.recordMetricSample(this.operationMetrics.writeDurationsMs, performance.now() - writeStarted);
            return result;
        } catch (error) {
            if (!committed) {
                try {
                    this.db.run('ROLLBACK');
                } catch {
                    // Preserve the original domain/SQLite error.
                }
            }
            throw error;
        }
    }

    private recordMetricSample(samples: number[], value: number) {
        samples.push(Math.max(0, value));
        if (samples.length > 512) samples.splice(0, samples.length - 512);
    }

    private resolveFamilyId(familyOrActor?: string | User) {
        if (typeof familyOrActor === 'string') return familyOrActor;
        if (familyOrActor?.familyId) return familyOrActor.familyId;
        if (familyOrActor?.id) {
            const familyId = this.selectValue('SELECT family_id FROM users WHERE id = ? LIMIT 1', [familyOrActor.id]);
            if (familyId) return String(familyId);
        }
        return DEFAULT_FAMILY_ID;
    }

    private getState(key: string) {
        const value = this.selectValue('SELECT value FROM app_state WHERE key = ?', [key]);
        return typeof value === 'string' ? value : undefined;
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
        const buffer = Buffer.from(this.db.export());
        const directory = path.dirname(this.dbPath);
        const temporaryPath = path.join(
            directory,
            `.${path.basename(this.dbPath)}.${process.pid}.${randomUUID()}.tmp`
        );
        let fd: number | undefined;
        try {
            fd = fs.openSync(temporaryPath, 'w', 0o600);
            fs.writeFileSync(fd, buffer);
            fs.fsyncSync(fd);
            fs.closeSync(fd);
            fd = undefined;
            fs.renameSync(temporaryPath, this.dbPath);
            try {
                const directoryFd = fs.openSync(directory, 'r');
                try {
                    fs.fsyncSync(directoryFd);
                } finally {
                    fs.closeSync(directoryFd);
                }
            } catch {
                // Some filesystems do not support fsync on directories.
            }
        } catch (error) {
            if (fd !== undefined) fs.closeSync(fd);
            if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
            throw error;
        }
    }

    private tableInfo(table: string) {
        return this.selectRows(`PRAGMA table_info(${table})`);
    }

    private addColumnIfMissing(table: string, column: string, definition: string) {
        const rows = this.tableInfo(table);
        if (!rows.some(row => row.name === column)) {
            this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
    }
}

const createNewFamilyData = (familyId: string, owner: User, familyName?: string): AppData => {
    const seed = cloneInitialData();
    const rewriteId = (id: string) => `${familyId}-${id}`;
    return {
        family: {
            id: familyId,
            name: familyName || `${owner.name}'s family`,
            ownerUserId: owner.id,
            createdAt: Date.now(),
            revision: 1,
            settings: { ...DEFAULT_FAMILY_SETTINGS }
        },
        currentUser: owner,
        members: [owner],
        epics: [],
        tasks: [],
        accounts: [],
        goals: [],
        savingsGoals: [],
        contributions: [],
        subscriptions: [],
        budgets: seed.budgets,
        transactions: [],
        rewards: seed.rewards.map(reward => ({ ...reward, id: rewriteId(reward.id) })),
        rewardLogs: [],
        inventory: [],
        shoppingList: [],
        notes: [],
        events: []
    };
};

const createProductionBootstrapData = (): AppData => {
    const ownerTelegramId = firstNumber(
        process.env.FAMTRACK_OWNER_TELEGRAM_IDS || process.env.FAMTRACK_ALLOWED_TELEGRAM_IDS
    );
    const ownerUsername = firstValue(process.env.FAMTRACK_ALLOWED_TELEGRAM_USERNAMES)?.replace(/^@/, '');
    if (!ownerTelegramId && !ownerUsername) {
        throw new Error(
            'Fresh production database requires FAMTRACK_OWNER_TELEGRAM_IDS, '
            + 'FAMTRACK_ALLOWED_TELEGRAM_IDS or FAMTRACK_ALLOWED_TELEGRAM_USERNAMES'
        );
    }
    const owner: User = {
        id: `u-bootstrap-${randomUUID()}`,
        familyId: DEFAULT_FAMILY_ID,
        name: ownerUsername || 'Владелец',
        role: 'OWNER',
        avatar: '🙂',
        xp: 0,
        level: 1,
        isActive: true,
        telegramId: ownerTelegramId,
        telegramUsername: ownerUsername,
        streak: 0
    };
    return {
        family: {
            id: DEFAULT_FAMILY_ID,
            name: process.env.FAMTRACK_BOOTSTRAP_FAMILY_NAME?.trim() || 'Моя семья',
            ownerUserId: owner.id,
            createdAt: Date.now(),
            revision: 1,
            settings: { ...DEFAULT_FAMILY_SETTINGS }
        },
        currentUser: owner,
        members: [owner],
        epics: [],
        tasks: [],
        accounts: [],
        goals: [],
        savingsGoals: [],
        contributions: [],
        subscriptions: [],
        budgets: [],
        transactions: [],
        rewards: [],
        rewardLogs: [],
        inventory: [],
        shoppingList: [],
        notes: [],
        events: []
    };
};

const firstValue = (value: string | undefined) => value
    ?.split(',')
    .map(item => item.trim())
    .find(Boolean);

const firstNumber = (value: string | undefined) => {
    const parsed = Number(firstValue(value));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const rowToFamily = (row: Row): Family => ({
    id: String(row.id),
    name: String(row.name),
    ownerUserId: row.owner_user_id == null ? undefined : String(row.owner_user_id),
    revision: toNumber(row.revision),
    createdAt: toNumber(row.created_at),
    settings: normalizeFamilySettings(parseJson(row.settings_json, DEFAULT_FAMILY_SETTINGS))
});

const rowToFamilyInvite = (row: Row): FamilyInvite => ({
    token: String(row.token),
    familyId: row.family_id == null ? undefined : String(row.family_id),
    familyName: row.family_name == null ? undefined : String(row.family_name),
    role: row.role as Role,
    createdById: String(row.created_by_id),
    createdAt: toNumber(row.created_at),
    expiresAt: row.expires_at == null ? undefined : toNumber(row.expires_at),
    usedAt: row.used_at == null ? undefined : toNumber(row.used_at)
});

const rowToAiUsage = (row: Row): AiUsage => ({
    id: String(row.id),
    familyId: String(row.family_id),
    actorId: String(row.actor_id),
    helperType: row.helper_type as AiHelperType,
    inputHash: String(row.input_hash),
    model: String(row.model),
    inputChars: toNumber(row.input_chars),
    outputTokens: toNumber(row.output_tokens),
    estimatedCost: toNumber(row.estimated_cost),
    cached: intToBool(row.cached),
    responseJson: String(row.response_json),
    createdAt: toNumber(row.created_at)
});

const rowToUser = (row: Row): User => ({
    id: String(row.id),
    familyId: String(row.family_id),
    name: String(row.name),
    role: row.role as User['role'],
    avatar: String(row.avatar),
    xp: toNumber(row.xp),
    level: toNumber(row.level, 1),
    isActive: row.is_active == null ? true : intToBool(row.is_active),
    telegramId: row.telegram_id == null ? undefined : toNumber(row.telegram_id),
    telegramUsername: row.telegram_username == null ? undefined : String(row.telegram_username),
    telegramFirstName: row.telegram_first_name == null ? undefined : String(row.telegram_first_name),
    telegramLastName: row.telegram_last_name == null ? undefined : String(row.telegram_last_name),
    avatarUrl: normalizeAvatarUrl(row.avatar_url),
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
    difficulty: row.difficulty == null ? 'MEDIUM' : row.difficulty as Task['difficulty'],
    points: toNumber(row.points),
    assigneeId: row.assignee_id == null ? undefined : String(row.assignee_id),
    createdById: String(row.created_by_id),
    epicId: row.epic_id == null ? undefined : String(row.epic_id),
    subtasks: parseJson(row.subtasks_json, []),
    createdAt: toNumber(row.created_at),
    sortOrder: row.sort_order == null ? undefined : toNumber(row.sort_order),
    dueDate: row.due_date == null ? undefined : String(row.due_date),
    reminderTime: row.reminder_time == null ? undefined : String(row.reminder_time),
    visibleTo: parseJson<string[] | undefined>(row.visible_to_json, undefined),
    isRecurring: intToBool(row.is_recurring),
    frequency: row.frequency == null ? undefined : row.frequency as Task['frequency'],
    notificationMode: row.notification_mode == null ? 'INHERIT' : row.notification_mode as Task['notificationMode'],
    completedAt: row.completed_at == null ? undefined : toNumber(row.completed_at),
    completedById: row.completed_by_id == null ? undefined : String(row.completed_by_id),
    rewardedAt: row.rewarded_at == null ? undefined : toNumber(row.rewarded_at),
    capturedAt: row.captured_at == null ? undefined : toNumber(row.captured_at),
    nextAction: row.next_action == null ? undefined : String(row.next_action),
    estimateMinutes: row.estimate_minutes == null ? undefined : toNumber(row.estimate_minutes),
    dependsOnIds: parseJson<string[] | undefined>(row.depends_on_ids_json, undefined),
    routineTemplateId: row.routine_template_id == null ? undefined : String(row.routine_template_id),
    routineOccurrenceKey: row.routine_occurrence_key == null ? undefined : String(row.routine_occurrence_key),
    routineDueAt: row.routine_due_at == null ? undefined : toNumber(row.routine_due_at),
    routineUnits: row.routine_units == null ? undefined : toNumber(row.routine_units),
    routineRewardedUnits: row.routine_rewarded_units == null ? undefined : toNumber(row.routine_rewarded_units)
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
    description: row.description == null ? undefined : String(row.description),
    isActive: row.is_active == null ? true : intToBool(row.is_active),
    createdById: row.created_by_id == null ? undefined : String(row.created_by_id),
    updatedAt: row.updated_at == null ? undefined : toNumber(row.updated_at)
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

const rowToNote = (row: Row): Note => ({
    id: String(row.id),
    scope: row.scope === 'PERSONAL' ? 'PERSONAL' : 'FAMILY',
    contentType: row.content_type === 'CHECKLIST' ? 'CHECKLIST' : 'TEXT',
    title: String(row.title),
    body: row.body == null ? undefined : String(row.body),
    checklistItems: parseJson(row.checklist_items_json, []),
    createdById: String(row.created_by_id),
    updatedById: row.updated_by_id == null ? undefined : String(row.updated_by_id),
    isPinned: intToBool(row.is_pinned),
    isArchived: intToBool(row.is_archived),
    createdAt: toNumber(row.created_at),
    updatedAt: toNumber(row.updated_at)
});

const rowToEvent = (row: Row): AppEvent => ({
    id: String(row.id),
    type: row.type as AppEvent['type'],
    actorId: String(row.actor_id),
    payload: parseJson<Record<string, unknown>>(row.payload_json, {}),
    timestamp: toNumber(row.timestamp)
});

const rowToPantryMovement = (row: Row): PantryMovement => ({
    id: String(row.id),
    productId: String(row.product_id),
    type: row.type as PantryMovement['type'],
    quantityDelta: toNumber(row.quantity_delta),
    quantityAfter: toNumber(row.quantity_after),
    actorId: String(row.actor_id),
    sourceId: row.source_id == null ? undefined : String(row.source_id),
    rollbackOfId: row.rollback_of_id == null ? undefined : String(row.rollback_of_id),
    note: row.note == null ? undefined : String(row.note),
    createdAt: toNumber(row.created_at)
});

const rowToPurchaseImportFile = (row: Row): PurchaseImportFile => ({
    page: toNumber(row.page),
    path: String(row.path),
    mimeType: row.mime_type as PurchaseImportFile['mimeType'],
    sizeBytes: toNumber(row.size_bytes),
    sha256: String(row.sha256),
    width: toNumber(row.width),
    height: toNumber(row.height),
    createdAt: toNumber(row.created_at)
});

export const normalizeAiInputHash = hashInput;
