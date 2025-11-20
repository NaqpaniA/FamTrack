
import React from 'react';
import { 
  ShoppingBag, 
  Car, 
  Home, 
  Gamepad2, 
  Gift, 
  Smartphone, 
  Briefcase, 
  ArrowRightLeft, 
  Circle,
  Repeat,
  Zap,
  Music,
  Tv,
  GraduationCap
} from 'lucide-react';

// --- Types ---

export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type AccountType = 'CARD' | 'CASH' | 'SAVINGS';
export type GoalStatus = 'ACTIVE' | 'COMPLETED' | 'PAUSED';
export type SubscriptionFrequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface Account {
  id: string;
  name: string;
  balance: number; // in cents
  type: AccountType;
  goalId?: string;
  createdById?: string;
  visibleTo?: string[];
}

export interface FinancialGoal {
  id: string;
  accountId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  epicId?: string; // Link to epic
  createdById?: string;
  visibleTo?: string[];
}

export interface SavingsGoal {
    id: string;
    title: string;
    description?: string;
    targetAmount: number;
    currentAmount: number;
    status: GoalStatus;
    icon: string; // Emoji
    createdById: string;
    createdAt: number;
}

export interface GoalContribution {
    id: string;
    goalId: string;
    userId: string;
    amount: number;
    message?: string; // "Birthday gift", "From chores"
    date: number;
}

export interface Subscription {
    id: string;
    title: string;
    amount: number;
    currency: 'RUB';
    serviceId?: string; // For preset icons
    frequency: SubscriptionFrequency;
    nextPaymentDate: string; // ISO Date
    isAutoPay: boolean; 
    accountId: string;
    categoryId: string;
    active: boolean;
}

export interface BudgetPlan {
  categoryId: string;
  limit: number;
}

export interface Transaction {
  id: string;
  amount: number;
  title?: string;
  type: TransactionType;
  categoryId: string;
  accountId: string;
  toAccountId?: string; // For transfers
  date: string;
  createdById: string;
  deviationReason?: string;
}

export interface TransactionCategory {
    id: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    type: TransactionType | 'BOTH';
}

// --- Constants ---

export const CATEGORIES: Record<string, TransactionCategory> = {
  food: { id: 'food', label: 'Продукты', icon: React.createElement(ShoppingBag, { size: 20 }), color: 'bg-orange-100 text-orange-600', type: 'EXPENSE' },
  transport: { id: 'transport', label: 'Транспорт', icon: React.createElement(Car, { size: 20 }), color: 'bg-blue-100 text-blue-600', type: 'EXPENSE' },
  home: { id: 'home', label: 'Аренда/Дом', icon: React.createElement(Home, { size: 20 }), color: 'bg-purple-100 text-purple-600', type: 'EXPENSE' },
  entertainment: { id: 'entertainment', label: 'Досуг', icon: React.createElement(Gamepad2, { size: 20 }), color: 'bg-indigo-100 text-indigo-600', type: 'EXPENSE' },
  shopping: { id: 'shopping', label: 'Шопинг', icon: React.createElement(Gift, { size: 20 }), color: 'bg-pink-100 text-pink-600', type: 'EXPENSE' },
  services: { id: 'services', label: 'Услуги', icon: React.createElement(Smartphone, { size: 20 }), color: 'bg-gray-100 text-gray-600', type: 'EXPENSE' },
  salary: { id: 'salary', label: 'Зарплата', icon: React.createElement(Briefcase, { size: 20 }), color: 'bg-green-100 text-green-600', type: 'INCOME' },
  gift: { id: 'gift', label: 'Подарок', icon: React.createElement(Gift, { size: 20 }), color: 'bg-yellow-100 text-yellow-600', type: 'INCOME' },
  transfer: { id: 'transfer', label: 'Перевод', icon: React.createElement(ArrowRightLeft, { size: 20 }), color: 'bg-slate-100 text-slate-600', type: 'BOTH' },
  goal_contrib: { id: 'goal_contrib', label: 'В копилку', icon: React.createElement(Car, { size: 20 }), color: 'bg-teal-100 text-teal-600', type: 'EXPENSE' }, 
  other: { id: 'other', label: 'Другое', icon: React.createElement(Circle, { size: 20 }), color: 'bg-slate-100 text-slate-600', type: 'BOTH' },
};

export const SERVICE_PRESETS: Record<string, { label: string, color: string, icon: any, defaultAmount: number }> = {
    netflix: { label: 'Netflix', color: 'bg-red-600 text-white', icon: Tv, defaultAmount: 120000 },
    youtube: { label: 'YouTube Premium', color: 'bg-red-500 text-white', icon: Tv, defaultAmount: 29900 },
    spotify: { label: 'Spotify', color: 'bg-green-500 text-white', icon: Music, defaultAmount: 16900 },
    yandex: { label: 'Яндекс Плюс', color: 'bg-yellow-400 text-black', icon: Music, defaultAmount: 29900 },
    telegram: { label: 'Telegram Premium', color: 'bg-blue-500 text-white', icon: Smartphone, defaultAmount: 29900 },
    internet: { label: 'Интернет', color: 'bg-blue-600 text-white', icon: Zap, defaultAmount: 50000 },
    rent: { label: 'Аренда', color: 'bg-slate-700 text-white', icon: Home, defaultAmount: 3000000 },
    education: { label: 'Кружки/Школа', color: 'bg-indigo-500 text-white', icon: GraduationCap, defaultAmount: 500000 },
    custom: { label: 'Другое', color: 'bg-gray-500 text-white', icon: Repeat, defaultAmount: 0 },
};
