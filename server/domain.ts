import { randomUUID } from 'node:crypto';
import type { AppData } from '../types.js';
import type { User, Reward, InventoryItem, RewardLog } from '../family.model.js';
import { calculateLevel, calculateStreakBonus } from '../family.model.js';
import type { Epic, Task, TaskDifficulty, TaskStatus } from '../tasks.model.js';
import { calculateTaskXp, getNextRecurringDate } from '../tasks.model.js';
import type { Transaction } from '../finance.model.js';
import type { ShoppingCategoryType, ShoppingItem } from '../shopping.model.js';
import {
    DEFAULT_FAMILY_SETTINGS,
    isTaskNotificationMode,
    normalizeFamilySettings,
    type FamilySettings
} from '../settings.model.js';

export class DomainError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

type Clock = () => number;
type IdFactory = () => string;

export interface TaskStatusCommand {
    taskId: string;
    status: TaskStatus;
    beforeTaskId?: string;
}

export const updateFamilySettings = (
    data: AppData,
    patch: unknown
): AppData => {
    if (!data.family) throw new DomainError('Family settings are unavailable', 409);
    const previous = normalizeFamilySettings(data.family.settings);
    const input = isObject(patch) ? patch : {};
    const settings = normalizeFamilySettings({
        ...previous,
        ...(typeof input.allowParentTaskCompletion === 'boolean'
            ? { allowParentTaskCompletion: input.allowParentTaskCompletion }
            : {}),
        ...(typeof input.taskNotificationMode === 'string'
            ? { taskNotificationMode: input.taskNotificationMode }
            : {}),
        ...(typeof input.timezone === 'string' ? { timezone: input.timezone } : {})
    });
    return {
        ...data,
        family: { ...data.family, settings }
    };
};

export const checkInFamilyMember = (
    data: AppData,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const member = data.members.find(item => item.id === actor.id && item.isActive !== false);
    if (!member) throw new DomainError('Active family member not found', 409);
    const now = clock();
    const timezone = normalizeFamilySettings(data.family?.settings || DEFAULT_FAMILY_SETTINGS).timezone;
    const today = dateInTimezone(now, timezone);
    if (member.lastLoginDate === today) return data;
    const previousDate = member.lastLoginDate ? Date.parse(`${member.lastLoginDate}T00:00:00.000Z`) : Number.NaN;
    const currentDate = Date.parse(`${today}T00:00:00.000Z`);
    const dayDifference = Number.isFinite(previousDate)
        ? Math.round((currentDate - previousDate) / 86_400_000)
        : Number.POSITIVE_INFINITY;
    const streak = dayDifference === 1 ? Math.max(0, member.streak) + 1 : 1;
    const bonus = calculateStreakBonus(streak);
    const xp = member.xp + bonus;
    const members = data.members.map(item => item.id === member.id
        ? { ...item, streak, lastLoginDate: today, xp, level: calculateLevel(xp) }
        : item);
    return {
        ...data,
        members,
        currentUser: members.find(item => item.id === data.currentUser.id) || data.currentUser,
        rewardLogs: [{
            id: `reward-log-${idFactory()}`,
            userId: member.id,
            action: 'EARNED',
            amount: bonus,
            description: `Ежедневный бонус (день ${streak})`,
            timestamp: now
        }, ...data.rewardLogs]
    };
};

