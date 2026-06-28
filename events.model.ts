
import React from 'react';
import { 
    CheckCircle2, 
    ShoppingBag, 
    Target, 
    Repeat, 
    Trophy, 
    Sparkles,
    ShoppingCart,
    StickyNote
} from 'lucide-react';

// --- Types ---

export type EventType = 
  | 'TASK_COMPLETED' 
  | 'REWARD_BOUGHT' 
  | 'GOAL_CONTRIBUTION' 
  | 'SUBSCRIPTION_PAID' 
  | 'SHOPPING_CHECKOUT'
  | 'NOTE_CREATED'
  | 'LEVEL_UP';

export interface AppEvent {
  id: string;
  type: EventType;
  actorId: string;
  payload: Record<string, any>;
  timestamp: number;
}

// --- Config ---

export const EVENT_CONFIG: Record<EventType, { icon: any, color: string, format: (payload: any) => string }> = {
    TASK_COMPLETED: {
        icon: CheckCircle2,
        color: 'bg-green-100 text-green-600',
        format: (p) => `Выполнил(а) задачу "${p.title}" (+${p.points} XP)`
    },
    REWARD_BOUGHT: {
        icon: ShoppingBag,
        color: 'bg-purple-100 text-purple-600',
        format: (p) => `Купил(а) награду "${p.title}"`
    },
    GOAL_CONTRIBUTION: {
        icon: Target,
        color: 'bg-blue-100 text-blue-600',
        format: (p) => `В копилку "${p.goalTitle}": ${p.amountStr}`
    },
    SUBSCRIPTION_PAID: {
        icon: Repeat,
        color: 'bg-red-100 text-red-600',
        format: (p) => `Оплата подписки "${p.title}"`
    },
    SHOPPING_CHECKOUT: {
        icon: ShoppingCart,
        color: 'bg-orange-100 text-orange-600',
        format: (p) => `Купил(а) продукты (${p.count} шт.) на ${p.totalStr}`
    },
    NOTE_CREATED: {
        icon: StickyNote,
        color: 'bg-sky-100 text-sky-600',
        format: () => 'Добавил(а) семейную заметку'
    },
    LEVEL_UP: {
        icon: Trophy,
        color: 'bg-yellow-100 text-yellow-600',
        format: (p) => `Достиг(ла) уровня ${p.level}!`
    }
};
