
import React from 'react';
import { Account, FinancialGoal, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType } from './finance.model';
import { Task, Epic, TaskStatus, Priority, Frequency } from './tasks.model';

export type Tab = 'DASHBOARD' | 'TASKS' | 'FINANCE' | 'FAMILY';

export interface User {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'CHILD';
  avatar: string;
  xp: number;
  level: number;
  telegramUsername?: string;
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

export interface ToastMessage {
    id: string;
    message: string;
    type: 'SUCCESS' | 'INFO' | 'ERROR';
}

export type { Account, FinancialGoal, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType };
export type { Task, Epic, TaskStatus, Priority, Frequency };
