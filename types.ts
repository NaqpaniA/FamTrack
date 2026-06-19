
import React from 'react';
import { Account, FinancialGoal, SavingsGoal, GoalContribution, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType, Subscription } from './finance.model';
import { Task, Epic, TaskStatus, Priority, Frequency } from './tasks.model';
import { User, Reward, RewardLog, Role, InventoryItem } from './family.model';
import { ShoppingItem } from './shopping.model';
import { AppEvent } from './events.model';

export type Tab = 'DASHBOARD' | 'TASKS' | 'FINANCE' | 'FAMILY' | 'SHOP';

export interface AppData {
  currentUser: User;
  members: User[];
  archivedMembers?: User[];
  epics: Epic[];
  tasks: Task[];
  accounts: Account[];
  goals: FinancialGoal[]; // Legacy/Account-bound
  savingsGoals: SavingsGoal[]; // New Dream Jars
  contributions: GoalContribution[]; // Logs for Dream Jars
  subscriptions: Subscription[]; // New Recurring Payments
  budgets: BudgetPlan[];
  transactions: Transaction[];
  rewards: Reward[];
  rewardLogs: RewardLog[];
  inventory: InventoryItem[];
  shoppingList: ShoppingItem[];
  events: AppEvent[];
}

export interface ApiEnvelope {
  revision: number;
  data: AppData;
}

export interface ToastMessage {
    id: string;
    message: string;
    type: 'SUCCESS' | 'INFO' | 'ERROR';
}

// Re-export domain types for convenience
export type { Account, FinancialGoal, SavingsGoal, GoalContribution, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType, Subscription };
export type { Task, Epic, TaskStatus, Priority, Frequency };
export type { User, Reward, RewardLog, Role, InventoryItem };
export type { ShoppingItem };
export type { AppEvent };
