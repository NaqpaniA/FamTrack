
import { AppData } from './types';
import { User } from './family.model';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Папа', role: 'OWNER', avatar: '👨🏻', xp: 2450, level: 5, telegramUsername: 'Naqpania', streak: 5, lastLoginDate: new Date().toISOString().split('T')[0] },
  { id: 'u2', name: 'Мама', role: 'ADMIN', avatar: '👩🏼', xp: 2100, level: 4, streak: 12, lastLoginDate: new Date().toISOString().split('T')[0] },
  { id: 'u3', name: 'Сын', role: 'CHILD', avatar: '👦🏻', xp: 850, level: 3, streak: 1 },
  { id: 'u4', name: 'Дочь', role: 'CHILD', avatar: '👧🏼', xp: 1200, level: 3, streak: 0 },
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
  savingsGoals: [
      { id: 'sg1', title: 'Sony PlayStation 5', targetAmount: 6000000, currentAmount: 1500000, status: 'ACTIVE', icon: '🎮', createdById: 'u3', createdAt: Date.now() },
      { id: 'sg2', title: 'Семейный Диснейленд', targetAmount: 50000000, currentAmount: 12000000, status: 'ACTIVE', icon: '🏰', createdById: 'u1', createdAt: Date.now() }
  ],
  contributions: [],
  budgets: [
      { categoryId: 'food', limit: 6000000 }, // 60k RUB
      { categoryId: 'home', limit: 4000000 }, // 40k RUB
      { categoryId: 'entertainment', limit: 1500000 } // 15k RUB
  ],
  transactions: [
    { id: 't1', amount: 250000, title: 'Супермаркет', type: 'EXPENSE', categoryId: 'food', accountId: 'ac1', date: new Date().toISOString(), createdById: 'u1' },
  ],
  rewards: [
      { id: 'r1', title: 'Пицца на ужин', cost: 500, icon: '🍕', description: 'Заказ любой пиццы на дом' },
      { id: 'r2', title: 'Поход в кино', cost: 1000, icon: '🍿', description: 'Билеты и попкорн' },
      { id: 'r3', title: '1 час игры', cost: 200, icon: '🎮', description: 'Дополнительное время за компьютером' },
      { id: 'r4', title: 'Мороженое', cost: 150, icon: '🍦' },
      { id: 'r5', title: 'Новая игра', cost: 5000, icon: '💿', description: 'Покупка игры в Steam/PS' },
  ],
  rewardLogs: [],
  inventory: [],
  shoppingList: [
      { id: 's1', title: 'Молоко', category: 'FOOD', addedById: 'u2', isCompleted: false, createdAt: Date.now() },
      { id: 's2', title: 'Губки для посуды', category: 'HOME', addedById: 'u2', isCompleted: false, createdAt: Date.now() }
  ]
};