export const changeTaskStatus = (
    data: AppData,
    command: TaskStatusCommand,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const validStatuses = new Set<TaskStatus>(['TODO', 'IN_PROGRESS', 'DONE']);
    if (!command.taskId || !validStatuses.has(command.status)) {
        throw new DomainError('A valid task id and status are required');
    }
    const task = data.tasks.find(item => item.id === command.taskId);
    if (!task) throw new DomainError('Task not found', 404);

    const isCompleting = command.status === 'DONE' && task.status !== 'DONE';
    const creditedUserId = task.assigneeId || actor.id;
    const creditedUser = data.members.find(member => member.id === creditedUserId && member.isActive !== false);
    if (!creditedUser) throw new DomainError('Task assignee is not an active family member', 409);

    if (isCompleting && creditedUser.id !== actor.id) {
        const settings = normalizeFamilySettings(data.family?.settings || DEFAULT_FAMILY_SETTINGS);
        const parentCanComplete = isFamilyAdmin(actor)
            && creditedUser.role === 'CHILD'
            && settings.allowParentTaskCompletion;
        if (!parentCanComplete) {
            throw new DomainError('Completing a task for a child is disabled in family settings', 403);
        }
    } else if (!canChangeTask(actor, task)) {
        throw new DomainError('You are not allowed to change this task', 403);
    }

    const now = clock();
    const shouldReward = isCompleting && !task.rewardedAt;
    const nextTask: Task = {
        ...task,
        status: command.status,
        ...(isCompleting ? {
            completedAt: now,
            completedById: actor.id,
            rewardedAt: shouldReward ? now : task.rewardedAt
        } : {})
    };

    const targetColumn = data.tasks
        .filter(item => item.id !== task.id && item.status === command.status)
        .sort(compareTaskOrder);
    const rawInsertIndex = command.beforeTaskId
        ? targetColumn.findIndex(item => item.id === command.beforeTaskId)
        : targetColumn.length;
    const insertIndex = rawInsertIndex < 0 ? targetColumn.length : rawInsertIndex;
    targetColumn.splice(insertIndex, 0, nextTask);
    const ordered = new Map(targetColumn.map((item, index) => [
        item.id,
        { ...item, sortOrder: (index + 1) * 1000 }
    ]));
    let tasks = data.tasks.map(item => ordered.get(item.id) || item);
    let members = data.members;
    let rewardLogs = data.rewardLogs;
    let events = data.events || [];

    if (shouldReward) {
        let levelUp = false;
        members = data.members.map(member => {
            if (member.id !== creditedUser.id) return member;
            const xp = member.xp + Math.max(0, task.points);
            const level = calculateLevel(xp);
            levelUp = level > member.level;
            return { ...member, xp, level };
        });
        const completionLog: RewardLog = {
            id: `reward-log-${idFactory()}`,
            userId: creditedUser.id,
            action: 'EARNED',
            amount: Math.max(0, task.points),
            description: `Выполнено: ${task.title}`,
            timestamp: now
        };
        rewardLogs = [completionLog, ...data.rewardLogs];
        events = [
            {
                id: `event-${idFactory()}`,
                type: 'TASK_COMPLETED',
                actorId: actor.id,
                payload: {
                    taskId: task.id,
                    title: task.title,
                    points: Math.max(0, task.points),
                    creditedUserId: creditedUser.id,
                    completedById: actor.id,
                    completedOnBehalf: creditedUser.id !== actor.id
                },
                timestamp: now
            },
            ...(levelUp ? [{
                id: `event-${idFactory()}`,
                type: 'LEVEL_UP' as const,
                actorId: creditedUser.id,
                payload: {
                    userId: creditedUser.id,
                    level: members.find(member => member.id === creditedUser.id)?.level
                },
                timestamp: now
            }] : []),
            ...events
        ];

        if (task.isRecurring) {
            tasks = [...tasks, createRecurringSuccessor(task, now, idFactory)];
        }
    }

    return {
        ...data,
        tasks,
        members,
        currentUser: members.find(member => member.id === data.currentUser.id) || data.currentUser,
        rewardLogs,
        events
    };
};

