import type { RoutinePresetId, RoutineTemplate } from './routines.model';

export type RoutinePresetDefinition = Pick<
    RoutineTemplate,
    'title' | 'kind' | 'schedule' | 'unitLabel' | 'difficulty' | 'priority'
> & {
    icon: string;
    label: string;
};

export const ROUTINE_PRESETS: Record<RoutinePresetId, RoutinePresetDefinition> = {
    TRASH: {
        title: 'Вынести мусор',
        kind: 'ACCUMULATOR',
        unitLabel: 'пакет',
        difficulty: 'EASY',
        priority: 'MEDIUM',
        icon: '🗑️',
        label: 'Мусор'
    },
    DISHWASHER: {
        title: 'Разобрать посудомойку',
        kind: 'ACCUMULATOR',
        unitLabel: 'загрузка',
        difficulty: 'EASY',
        priority: 'MEDIUM',
        icon: '🍽️',
        label: 'Посуда'
    },
    PETS: {
        title: 'Позаботиться о питомцах',
        kind: 'SCHEDULED',
        schedule: { kind: 'DAILY' },
        difficulty: 'EASY',
        priority: 'HIGH',
        icon: '🐾',
        label: 'Питомцы'
    },
    CLEANING: {
        title: 'Уборка дома',
        kind: 'SCHEDULED',
        schedule: { kind: 'WEEKDAYS', weekDays: [6] },
        difficulty: 'HARD',
        priority: 'MEDIUM',
        icon: '🧹',
        label: 'Уборка'
    },
    LAUNDRY: {
        title: 'Стирка',
        kind: 'ACCUMULATOR',
        unitLabel: 'загрузка',
        difficulty: 'MEDIUM',
        priority: 'MEDIUM',
        icon: '🧺',
        label: 'Стирка'
    },
    PLANTS: {
        title: 'Полить растения',
        kind: 'SCHEDULED',
        schedule: { kind: 'INTERVAL_DAYS', interval: 3 },
        difficulty: 'EASY',
        priority: 'LOW',
        icon: '🪴',
        label: 'Растения'
    },
    GROCERIES: {
        title: 'Закупить продукты',
        kind: 'SCHEDULED',
        schedule: { kind: 'WEEKDAYS', weekDays: [6] },
        difficulty: 'MEDIUM',
        priority: 'HIGH',
        icon: '🛒',
        label: 'Продукты'
    }
};
