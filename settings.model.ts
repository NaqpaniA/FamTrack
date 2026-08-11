export type NotificationDeliveryMode = 'PRIVATE' | 'GROUP' | 'BOTH' | 'OFF';
export type TaskNotificationMode = NotificationDeliveryMode | 'INHERIT';

export interface FamilySettings {
  allowParentTaskCompletion: boolean;
  taskNotificationMode: NotificationDeliveryMode;
  timezone: string;
}

export const DEFAULT_FAMILY_SETTINGS: FamilySettings = {
  allowParentTaskCompletion: false,
  taskNotificationMode: 'PRIVATE',
  timezone: 'UTC'
};
export const isNotificationDeliveryMode = (value: unknown): value is NotificationDeliveryMode => (
  value === 'PRIVATE' || value === 'GROUP' || value === 'BOTH' || value === 'OFF'
);

export const isTaskNotificationMode = (value: unknown): value is TaskNotificationMode => (
  value === 'INHERIT' || isNotificationDeliveryMode(value)
);

export const normalizeFamilySettings = (value: unknown): FamilySettings => {
  const input = value && typeof value === 'object' ? value as Partial<FamilySettings> : {};
  const timezone = typeof input.timezone === 'string' && input.timezone.trim()
    ? input.timezone.trim().slice(0, 80)
    : DEFAULT_FAMILY_SETTINGS.timezone;
  return {
    allowParentTaskCompletion: input.allowParentTaskCompletion === true,
    taskNotificationMode: isNotificationDeliveryMode(input.taskNotificationMode)
      ? input.taskNotificationMode
      : DEFAULT_FAMILY_SETTINGS.taskNotificationMode,
    timezone
  };
};
