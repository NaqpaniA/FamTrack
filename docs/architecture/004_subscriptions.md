# Architectural Design Record (ADR) 004: Subscriptions & Fixed Costs Tracking

**Status:** APPROVED
**Date:** 2024-05-29
**Author:** Senior Product Architect
**Target Feature:** Financial Health & Automation

---

## 1. Context & Problem Statement

Families often underestimate their monthly expenses because they only track active spending (groceries, entertainment). They overlook **Fixed Costs**:
1.  **Subscriptions:** Streaming services, clouds, apps (often duplicated or unused).
2.  **Bills:** Rent, Utilities, Internet.
3.  **Recurring Education:** Tutors, Sports sections.

**Problem:** Users are surprised when auto-payments hit their account, or they forget to pay manual bills (like Rent), leading to stress.

**Goal:** Provide a dedicated view for **Recurring Payments** to visualize the family's "Burn Rate" (Fixed Monthly Cost) and simplify the payment process.

---

## 2. Decision: The "Subscription" Entity

We will introduce a `Subscription` entity distinct from `Transaction`. A Subscription is a *template* for a future transaction.

### Core Logic:
1.  **Template:** Stores the amount, frequency, and service details.
2.  **State:** Tracks `nextPaymentDate`.
3.  **Action:** When a user clicks "Pay" (or system detects auto-pay), the system:
    *   Creates a real `Transaction` record.
    *   Updates the `Subscription.nextPaymentDate` to the next interval.

---

## 3. Data Architecture

### Schema Updates

```typescript
type Frequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

interface Subscription {
  id: string;
  title: string; // e.g. "Netflix"
  amount: number; // in cents
  currency: 'RUB'; 
  serviceId?: string; // ID for logos (e.g., 'netflix', 'yandex')
  
  frequency: Frequency;
  nextPaymentDate: string; // ISO Date
  
  isAutoPay: boolean; // If true, we might auto-generate tx in the future
  accountId: string; // Default source of funds
  categoryId: string; // Usually 'services' or 'home'
}

// Add to AppData
interface AppData {
  // ... existing
  subscriptions: Subscription[];
}
```

---

## 4. User Experience (UI)

### 4.1. The "Burn Rate" Header
On the Finance screen, display a summary: **"Fixed Monthly Costs: 45,000 ₽"**. This educates the user on their baseline.

### 4.2. Upcoming Bills Widget
A horizontal scroll or list sorted by `nextPaymentDate`.
*   **Overdue:** Red highlight.
*   **Due Soon (3 days):** Yellow highlight.
*   **Paid:** Pushed to the bottom or hidden until next cycle.

### 4.3. Payment Action
One-tap payment for manual bills.
*   User clicks "Pay Rent".
*   System prompts: "Confirm 30,000 RUB from Main Card?".
*   System records transaction and moves due date to next month.

---

## 5. Implementation Strategy

1.  **Store:** Add `paySubscription(id)` action which performs the transactional logic.
2.  **Visualization:** Add a new section to `FinanceScreen`.
3.  **Presets:** Include a list of popular services (Youtube, Telegram Premium, etc.) with icons/colors for better UX.
