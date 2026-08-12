import type { AppData } from './types';

export const routineCompletionFeedback = (data: AppData, routineId: string) => {
    const completion = [...(data.routineEvents || [])]
        .reverse()
        .find(event => event.routineId === routineId && event.type === 'COMPLETED');
    const completionTask = data.tasks.find(task => task.id === completion?.taskId);
    const creditedUserId = typeof completion?.payload?.creditedUserId === 'string'
        ? completion.payload.creditedUserId
        : completionTask?.assigneeId || data.currentUser.id;
    const creditedUser = data.members.find(member => member.id === creditedUserId);
    return `+${completion?.xpAwarded || 0} XP → ${creditedUser?.name || data.currentUser.name}`;
};

export const routineUnitRecordedFeedback = (units: number) => `+${units} накоплено`;