export const normalizeTaskForSave = (
    data: AppData,
    rawTask: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): Task => {
    if (!isObject(rawTask)) throw new DomainError('Task payload is required');
    const rawId = typeof rawTask.id === 'string' ? rawTask.id.trim() : '';
    const previous = rawId ? data.tasks.find(task => task.id === rawId) : undefined;
    const memberIds = new Set(data.members.filter(member => member.isActive !== false).map(member => member.id));
    const title = normalizeString(rawTask.title, previous?.title || '', 180);
    if (!title) throw new DomainError('Task title is required');
    const assigneeId = typeof rawTask.assigneeId === 'string' && memberIds.has(rawTask.assigneeId)
        ? rawTask.assigneeId
        : previous?.assigneeId || actor.id;
    const visibleTo = normalizeMemberIds(rawTask.visibleTo, memberIds);
    const notificationMode = isTaskNotificationMode(rawTask.notificationMode)
        ? rawTask.notificationMode
        : previous?.notificationMode || 'INHERIT';
    const priority = rawTask.priority === 'HIGH' || rawTask.priority === 'LOW' || rawTask.priority === 'MEDIUM'
        ? rawTask.priority
        : previous?.priority || 'MEDIUM';
    const difficulty: TaskDifficulty = rawTask.difficulty === 'EASY'
        || rawTask.difficulty === 'MEDIUM'
        || rawTask.difficulty === 'HARD'
        ? rawTask.difficulty
        : previous?.difficulty || 'MEDIUM';
    const frequency = rawTask.frequency === 'DAILY'
        || rawTask.frequency === 'WEEKLY'
        || rawTask.frequency === 'MONTHLY'
        || rawTask.frequency === 'YEARLY'
        ? rawTask.frequency
        : previous?.frequency;
    const subtasks = Array.isArray(rawTask.subtasks)
        ? rawTask.subtasks.filter(isObject).slice(0, 100).map(item => ({
            id: normalizeString(item.id, `subtask-${idFactory()}`, 120),
            title: normalizeString(item.title, 'Пункт', 240),
            isCompleted: item.isCompleted === true
        }))
        : previous?.subtasks || [];

    return {
        id: previous?.id || rawId || `task-${idFactory()}`,
        title,
        description: normalizeOptionalString(rawTask.description, 6000),
        status: previous?.status || 'TODO',
        priority,
        difficulty,
        points: calculateTaskXp(difficulty, priority),
        assigneeId,
        createdById: previous?.createdById || actor.id,
        epicId: typeof rawTask.epicId === 'string' && data.epics.some(epic => epic.id === rawTask.epicId)
            ? rawTask.epicId
            : undefined,
        subtasks,
        createdAt: previous?.createdAt || clock(),
        sortOrder: previous?.sortOrder,
        dueDate: normalizeDate(rawTask.dueDate),
        reminderTime: normalizeTimestamp(rawTask.reminderTime),
        visibleTo,
        isRecurring: rawTask.isRecurring === true,
        frequency: rawTask.isRecurring === true ? frequency || 'WEEKLY' : undefined,
        notificationMode,
        completedAt: previous?.completedAt,
        completedById: previous?.completedById,
        rewardedAt: previous?.rewardedAt
    };
};

export const normalizeEpicForSave = (
    data: AppData,
    rawEpic: unknown,
    actor: User,
    idFactory: IdFactory = randomUUID
): Epic => {
    if (!isObject(rawEpic)) throw new DomainError('Epic payload is required');
    const rawId = typeof rawEpic.id === 'string' ? rawEpic.id.trim() : '';
    const previous = rawId ? data.epics.find(epic => epic.id === rawId) : undefined;
    const title = normalizeString(rawEpic.title, previous?.title || '', 120);
    if (!title) throw new DomainError('Epic title is required');
    const memberIds = new Set(data.members.filter(member => member.isActive !== false).map(member => member.id));
    const colors = new Set([
        'bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500',
        'bg-pink-500', 'bg-orange-500', 'bg-indigo-500', 'bg-teal-500'
    ]);
    const priority = rawEpic.priority === 'HIGH' || rawEpic.priority === 'LOW' || rawEpic.priority === 'MEDIUM'
        ? rawEpic.priority
        : previous?.priority || 'MEDIUM';
    return {
        id: previous?.id || rawId || `epic-${idFactory()}`,
        title,
        priority,
        color: typeof rawEpic.color === 'string' && colors.has(rawEpic.color)
            ? rawEpic.color
            : previous?.color || 'bg-blue-500',
        isCompleted: typeof rawEpic.isCompleted === 'boolean' ? rawEpic.isCompleted : previous?.isCompleted || false,
        goalId: typeof rawEpic.goalId === 'string' && data.goals.some(goal => goal.id === rawEpic.goalId)
            ? rawEpic.goalId
            : undefined,
        createdById: previous?.createdById || actor.id,
        visibleTo: normalizeMemberIds(rawEpic.visibleTo, memberIds)
    };
};

export const normalizeRewardForSave = (
    data: AppData,
    rawReward: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): Reward => {
    if (!isObject(rawReward)) throw new DomainError('Reward payload is required');
    const rawId = typeof rawReward.id === 'string' ? rawReward.id.trim() : '';
    const previous = rawId ? data.rewards.find(reward => reward.id === rawId) : undefined;
    const title = normalizeString(rawReward.title, previous?.title || '', 120);
    if (!title) throw new DomainError('Reward title is required');
    return {
        id: previous?.id || rawId || `reward-${idFactory()}`,
        title,
        cost: clampInteger(rawReward.cost, previous?.cost ?? 0, 1, 100000000),
        icon: normalizeString(rawReward.icon, previous?.icon || '🎁', 16),
        description: normalizeOptionalString(rawReward.description, 500),
        isActive: typeof rawReward.isActive === 'boolean' ? rawReward.isActive : previous?.isActive !== false,
        createdById: previous?.createdById || actor.id,
        updatedAt: clock()
    };
};

