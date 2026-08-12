import type { AppData } from '../types.js';
import type { User } from '../family.model.js';
import type { Note } from '../notes.model.js';
import { filterWishlistsForActor } from './wishlists.js';
import { summarizeRoutines, summarizeRoutineScopes } from './routines.js';

export class ForbiddenError extends Error {
    status = 403;
}

export const isOwner = (actor: User) => actor.role === 'OWNER';
export const isAdmin = (actor: User) => actor.role === 'ADMIN' || actor.role === 'OWNER';

export const canSeeNote = (note: Note, actor: User) => {
    if (note.scope === 'PERSONAL') return note.createdById === actor.id;
    return true;
};

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

export const filterForActor = (data: AppData, actorOverride: User): AppData => {
    const actor = data.members.find(member => member.id === actorOverride.id) || actorOverride;
    const activeMembers = data.members.filter(member => member.isActive !== false);
    const archivedMembers = data.members.filter(member => member.isActive === false);
    const visibleRoutines = (data.routines || []).filter(routine => (
        routine.visibility === 'FAMILY' || routine.ownerId === actor.id
    ));
    const visibleRoutineIds = new Set(visibleRoutines.map(routine => routine.id));
    const visibleTasks = data.tasks.filter(item => (
        !item.routineTemplateId || visibleRoutineIds.has(item.routineTemplateId)
    ));
    const visibleRoutineEvents = (data.routineEvents || []).filter(event => visibleRoutineIds.has(event.routineId));
    const visibleWishlists = filterWishlistsForActor(data.wishlists || [], actor);
    const visibleRoutineSummary = summarizeRoutines({
        ...data,
        routines: visibleRoutines,
        routineEvents: visibleRoutineEvents
    });
    const visibleRoutineSummaries = summarizeRoutineScopes({
        ...data,
        routines: visibleRoutines,
        routineEvents: visibleRoutineEvents
    }, actor.id);

    if (isOwner(actor)) {
        return {
            ...data,
            currentUser: actor,
            members: activeMembers,
            archivedMembers,
            tasks: visibleTasks,
            notes: (data.notes || []).filter(note => canSeeNote(note, actor)),
            routines: visibleRoutines,
            routineEvents: visibleRoutineEvents,
            routineSummary: visibleRoutineSummary,
            routineSummaries: visibleRoutineSummaries,
            wishlists: visibleWishlists
        };
    }

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
        members: activeMembers,
        archivedMembers: [],
        epics,
        tasks: visibleTasks.filter(item => canSee(item, actor)),
        accounts,
        goals: data.goals.filter(goal => canSee(goal, actor) || accountIds.has(goal.accountId)),
        savingsGoals: visibleSavingsGoals,
        contributions: data.contributions.filter(item => item.userId === actor.id || savingsGoalIds.has(item.goalId) || actor.role === 'ADMIN'),
        subscriptions: data.subscriptions.filter(item => accountIds.has(item.accountId) || actor.role === 'ADMIN'),
        transactions: data.transactions.filter(item => item.createdById === actor.id || accountIds.has(item.accountId)),
        inventory: data.inventory.filter(item => item.ownerId === actor.id),
        notes: (data.notes || []).filter(note => canSeeNote(note, actor)),
        events: data.events.filter(item => item.actorId === actor.id || actor.role === 'ADMIN'),
        rewardLogs: data.rewardLogs.filter(item => item.userId === actor.id || actor.role === 'ADMIN'),
        routines: visibleRoutines,
        routineEvents: visibleRoutineEvents,
        routineSummary: visibleRoutineSummary,
        routineSummaries: visibleRoutineSummaries,
        wishlists: visibleWishlists
    };
};

