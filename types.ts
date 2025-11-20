
import React from 'react';

export type Tab = 'DASHBOARD' | 'TASKS' | 'FINANCE' | 'FAMILY';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
export type TransactionType = 'INCOME' | 'EXPENSE' | 'TRANSFER';
export type AccountType = 'CARD' | 'CASH' | 'SAVINGS';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface User {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'CHILD';
  avatar: string;
  xp: number;
  level: number;
  telegramUsername?: string;
}

export interface SubTask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  points: number;
  assigneeId?: string;
  createdById: string;
  epicId?: string;
  subtasks: SubTask[];
  createdAt: number;
  dueDate?: string; // ISO Date String YYYY-MM-DD
  reminderTime?: string; // ISO String
  visibleTo?: string[];
  isRecurring?: boolean;
  frequency?: Frequency;
}

export interface Epic {
  id: string;
  title: string;
  priority: Priority;
  color: string;
  isCompleted: boolean;
  goalId?: string; // Link to financial goal
  createdById?: string;
  visibleTo?: string[];
}

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

export interface Reward {
  id: string;
  title: string;
  cost: number;
  icon: string;
}

export interface RewardLog {
  id: string;
  userId: string;
  action: 'EARNED' | 'SPENT';
  amount: number;
  description: string;
  timestamp: number;
}

export interface AppData {
  currentUser: User;
  members: User[];
  epics: Epic[];
  tasks: Task[];
  accounts: Account[];
  goals: FinancialGoal[];
  budgets: BudgetPlan[];
  transactions: Transaction[];
  rewards: Reward[];
  rewardLogs: RewardLog[];
}

export interface TransactionCategory {
    id: string;
    label: string;
    icon: React.ReactNode;
    color: string;
    type: TransactionType | 'BOTH';
}

export interface ToastMessage {
    id: string;
    message: string;
    type: 'SUCCESS' | 'INFO' | 'ERROR';
}