export const archiveReward = (data: AppData, rewardId: unknown, clock: Clock = Date.now): AppData => {
    if (typeof rewardId !== 'string' || !rewardId.trim()) throw new DomainError('Reward id is required');
    const existing = data.rewards.find(reward => reward.id === rewardId);
    if (!existing) throw new DomainError('Reward not found', 404);
    return {
        ...data,
        rewards: data.rewards.map(reward => reward.id === rewardId
            ? { ...reward, isActive: false, updatedAt: clock() }
            : reward)
    };
};

export const purchaseReward = (
    data: AppData,
    rewardId: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    if (typeof rewardId !== 'string' || !rewardId.trim()) throw new DomainError('Reward id is required');
    const reward = data.rewards.find(item => item.id === rewardId && item.isActive !== false);
    if (!reward) throw new DomainError('Reward is unavailable', 404);
    const member = data.members.find(item => item.id === actor.id && item.isActive !== false);
    if (!member) throw new DomainError('Active family member not found', 409);
    if (member.xp < reward.cost) throw new DomainError('Not enough XP for this reward', 409);
    const now = clock();
    const xp = member.xp - reward.cost;
    const members = data.members.map(item => item.id === member.id
        ? { ...item, xp, level: calculateLevel(xp) }
        : item);
    const inventoryItem: InventoryItem = {
        id: `inventory-${idFactory()}`,
        rewardId: reward.id,
        ownerId: member.id,
        status: 'AVAILABLE',
        purchasedAt: now
    };
    const log: RewardLog = {
        id: `reward-log-${idFactory()}`,
        userId: member.id,
        action: 'SPENT',
        amount: reward.cost,
        description: `Куплено: ${reward.title}`,
        timestamp: now
    };
    return {
        ...data,
        members,
        currentUser: members.find(item => item.id === data.currentUser.id) || data.currentUser,
        inventory: [inventoryItem, ...data.inventory],
        rewardLogs: [log, ...data.rewardLogs],
        events: [{
            id: `event-${idFactory()}`,
            type: 'REWARD_BOUGHT',
            actorId: actor.id,
            payload: { rewardId: reward.id, title: reward.title, cost: reward.cost },
            timestamp: now
        }, ...(data.events || [])]
    };
};

export const useReward = (
    data: AppData,
    inventoryId: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    if (typeof inventoryId !== 'string' || !inventoryId.trim()) {
        throw new DomainError('Inventory item id is required');
    }
    const item = data.inventory.find(candidate => candidate.id === inventoryId);
    if (!item) throw new DomainError('Inventory item not found', 404);
    if (item.ownerId !== actor.id) throw new DomainError('You can only use your own reward', 403);
    if (item.status !== 'AVAILABLE') throw new DomainError('Reward was already used', 409);
    const reward = data.rewards.find(candidate => candidate.id === item.rewardId);
    const now = clock();
    const log: RewardLog = {
        id: `reward-log-${idFactory()}`,
        userId: actor.id,
        action: 'USED',
        amount: 0,
        description: `Использовано: ${reward?.title || 'Награда'}`,
        timestamp: now
    };
    return {
        ...data,
        inventory: data.inventory.map(candidate => candidate.id === item.id
            ? { ...candidate, status: 'USED', usedAt: now }
            : candidate),
        rewardLogs: [log, ...data.rewardLogs]
    };
};

