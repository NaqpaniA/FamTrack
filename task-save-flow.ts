import type { AppData } from './types';
import type { Task, TaskStatus } from './tasks.model';

export type TaskSaveFlowResult =
  | { kind: 'saved'; data: AppData; confirmedStatus: TaskStatus }
  | { kind: 'fields-failed'; error: unknown; confirmedStatus: TaskStatus }
  | { kind: 'status-failed'; data: AppData; error: unknown; confirmedStatus: TaskStatus };

export const saveTaskFieldsThenStatus = async (
  task: Task,
  previous: Task | undefined,
  operations: {
    saveFields: (task: Task) => Promise<AppData>;
    saveStatus: (id: string, status: TaskStatus) => Promise<AppData>;
  }
): Promise<TaskSaveFlowResult> => {
  const originalStatus = previous?.status || task.status;
  const fieldsTask = previous ? { ...task, status: originalStatus } : task;
  let fieldsData: AppData;

  try {
    fieldsData = await operations.saveFields(fieldsTask);
  } catch (error) {
    return { kind: 'fields-failed', error, confirmedStatus: originalStatus };
  }

  const confirmedStatus = fieldsData.tasks.find(candidate => candidate.id === task.id)?.status || originalStatus;
  if (!previous || task.status === confirmedStatus) {
    return { kind: 'saved', data: fieldsData, confirmedStatus };
  }

  try {
    const statusData = await operations.saveStatus(task.id, task.status);
    return {
      kind: 'saved',
      data: statusData,
      confirmedStatus: statusData.tasks.find(candidate => candidate.id === task.id)?.status || task.status
    };
  } catch (error) {
    return { kind: 'status-failed', data: fieldsData, error, confirmedStatus };
  }
};
