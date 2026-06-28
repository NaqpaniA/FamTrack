
import React from 'react';
import { Account, FinancialGoal, SavingsGoal, GoalContribution, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType, Subscription } from './finance.model';
import { Task, Epic, TaskStatus, Priority, Frequency } from './tasks.model';
import { User, Reward, RewardLog, Role, InventoryItem } from './family.model';
import { ShoppingItem } from './shopping.model';
import { AppEvent } from './events.model';
import { Note, NoteScope, NoteContentType, NoteChecklistItem } from './notes.model';

export type Tab = 'DASHBOARD' | 'TASKS' | 'FINANCE' | 'FAMILY' | 'SHOP';

export interface Family {
  id: string;
  name: string;
  ownerUserId?: string;
  createdAt: number;
  revision: number;
}

export interface FamilyInvite {
  token: string;
  familyId?: string;
  familyName?: string;
  role: Role;
  createdById: string;
  createdAt: number;
  expiresAt?: number;
  usedAt?: number;
}

export type AiHelperType = 'task-breakdown' | 'expense-analysis';

export interface AiUsage {
  id: string;
  familyId: string;
  actorId: string;
  helperType: AiHelperType;
  inputHash: string;
  model: string;
  inputChars: number;
  outputTokens: number;
  estimatedCost: number;
  cached: boolean;
  responseJson: string;
  createdAt: number;
}

export interface RequestContext {
  actor: User;
  familyId: string;
  isDeveloperOwner: boolean;
}

export interface AppData {
  family?: Family;
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
  notes: Note[];
  events: AppEvent[];
}

export interface ApiEnvelope {
  revision: number;
  data: AppData;
}

export interface AiResult<T = unknown> {
  result: T;
  cached: boolean;
  model: string;
  remainingToday: number;
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
export type { Note, NoteScope, NoteContentType, NoteChecklistItem };