export const saveFinancialTransaction = (
    data: AppData,
    rawTransaction: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    if (!isObject(rawTransaction)) throw new DomainError('Transaction payload is required');
    const rawId = typeof rawTransaction.id === 'string' ? rawTransaction.id.trim() : '';
    const previous = rawId ? data.transactions.find(item => item.id === rawId) : undefined;
    const type = rawTransaction.type === 'INCOME'
        || rawTransaction.type === 'EXPENSE'
        || rawTransaction.type === 'TRANSFER'
        ? rawTransaction.type
        : previous?.type;
    if (!type) throw new DomainError('Transaction type is required');
    const accountId = normalizeString(rawTransaction.accountId, previous?.accountId || '', 120);
    if (!data.accounts.some(account => account.id === accountId)) {
        throw new DomainError('Transaction account not found', 404);
    }
    const toAccountId = type === 'TRANSFER'
        ? normalizeString(rawTransaction.toAccountId, previous?.toAccountId || '', 120)
        : undefined;
    if (type === 'TRANSFER'
        && (!toAccountId || toAccountId === accountId || !data.accounts.some(account => account.id === toAccountId))) {
        throw new DomainError('A different destination account is required for transfer');
    }
    const transaction: Transaction = {
        id: previous?.id || rawId || `transaction-${idFactory()}`,
        amount: clampInteger(rawTransaction.amount, previous?.amount ?? 0, 1, 100_000_000_000),
        title: normalizeOptionalString(rawTransaction.title, 240),
        type,
        categoryId: normalizeString(rawTransaction.categoryId, previous?.categoryId || 'other', 80),
        accountId,
        toAccountId,
        date: normalizeTimestamp(rawTransaction.date) || previous?.date || new Date(clock()).toISOString(),
        createdById: previous?.createdById || actor.id,
        deviationReason: normalizeOptionalString(rawTransaction.deviationReason, 500)
    };

    let accounts = data.accounts;
    let goals = data.goals;
    if (previous) {
        ({ accounts, goals } = applyTransactionEffect(accounts, goals, previous, -1));
    }
    ({ accounts, goals } = applyTransactionEffect(accounts, goals, transaction, 1));

    return {
        ...data,
        accounts,
        goals,
        transactions: previous
            ? data.transactions.map(item => item.id === transaction.id ? transaction : item)
            : [transaction, ...data.transactions]
    };
};

export const contributeToSavingsGoal = (
    data: AppData,
    input: { goalId?: unknown; sourceAccountId?: unknown; amount?: unknown; message?: unknown },
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const goalId = normalizeString(input.goalId, '', 120);
    const accountId = normalizeString(input.sourceAccountId, '', 120);
    const amount = clampInteger(input.amount, 0, 1, 100_000_000_000);
    const goal = data.savingsGoals.find(item => item.id === goalId && item.status === 'ACTIVE');
    const account = data.accounts.find(item => item.id === accountId);
    if (!goal) throw new DomainError('Active savings goal not found', 404);
    if (!account) throw new DomainError('Source account not found', 404);
    if (account.balance < amount) throw new DomainError('Not enough money on the source account', 409);
    const now = clock();
    return {
        ...data,
        accounts: data.accounts.map(item => item.id === account.id
            ? { ...item, balance: item.balance - amount }
            : item),
        savingsGoals: data.savingsGoals.map(item => item.id === goal.id
            ? { ...item, currentAmount: item.currentAmount + amount }
            : item),
        contributions: [{
            id: `contribution-${idFactory()}`,
            goalId: goal.id,
            userId: actor.id,
            amount,
            message: normalizeOptionalString(input.message, 500),
            date: now
        }, ...data.contributions],
        transactions: [{
            id: `transaction-${idFactory()}`,
            amount,
            type: 'EXPENSE',
            categoryId: 'goal_contrib',
            accountId: account.id,
            title: `В копилку: ${goal.title}`,
            date: new Date(now).toISOString(),
            createdById: actor.id
        }, ...data.transactions],
        events: [{
            id: `event-${idFactory()}`,
            type: 'GOAL_CONTRIBUTION',
            actorId: actor.id,
            payload: { goalTitle: goal.title, amount, amountStr: formatEventMoney(amount) },
            timestamp: now
        }, ...(data.events || [])]
    };
};

