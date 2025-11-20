# Architectural Design Record (ADR) 005: Activity Feed & Event Log

**Status:** APPROVED
**Date:** 2024-05-30
**Author:** Senior Product Architect
**Target Feature:** User Engagement & Observability

---

## 1. Context & Problem Statement

As **Family OS** grows (Tasks, Finance, Shopping, Rewards), keeping track of changes becomes difficult.
*   **Problem:** A parent opens the app and sees the balance changed, but doesn't know *why* (Did a subscription hit? Did someone buy a reward?).
*   **Problem:** A child completes chores, but feels unnoticed because the parent didn't check the "Tasks" tab immediately.
*   **Missing Element:** A centralized "Narrative" of family life.

**Goal:** Implement an **Activity Feed** on the Dashboard that logs significant events in real-time, providing context and social validation.

---

## 2. Decision: Event-Driven Logging

We will introduce a lightweight **Event Sourcing** pattern. While we won't strictly rebuild state from events (yet), we will log every significant "Write" action as an immutable `AppEvent`.

### Core Concepts:
1.  **The Event Entity:** Contains `actorId` (who), `type` (what), `payload` (details), and `timestamp`.
2.  **Unified Store Injection:** The `useAppStore` actions will be responsible for generating events alongside state mutations.
3.  **Dashboard Integration:** The feed will appear on the Dashboard, sorted chronologically.

---

## 3. Data Architecture

### Schema Updates

```typescript
type EventType = 
  | 'TASK_COMPLETED' 
  | 'REWARD_BOUGHT' 
  | 'GOAL_CONTRIBUTION' 
  | 'SUBSCRIPTION_PAID' 
  | 'SHOPPING_CHECKOUT'
  | 'LEVEL_UP';

interface AppEvent {
  id: string;
  type: EventType;
  actorId: string; // User ID
  payload: Record<string, any>; // Flexible JSON, e.g. { taskTitle: "Wash dishes", amount: 500 }
  timestamp: number;
}

// Add to AppData
interface AppData {
  // ... existing
  events: AppEvent[];
}
```

---

## 4. User Experience (UI)

### 4.1. The Feed Item
*   **Avatar:** Shows who performed the action.
*   **Icon:** Contextual icon (Checkmark for tasks, Coins for finance).
*   **Text:** "Dad completed **Buy Milk** (+50 XP)".
*   **Time:** Relative time (e.g., "2 hours ago").

### 4.2. Location
Placed on the **Dashboard**, below the "Summary Cards" and above "Projects". This ensures it's the first thing users see after checking their stats.

---

## 5. Implementation Strategy

1.  **Model:** Create `events.model.ts`.
2.  **Store:** Refactor `store.ts` actions.
    *   `toggleTaskStatus` -> Log `TASK_COMPLETED`.
    *   `buyReward` -> Log `REWARD_BOUGHT`.
    *   `contributeToGoal` -> Log `GOAL_CONTRIBUTION`.
    *   `paySubscription` -> Log `SUBSCRIPTION_PAID`.
    *   `checkoutShoppingList` -> Log `SHOPPING_CHECKOUT`.
3.  **UI:** Create `FeedItem` component in `dashboard.ui.tsx`.

