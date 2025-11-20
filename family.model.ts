
// --- Types ---

export type Role = 'OWNER' | 'ADMIN' | 'CHILD';

export interface User {
  id: string;
  name: string;
  role: Role;
  avatar: string; // Emoji
  xp: number;
  level: number;
  telegramUsername?: string;
}

export interface Reward {
  id: string;
  title: string;
  cost: number;
  icon: string; // Emoji
  description?: string;
}

export interface RewardLog {
  id: string;
  userId: string;
  action: 'EARNED' | 'SPENT' | 'USED'; // Added USED
  amount: number; // 0 for USED
  description: string;
  timestamp: number;
}

export type ItemStatus = 'AVAILABLE' | 'USED';

export interface InventoryItem {
  id: string;
  rewardId: string;
  ownerId: string;
  status: ItemStatus;
  purchasedAt: number;
  usedAt?: number;
}

// --- Utils ---

/**
 * Calculates user level based on XP.
 * Formula: Level = sqrt(XP / 100) + 1
 * Examples: 0xp -> Lvl 1, 100xp -> Lvl 2, 400xp -> Lvl 3, 2500xp -> Lvl 6
 */
export const calculateLevel = (xp: number): number => {
    if (xp < 0) return 1;
    return Math.floor(Math.sqrt(xp / 100)) + 1;
};

export const getNextLevelXp = (currentLevel: number): number => {
    return Math.pow(currentLevel, 2) * 100;
};

export const getLevelProgress = (xp: number) => {
    const level = calculateLevel(xp);
    const prevLevelXp = Math.pow(level - 1, 2) * 100;
    const nextLevelXp = Math.pow(level, 2) * 100;
    
    const progress = xp - prevLevelXp;
    const totalNeeded = nextLevelXp - prevLevelXp;
    
    return Math.min((progress / totalNeeded) * 100, 100);
};