export const paySubscription = (
    data: AppData,
    subscriptionId: unknown,
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const id = normalizeString(subscriptionId, '', 120);
    const subscription = data.subscriptions.find(item => item.id === id && item.active);
    if (!subscription) throw new DomainError('Active subscription not found', 404);
    const account = data.accounts.find(item => item.id === subscription.accountId);
    if (!account) throw new DomainError('Subscription account not found', 404);
    if (account.balance < subscription.amount) {
        throw new DomainError('Not enough money on the subscription account', 409);
    }
    const now = clock();
    return {
        ...data,
        accounts: data.accounts.map(item => item.id === account.id
            ? { ...item, balance: item.balance - subscription.amount }
            : item),
        subscriptions: data.subscriptions.map(item => item.id === subscription.id
            ? { ...item, nextPaymentDate: getNextRecurringDate(item.nextPaymentDate, item.frequency) }
            : item),
        transactions: [{
            id: `transaction-${idFactory()}`,
            amount: subscription.amount,
            title: `Подписка: ${subscription.title}`,
            type: 'EXPENSE',
            categoryId: subscription.categoryId,
            accountId: subscription.accountId,
            date: new Date(now).toISOString(),
            createdById: actor.id
        }, ...data.transactions],
        events: [{
            id: `event-${idFactory()}`,
            type: 'SUBSCRIPTION_PAID',
            actorId: actor.id,
            payload: { title: subscription.title },
            timestamp: now
        }, ...(data.events || [])]
    };
};

export const addShoppingItem = (
    data: AppData,
    input: { id?: unknown; title?: unknown; category?: unknown },
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const title = normalizeString(input.title, '', 240);
    if (!title) throw new DomainError('Shopping item title is required');
    const category: ShoppingCategoryType = input.category === 'HOME' || input.category === 'OTHER'
        ? input.category
        : 'FOOD';
    const id = normalizeString(input.id, `shopping-${idFactory()}`, 120);
    const previous = data.shoppingList.find(item => item.id === id);
    const item: ShoppingItem = previous || {
        id,
        title,
        category,
        addedById: actor.id,
        isCompleted: false,
        createdAt: clock()
    };
    return previous ? data : { ...data, shoppingList: [item, ...data.shoppingList] };
};

export const setShoppingItemCompleted = (
    data: AppData,
    itemId: unknown,
    completed: unknown
): AppData => {
    const id = normalizeString(itemId, '', 120);
    const item = data.shoppingList.find(candidate => candidate.id === id);
    if (!item) throw new DomainError('Shopping item not found', 404);
    if (typeof completed !== 'boolean') throw new DomainError('Completed state is required');
    return {
        ...data,
        shoppingList: data.shoppingList.map(candidate => candidate.id === id
            ? { ...candidate, isCompleted: completed }
            : candidate)
    };
};

export const checkoutShoppingItems = (
    data: AppData,
    input: { itemIds?: unknown; totalAmount?: unknown; accountId?: unknown },
    actor: User,
    clock: Clock = Date.now,
    idFactory: IdFactory = randomUUID
): AppData => {
    const requestedIds = Array.isArray(input.itemIds)
        ? [...new Set(input.itemIds.filter((item): item is string => typeof item === 'string' && !!item.trim()))]
        : [];
    const requestedIdSet = new Set(requestedIds);
    const items = data.shoppingList.filter(item => requestedIdSet.has(item.id) && item.isCompleted);
    if (items.length === 0) throw new DomainError('No completed shopping items selected', 409);
    const accountId = normalizeString(input.accountId, '', 120);
    const account = data.accounts.find(item => item.id === accountId);
    if (!account) throw new DomainError('Shopping account not found', 404);
    const total = clampInteger(input.totalAmount, 0, 1, 100_000_000_000);
    if (account.balance < total) throw new DomainError('Not enough money on the shopping account', 409);
    const now = clock();
    const paidIds = new Set(items.map(item => item.id));
    return {
        ...data,
        shoppingList: data.shoppingList.filter(item => !paidIds.has(item.id)),
        accounts: data.accounts.map(item => item.id === account.id
            ? { ...item, balance: item.balance - total }
            : item),
        transactions: [{
            id: `transaction-${idFactory()}`,
            amount: total,
            type: 'EXPENSE',
            categoryId: 'food',
            accountId: account.id,
            title: `Продукты (${items.length} шт.)`,
            date: new Date(now).toISOString(),
            createdById: actor.id
        }, ...data.transactions],
        events: [{
            id: `event-${idFactory()}`,
            type: 'SHOPPING_CHECKOUT',
            actorId: actor.id,
            payload: { count: items.length, total, totalStr: formatEventMoney(total) },
            timestamp: now
        }, ...(data.events || [])]
    };
};

