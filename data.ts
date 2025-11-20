
import { User, AppData } from './types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Папа', role: 'OWNER', avatar: '👨🏻', xp: 2450, level: 8, telegramUsername: 'Naqpania' },
  { id: 'u2', name: 'Мама', role: 'ADMIN', avatar: '👩🏼', xp: 2100, level: 7 },
  { id: 'u3', name: 'Сын', role: 'CHILD', avatar: '👦🏻', xp: 850, level: 3 },
  { id: 'u4', name: 'Дочь', role: 'CHILD', avatar: '👧🏼', xp: 1200, level: 4 },
];

export const INITIAL_DATA: AppData = {
  currentUser: MOCK_USERS[0],
  members: MOCK_USERS,
  epics: [
    { id: 'e1', title: 'Ремонт кухни', priority: 'HIGH', color: 'bg-orange-500', isCompleted: false },
    { id: 'e2', title: 'Отпуск Лето', priority: 'MEDIUM', color: 'bg-blue-500', isCompleted: false }
  ],
  tasks: [
    { 
      id: '1', 
      title: 'Купить плитку', 
      description: 'Белую, 20x20',
      status: 'TODO', 
      priority: 'HIGH',
      points: 50, 
      assigneeId: 'u1', 
      createdById: 'u2',
      epicId: 'e1',
      subtasks: [],
      createdAt: Date.now()
    },
  ],
  accounts: [
      { id: 'ac1', name: 'Основной (Tinkoff)', balance: 12500000, type: 'CARD' },
      { id: 'ac2', name: 'Наличные', balance: 1500000, type: 'CASH' },
      { id: 'ac3', name: 'Копилка на Авто', balance: 50000000, type: 'SAVINGS', goalId: 'g1' }
  ],
  goals: [
      { id: 'g1', accountId: 'ac3', title: 'Новая Машина', targetAmount: 200000000, currentAmount: 50000000, deadline: '2025-12-31' }
  ],
  budgets: [
      { categoryId: 'food', limit: 6000000 }, // 60k RUB
      { categoryId: 'home', limit: 4000000 }, // 40k RUB
      { categoryId: 'entertainment', limit: 1500000 } // 15k RUB
  ],
  transactions: [
    { id: 't1', amount: 250000, title: 'Супермаркет', type: 'EXPENSE', categoryId: 'food', accountId: 'ac1', date: new Date().toISOString(), createdById: 'u1' },
  ],
  rewards: [
      { id: 'r1', title: 'Пицца на ужин', cost: 500, icon: '🍕' },
      { id: 'r2', title: 'Поход в кино', cost: 1000, icon: '🍿' },
      { id: 'r3', title: '1 час игры', cost: 200, icon: '🎮' },
  ],
  rewardLogs: []
};
