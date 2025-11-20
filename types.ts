
import React from 'react';
import { Account, FinancialGoal, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType } from './finance.model';
import { Task, Epic, TaskStatus, Priority, Frequency } from './tasks.model';
import { User, Reward, RewardLog, Role, InventoryItem } from './family.model';

export type Tab = 'DASHBOARD' | 'TASKS' | 'FINANCE' | 'FAMILY';

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
  inventory: InventoryItem[]; // New Field
}

export interface ToastMessage {
    id: string;
    message: string;
    type: 'SUCCESS' | 'INFO' | 'ERROR';
}

// Re-export domain types for convenience
export type { Account, FinancialGoal, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType };
export type { Task, Epic, TaskStatus, Priority, Frequency };
export type { User, Reward, RewardLog, Role, InventoryItem };
