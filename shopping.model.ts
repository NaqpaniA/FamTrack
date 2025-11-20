
import React from 'react';
import { Apple, Home, Circle, ShoppingBag } from 'lucide-react';

export type ShoppingCategoryType = 'FOOD' | 'HOME' | 'OTHER';

export interface ShoppingItem {
  id: string;
  title: string;
  category: ShoppingCategoryType;
  addedById: string;
  isCompleted: boolean;
  createdAt: number;
}

export interface ShoppingCategoryConfig {
    id: ShoppingCategoryType;
    label: string;
    icon: React.ReactNode;
    color: string;
}

export const SHOPPING_CATEGORIES: Record<ShoppingCategoryType, ShoppingCategoryConfig> = {
    FOOD: { 
        id: 'FOOD', 
        label: 'Еда', 
        icon: React.createElement(Apple, { size: 16 }), 
        color: 'bg-green-100 text-green-600' 
    },
    HOME: { 
        id: 'HOME', 
        label: 'Дом', 
        icon: React.createElement(Home, { size: 16 }), 
        color: 'bg-blue-100 text-blue-600' 
    },
    OTHER: { 
        id: 'OTHER', 
        label: 'Разное', 
        icon: React.createElement(ShoppingBag, { size: 16 }), 
        color: 'bg-gray-100 text-gray-600' 
    }
};
