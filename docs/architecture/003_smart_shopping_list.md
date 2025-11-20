# Architectural Design Record (ADR) 003: Smart Shopping List & Finance Integration

**Status:** APPROVED
**Date:** 2024-05-28
**Author:** Senior Product Architect
**Target Feature:** Household Management

---

## 1. Context & Problem Statement

Families struggle with two disconnected processes:
1.  **Logistics:** Knowing what to buy (Groceries, Household items).
2.  **Finance:** Tracking how much was spent on those items.

Currently, users list items in WhatsApp or Notes, buy them, and then *forget* to record the expense in the Finance module. This leads to inaccurate budget tracking.

**Goal:** Create a unified "Shop" tab where users can collaborate on a list and seamlessly convert bought items into financial transactions.

---

## 2. Decision: "Checkout Mode" Workflow

We will implement a Shopping List that is tightly coupled with the Finance module via a **"Checkout"** workflow.

### Core Logic:
1.  **Collaborative List:** Any family member can add items.
2.  **Real-time Status:** Items have `PENDING` | `BOUGHT` states.
3.  **The Checkout Action:**
    *   User selects items they just put in the cart (checks them off).
    *   User hits "Complete Shopping".
    *   App calculates the number of items.
    *   App prompts: *"Create a transaction for these items?"*
    *   User enters total amount (e.g., 2500 RUB).
    *   **Result:** Items are removed from the active list, and a `Transaction` is created in the Finance ledger automatically tagged as 'Groceries' (or user selection).

---

## 3. Data Architecture

### Schema Updates

```typescript
interface ShoppingItem {
  id: string;
  title: string; // e.g., "Milk"
  category?: 'FOOD' | 'HOME' | 'OTHER'; // Simple taxonomy
  addedById: string;
  isCompleted: boolean; // "In the cart" state
  createdAt: number;
}

// Add to AppData
interface AppData {
  // ... existing fields
  shoppingList: ShoppingItem[];
}
```

---

## 4. User Experience (UI)

### 4.1. The Input
*   Fast text entry (Auto-focus after add for rapid fire entry).
*   Quick category chips (Food, Home).

### 4.2. The List
*   Grouped by status (To Buy vs. In Cart).
*   Swipe-to-delete.

### 4.3. The "Checkout" Fab
*   A floating action button that appears only when items are checked (`isCompleted === true`).
*   Label: "Finish Shopping".
*   Action: Opens a modal to finalize expense.

---

## 5. Implementation Strategy

1.  **State:** Leverage existing `useAppStore` and `batchUpdate` to minimize boilerplate. No new API endpoints needed strictly for items if we treat the list as a JSON document update.
2.  **Migration:** Ensure `LocalDatabase.load()` initializes an empty `shoppingList` array for existing users.
