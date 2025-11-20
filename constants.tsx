
import React from 'react';
import { 
  ShoppingBag, 
  Car, 
  Home, 
  Gamepad2, 
  Gift, 
  Smartphone, 
  Briefcase, 
  ArrowRightLeft, 
  Circle 
} from 'lucide-react';
import { Priority, TransactionCategory } from './types';

export const PRIORITIES: Record<Priority, { label: string, color: string, iconColor: string }> = {
  HIGH: { label: 'Высокий', color: 'bg-red-100 text-red-700', iconColor: 'text-red-500' },
  MEDIUM: { label: 'Средний', color: 'bg-orange-100 text-orange-700', iconColor: 'text-orange-500' },
  LOW: { label: 'Низкий', color: 'bg-blue-100 text-blue-700', iconColor: 'text-blue-500' },
};

export const CATEGORIES: Record<string, TransactionCategory> = {
  food: { id: 'food', label: 'Продукты', icon: <ShoppingBag size={20} />, color: 'bg-orange-100 text-orange-600', type: 'EXPENSE' },
  transport: { id: 'transport', label: 'Транспорт', icon: <Car size={20} />, color: 'bg-blue-100 text-blue-600', type: 'EXPENSE' },
  home: { id: 'home', label: 'Аренда/Дом', icon: <Home size={20} />, color: 'bg-purple-100 text-purple-600', type: 'EXPENSE' },
  entertainment: { id: 'entertainment', label: 'Досуг', icon: <Gamepad2 size={20} />, color: 'bg-indigo-100 text-indigo-600', type: 'EXPENSE' },
  shopping: { id: 'shopping', label: 'Шопинг', icon: <Gift size={20} />, color: 'bg-pink-100 text-pink-600', type: 'EXPENSE' },
  services: { id: 'services', label: 'Услуги', icon: <Smartphone size={20} />, color: 'bg-gray-100 text-gray-600', type: 'EXPENSE' },
  salary: { id: 'salary', label: 'Зарплата', icon: <Briefcase size={20} />, color: 'bg-green-100 text-green-600', type: 'INCOME' },
  gift: { id: 'gift', label: 'Подарок', icon: <Gift size={20} />, color: 'bg-yellow-100 text-yellow-600', type: 'INCOME' },
  transfer: { id: 'transfer', label: 'Перевод', icon: <ArrowRightLeft size={20} />, color: 'bg-slate-100 text-slate-600', type: 'BOTH' },
  other: { id: 'other', label: 'Другое', icon: <Circle size={20} />, color: 'bg-slate-100 text-slate-600', type: 'BOTH' },
};
