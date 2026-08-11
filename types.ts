
import React from 'react';
import { Account, FinancialGoal, SavingsGoal, GoalContribution, BudgetPlan, Transaction, TransactionCategory, TransactionType, AccountType, Subscription } from './finance.model';
import { Task, Epic, TaskStatus, Priority, TaskDifficulty, Frequency } from './tasks.model';
import { User, Reward, RewardLog, Role, InventoryItem } from './family.model';
import { ShoppingItem } from './shopping.model';
import { AppEvent } from './events.model';
import { Note, NoteScope, NoteContentType, NoteChecklistItem } from './notes.model';
import { FamilySettings } from './settings.model';
import { RoutineEvent, RoutineSummary, RoutineTemplate } from './routines.model';
import { PantryData } from './pantry.model';
import { Wishlist } from './wishlist.model';
import { PurchaseImportJob } from './purchase-import.model';

export type Tab = 'DASHBOARD' | 'TASKS' | 'FINANCE' | 'FAMILY' | 'SHOP';

export interface Family {
  id: string;
  name: string;
  ownerUserId?: string;
  createdAt: number;
  revision: number;
  settings: FamilySettings;
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
  capabilities?: {
    routines: boolean;
    pantry: boolean;
    receiptOcr: boolean;
    wishlists: boolean;
  };
  routines?: RoutineTemplate[];
  routineEvents?: RoutineEvent[];
  routineSummary?: RoutineSummary;
  pantry?: PantryData;
  wishlists?: Wishlist[];
  dashboardPreferences?: DashboardPreferences;
  /** Server-internal command aggregate. Public API strips it from AppData. */
  purchaseImports?: PurchaseImportJob[];
}

export interface DashboardPreferences {
  userId: string;
  scope: 'PERSONAL' | 'FAMILY';
  hiddenWidgets: string[];
  widgetOrder: string[];
  weatherOptIn: boolean;
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
export type { Task, Epic, TaskStatus, Priority, TaskDifficulty, Frequency };
export type { User, Reward, RewardLog, Role, InventoryItem };
export type { ShoppingItem };
export type { AppEvent };
export type { Note, NoteScope, NoteContentType, NoteChecklistItem };
export type { FamilySettings, NotificationDeliveryMode, TaskNotificationMode } from './settings.model';
export type { RoutineEvent, RoutineSummary, RoutineTemplate } from './routines.model';
export type { PantryData, PantryMovement, PantryProduct } from './pantry.model';
export type { Wishlist, WishlistItem } from './wishlist.model';
export type { PurchaseImportFile, PurchaseImportItem, PurchaseImportJob, PurchaseImportStatus, ReceiptOcrBlock } from './purchase-import.model';