export const assertCanWrite = (actor: User, pathname: string, body: Record<string, unknown>, data: AppData) => {
    if (pathname === '/api/notes/save') {
        const note = body.note as Partial<Note> | undefined;
        if (note && canWriteNote(actor, note, data)) return;
        throw new ForbiddenError('You are not allowed to change this note');
    }
    if (pathname === '/api/notes/delete') {
        const note = (data.notes || []).find(item => item.id === body.id);
        if (note && canDeleteNote(actor, note)) return;
        throw new ForbiddenError('You are not allowed to delete this note');
    }

    if (isOwner(actor)) return;

    switch (pathname) {
        case '/api/tasks/save': {
            const task = body.task as AppData['tasks'][number] | undefined;
            if (task && (isAdmin(actor) || task.createdById === actor.id || task.assigneeId === actor.id)) return;
            break;
        }
        case '/api/tasks/reorder': {
            if (isAdmin(actor)) return;
            const updates = Array.isArray(body.tasks) ? body.tasks : [];
            if (updates.length > 0 && updates.every(update => {
                if (!update || typeof update !== 'object' || typeof (update as { id?: unknown }).id !== 'string') return false;
                const task = data.tasks.find(item => item.id === (update as { id: string }).id);
                return !!task && canSee(task, actor) && (task.createdById === actor.id || task.assigneeId === actor.id);
            })) return;
            break;
        }
        case '/api/tasks/delete': {
            const task = data.tasks.find(item => item.id === body.id);
            if (task && (isAdmin(actor) || task.createdById === actor.id)) return;
            break;
        }
        case '/api/epics/save':
        case '/api/epics/delete':
        case '/api/accounts/save':
        case '/api/goals/save':
        case '/api/budgets/save':
        case '/api/transactions/save':
        case '/api/savings-goals/save':
        case '/api/contributions/save':
        case '/api/savings-goals/contribute':
        case '/api/subscriptions/save':
        case '/api/subscriptions/delete':
        case '/api/subscriptions/pay':
        case '/api/shopping/checkout':
            if (isAdmin(actor)) return;
            break;
        case '/api/shopping/items/add':
        case '/api/shopping/items/set-completed':
        case '/api/shopping/items/delete':
            return;
        case '/api/users/update': {
            const user = body.user as User | undefined;
            const previous = data.members.find(member => member.id === user?.id);
            if (user && previous && user.id === actor.id && preservesIdentity(previous, user)) return;
            break;
        }
        case '/api/users/save':
        case '/api/users/archive':
        case '/api/users/restore':
            break;
    }

    throw new ForbiddenError('You are not allowed to perform this FamTrack action');
};

const canWriteNote = (actor: User, incoming: Partial<Note>, data: AppData) => {
    const previous = (data.notes || []).find(note => note.id === incoming.id);
    if (!previous) {
        return !incoming.createdById || incoming.createdById === actor.id;
    }

    if ((incoming.scope && previous.scope !== incoming.scope)
        || (incoming.createdById && previous.createdById !== incoming.createdById)) {
        return false;
    }
    if (previous.scope === 'PERSONAL') {
        return previous.createdById === actor.id;
    }
    return previous.createdById === actor.id || isAdmin(actor);
};

const canDeleteNote = (actor: User, note: Note) => {
    if (note.scope === 'PERSONAL') return note.createdById === actor.id;
    return note.createdById === actor.id || isAdmin(actor);
};

export const sanitizeBatchUpdates = (actor: User, updates: Partial<AppData>, data: AppData): Partial<AppData> => {
    const {
        currentUser: _ignoredCurrentUser,
        archivedMembers: _ignoredArchivedMembers,
        notes: _ignoredNotes,
        ...rest
    } = updates;
    const commandOwnedKeys = new Set<keyof AppData>([
        'tasks',
        'members',
        'rewards',
        'rewardLogs',
        'inventory'
    ]);
    for (const key of Object.keys(rest) as Array<keyof AppData>) {
        if (commandOwnedKeys.has(key)) {
            throw new ForbiddenError(`Batch update key requires a domain command: ${key}`);
        }
    }
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
        'events',
        'members'
    ]);
    const childAllowedKeys = new Set<keyof AppData>([
        'tasks',
        'shoppingList',
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
        && previous.avatar === next.avatar
        && (previous.isActive !== false) === (next.isActive !== false);
};
