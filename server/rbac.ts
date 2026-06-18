import type { AppData } from '../types.js';
import type { User } from '../family.model.js';

export class ForbiddenError extends Error {
    status = 403;
}

export const isOwner = (actor: User) => actor.role === 'OWNER';
export const isAdmin = (actor: User) => actor.role === 'ADMIN' || actor.role === 'OWNER';

export const canSee = (
    item: { createdById?: string; assigneeId?: string; visibleTo?: string[] },
    actor: User
) => {
    if (isOwner(actor)) return true;
    if (item.createdById === actor.id) return true;
    if (item.assigneeId === actor.id) return true;
    if (!item.visibleTo || item.visibleTo.length === 0) return true;
    return item.visibleTo.includes(actor.id);
};

export const filterForActor = (data: AppData, actor: User): AppData => {
    if (isOwner(actor)) return { ...data, currentUser: actor };

    const epics = data.epics.filter(item => canSee(item, actor));
    const accounts = data.accounts.filter(item => canSee(item, actor));
    const accountIds = new Set(accounts.map(account => account.id));
    const visibleSavingsGoals = data.savingsGoals.filter(goal => (
        !goal.createdById || goal.createdById === actor.id || actor.role === 'ADMIN'
    ));
    const savingsGoalIds = new Set(visibleSavingsGoals.map(goal => goal.id));

    return {
        ...data,
        currentUser: actor,
        epics,
        tasks: data.tasks.filter(item => canSee(item, actor)),
        accounts,
        goals: data.goals.filter(goal => canSee(goal, actor) || accountIds.has(goal.accountId)),
        savingsGoals: visibleSavingsGoals,
        contributions: data.contributions.filter(item => item.userId === actor.id || savingsGoalIds.has(item.goalId) || actor.role === 'ADMIN'),
        subscriptions: data.subscriptions.filter(item => accountIds.has(item.accountId) || actor.role === 'ADMIN'),
        transactions: data.transactions.filter(item => item.createdById === actor.id || accountIds.has(item.accountId)),
        inventory: data.inventory.filter(item => item.ownerId === actor.id),
        events: data.events.filter(item => item.actorId === actor.id || actor.role === 'ADMIN'),
        rewardLogs: data.rewardLogs.filter(item => item.userId === actor.id || actor.role === 'ADMIN')
    };
};

export const assertCanWrite = (actor: User, pathname: string, body: Record<string, unknown>, data: AppData) => {
    if (isOwner(actor)) return;

    switch (pathname) {
        case '/api/tasks/save': {
            const task = body.task as AppData['tasks'][number] | undefined;
            if (task && (isAdmin(actor) || task.createdById === actor.id || task.assigneeId === actor.id)) return;
            break;
        }
        case '/api/tasks/delete': {
            const task = data.tasks.find(item => item.id === body.id);
            if (task && (isAdmin(actor) || task.createdById === actor.id)) return;
            break;
        }
        case '/api/epics/save':
        case '/api/accounts/save':
        case '/api/goals/save':
        case '/api/budgets/save':
        case '/api/transactions/save':
        case '/api/savings-goals/save':
        case '/api/contributions/save':
        case '/api/subscriptions/save':
        case '/api/reward-logs/save':
        case '/api/inventory/save':
            if (isAdmin(actor)) return;
            break;
        case '/api/users/update': {
            const user = body.user as User | undefined;
            const previous = data.members.find(member => member.id === user?.id);
            if (user && previous && user.id === actor.id && preservesIdentity(previous, user)) return;
            break;
        }
    }

    throw new ForbiddenError('You are not allowed to perform this FamTrack action');
};

export const sanitizeBatchUpdates = (actor: User, updates: Partial<AppData>, data: AppData): Partial<AppData> => {
    const { currentUser: _ignoredCurrentUser, ...rest } = updates;
    if (isOwner(actor)) return rest;

    const adminAllowedKeys = new Set<keyof AppData>([
        'tasks',
        'epics',
        'shoppingList',
        'transactions',
        'accounts',
        'goals',
        'savingsGoals',
        'contributions',
        'subscriptions',
        'budgets',
        'rewardLogs',
        'inventory',
        'events',
        'members'
    ]);
    const childAllowedKeys = new Set<keyof AppData>([
        'tasks',
        'shoppingList',
        'rewardLogs',
        'inventory',
        'events',
        'members'
    ]);
    const allowedKeys = isAdmin(actor) ? adminAllowedKeys : childAllowedKeys;

    for (const key of Object.keys(rest) as Array<keyof AppData>) {
        if (!allowedKeys.has(key)) {
            throw new ForbiddenError(`Batch update key is not allowed: ${key}`);
        }
    }

    if (rest.members) {
        for (const member of rest.members) {
            const previous = data.members.find(item => item.id === member.id);
            if (!previous) throw new ForbiddenError('Non-owner cannot create family members');
            if (!preservesIdentity(previous, member)) {
                throw new ForbiddenError('Non-owner cannot change member identity or role');
            }
        }
    }

    if (rest.tasks) {
        for (const task of rest.tasks) {
            const previous = data.tasks.find(item => item.id === task.id);
            if (previous && !canSee(previous, actor)) {
                throw new ForbiddenError('Non-owner cannot change hidden tasks');
            }
            if (!isAdmin(actor) && task.createdById !== actor.id && task.assigneeId !== actor.id) {
                throw new ForbiddenError('Child users can only change their own tasks');
            }
        }
    }

    if (!isAdmin(actor)) {
        for (const item of rest.inventory || []) {
            if (item.ownerId !== actor.id) {
                throw new ForbiddenError('Child users can only change their own inventory');
            }
        }
        for (const log of rest.rewardLogs || []) {
            if (log.userId !== actor.id) {
                throw new ForbiddenError('Child users can only change their own reward logs');
            }
        }
        for (const event of rest.events || []) {
            if (event.actorId !== actor.id) {
                throw new ForbiddenError('Child users can only create their own events');
            }
        }
    }

    if (rest.accounts) {
        for (const account of rest.accounts) {
            const previous = data.accounts.find(item => item.id === account.id);
            if (previous && !canSee(previous, actor)) {
                throw new ForbiddenError('Non-owner cannot change hidden accounts');
            }
        }
    }

    return rest;
};

export const preservesIdentity = (previous: User, next: User) => {
    return previous.role === next.role
        && previous.telegramId === next.telegramId
        && previous.telegramUsername === next.telegramUsername
        && previous.name === next.name
        && previous.avatar === next.avatar;
};