export const reminderCandidates = (data: AppData, now = Date.now()) => {
    const settings = normalizeFamilySettings(data.family?.settings || DEFAULT_FAMILY_SETTINGS);
    return data.tasks
        .filter(task => task.status !== 'DONE' && !!task.reminderTime)
        .filter(task => {
            const reminderAt = Date.parse(task.reminderTime || '');
            return Number.isFinite(reminderAt) && reminderAt <= now;
        })
        .map(task => ({
            familyId: data.family?.id,
            familyName: data.family?.name,
            settings,
            task,
            members: data.members
                .filter(member => member.isActive !== false)
                .map(member => ({
                    id: member.id,
                    name: member.name,
                    telegramId: member.telegramId,
                    role: member.role
                }))
        }));
};

const createRecurringSuccessor = (task: Task, now: number, idFactory: IdFactory): Task => {
    const nextDueDate = getNextRecurringDate(task.dueDate, task.frequency);
    return {
        ...task,
        id: `task-${idFactory()}`,
        status: 'TODO',
        dueDate: nextDueDate,
        reminderTime: shiftReminder(task, nextDueDate),
        subtasks: task.subtasks.map(subtask => ({ ...subtask, isCompleted: false })),
        createdAt: now,
        sortOrder: undefined,
        completedAt: undefined,
        completedById: undefined,
        rewardedAt: undefined
    };
};

const shiftReminder = (task: Task, nextDueDate: string) => {
    if (!task.reminderTime) return undefined;
    const reminderAt = Date.parse(task.reminderTime);
    if (!Number.isFinite(reminderAt)) return undefined;
    if (!task.dueDate) {
        const nextReminderDate = getNextRecurringDate(task.reminderTime, task.frequency);
        return replaceIsoDate(task.reminderTime, nextReminderDate);
    }
    const currentDueAt = Date.parse(`${task.dueDate}T00:00:00.000Z`);
    const nextDueAt = Date.parse(`${nextDueDate}T00:00:00.000Z`);
    if (!Number.isFinite(currentDueAt) || !Number.isFinite(nextDueAt)) return undefined;
    return new Date(reminderAt + (nextDueAt - currentDueAt)).toISOString();
};

const replaceIsoDate = (timestamp: string, date: string) => {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) return undefined;
    const [year, month, day] = date.split('-').map(Number);
    parsed.setUTCFullYear(year, month - 1, day);
    return parsed.toISOString();
};

const canChangeTask = (actor: User, task: Task) => (
    isFamilyAdmin(actor) || task.createdById === actor.id || task.assigneeId === actor.id
);

const isFamilyAdmin = (actor: User) => actor.role === 'OWNER' || actor.role === 'ADMIN';

const compareTaskOrder = (left: Task, right: Task) => (
    (left.sortOrder ?? left.createdAt) - (right.sortOrder ?? right.createdAt)
);

const applyTransactionEffect = (
    accounts: AppData['accounts'],
    goals: AppData['goals'],
    transaction: Transaction,
    direction: 1 | -1
) => {
    const amount = transaction.amount * direction;
    const nextAccounts = accounts.map(account => {
        if (account.id === transaction.accountId) {
            if (transaction.type === 'INCOME') return { ...account, balance: account.balance + amount };
            return { ...account, balance: account.balance - amount };
        }
        if (transaction.type === 'TRANSFER' && account.id === transaction.toAccountId) {
            return { ...account, balance: account.balance + amount };
        }
        return account;
    });
    const nextGoals = transaction.type === 'INCOME'
        ? goals.map(goal => goal.accountId === transaction.accountId
            ? { ...goal, currentAmount: Math.max(0, goal.currentAmount + amount) }
            : goal)
        : goals;
    return { accounts: nextAccounts, goals: nextGoals };
};

const normalizeMemberIds = (value: unknown, memberIds: Set<string>) => (
    Array.isArray(value)
        ? [...new Set(value.filter((item): item is string => typeof item === 'string' && memberIds.has(item)))]
        : []
);

const normalizeString = (value: unknown, fallback: string, maxLength: number) => {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : fallback;
};

const normalizeOptionalString = (value: unknown, maxLength: number) => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
};

const normalizeDate = (value: unknown) => (
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
);

const normalizeTimestamp = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
};

const clampInteger = (value: unknown, fallback: number, minimum: number, maximum: number) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
};

const isObject = (value: unknown): value is Record<string, unknown> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
);

const dateInTimezone = (timestamp: number, timezone: string) => {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date(timestamp));
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    } catch {
        return new Date(timestamp).toISOString().slice(0, 10);
    }
};

const formatEventMoney = (cents: number) => (
    (cents / 100).toLocaleString('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 0
    })
);
