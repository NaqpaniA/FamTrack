
import React, { useState } from 'react';
import { 
    Plus, 
    CheckCircle2, 
    Circle, 
    Trash2, 
    ShoppingBag, 
    ChevronRight,
    Utensils,
    ArrowRight
} from 'lucide-react';
import { AppData, Account } from './types';
import { ShoppingItem, SHOPPING_CATEGORIES, ShoppingCategoryType } from './shopping.model';
import { formatMoney, isVisible } from './utils';
import { Avatar, Modal } from './ui-kit';

export const ShoppingScreen = ({ 
    data, 
    onAddItem, 
    onToggleItem, 
    onDeleteItem, 
    onCheckout 
}: { 
    data: AppData, 
    onAddItem: (title: string, category: ShoppingCategoryType) => void,
    onToggleItem: (id: string) => void,
    onDeleteItem: (id: string) => void,
    onCheckout: (amount: number, accountId: string) => void
}) => {
    const [newItemTitle, setNewItemTitle] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<ShoppingCategoryType>('FOOD');
    const [isCheckoutOpen, setCheckoutOpen] = useState(false);
    
    const items = data.shoppingList || [];
    const activeItems = items.filter(i => !i.isCompleted);
    const completedItems = items.filter(i => i.isCompleted);

    const handleAdd = () => {
        if (!newItemTitle.trim()) return;
        onAddItem(newItemTitle, selectedCategory);
        setNewItemTitle('');
    };

    return (
        <div className="p-4 pb-24 min-h-screen flex flex-col">
            <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <ShoppingBag className="text-blue-500" /> Список
                </h1>
                <div className="text-sm text-gray-400 font-medium">
                    {activeItems.length} осталось
                </div>
            </div>

            {/* Input Area */}
            <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <input 
                        value={newItemTitle}
                        onChange={e => setNewItemTitle(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        placeholder="Что нужно купить?"
                        className="flex-1 text-lg outline-none placeholder-gray-300 font-medium"
                        autoFocus
                    />
                    <button 
                        onClick={handleAdd}
                        disabled={!newItemTitle}
                        className="bg-blue-500 text-white p-2 rounded-xl disabled:opacity-50 disabled:bg-gray-200"
                    >
                        <Plus size={20} />
                    </button>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {Object.values(SHOPPING_CATEGORIES).map(cat => (
                        <button 
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedCategory === cat.id ? cat.color + ' border-transparent' : 'bg-gray-50 text-gray-400 border-transparent'}`}
                        >
                            {cat.icon} {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Items */}
            <div className="space-y-2 mb-6">
                {activeItems.length === 0 && completedItems.length === 0 && (
                    <div className="text-center py-10 text-gray-400">
                        <Utensils size={48} className="mx-auto mb-3 opacity-20" />
                        <p>Список пуст. Добавьте что-нибудь!</p>
                    </div>
                )}
                
                {activeItems.map(item => {
                    const cat = SHOPPING_CATEGORIES[item.category];
                    const owner = data.members.find(m => m.id === item.addedById);
                    
                    return (
                        <div key={item.id} className="flex items-center gap-3 bg-white p-3 rounded-xl shadow-sm border border-gray-50 active:scale-[0.99] transition-transform" onClick={() => onToggleItem(item.id)}>
                            <Circle size={24} className="text-gray-300" />
                            <div className="flex-1">
                                <div className="font-medium text-gray-900">{item.title}</div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                    {owner && <span>{owner.name}</span>}
                                    {cat && <span className={`px-1.5 rounded ${cat.color} bg-opacity-20 text-opacity-80`}>{cat.label}</span>}
                                </div>
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }} className="text-gray-300 hover:text-red-400 p-2">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    )
                })}
            </div>

            {/* Completed Items */}
            {completedItems.length > 0 && (
                <div>
                    <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">В корзине ({completedItems.length})</h3>
                    <div className="space-y-1 opacity-60">
                        {completedItems.map(item => (
                            <div key={item.id} className="flex items-center gap-3 p-2" onClick={() => onToggleItem(item.id)}>
                                <CheckCircle2 size={20} className="text-green-500" />
                                <div className="flex-1 text-gray-500 line-through text-sm">{item.title}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Floating Checkout Button */}
            {completedItems.length > 0 && (
                <div className="fixed bottom-24 left-0 right-0 flex justify-center z-40 pointer-events-none">
                    <button 
                        onClick={() => setCheckoutOpen(true)}
                        className="pointer-events-auto bg-black text-white px-6 py-3 rounded-full font-bold shadow-2xl flex items-center gap-2 animate-in slide-in-from-bottom-10 active:scale-95 transition-transform"
                    >
                        Завершить покупки <ArrowRight size={18} />
                    </button>
                </div>
            )}

            {/* Checkout Modal */}
            <CheckoutModal 
                isOpen={isCheckoutOpen}
                onClose={() => setCheckoutOpen(false)}
                itemCount={completedItems.length}
                accounts={data.accounts.filter(a => isVisible(a, data.currentUser.id))}
                onConfirm={onCheckout}
            />
        </div>
    );
};

const CheckoutModal = ({ 
    isOpen, 
    onClose, 
    itemCount, 
    accounts, 
    onConfirm 
}: { 
    isOpen: boolean, 
    onClose: () => void, 
    itemCount: number, 
    accounts: Account[], 
    onConfirm: (amount: number, accountId: string) => void 
}) => {
    const [amount, setAmount] = useState('');
    const [accountId, setAccountId] = useState(accounts[0]?.id || '');

    if (!isOpen) return null;
    
    // Use safe default if accounts list is empty/loading
    const safeAccountId = accountId || accounts[0]?.id;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Итого">
            <div className="space-y-6 pb-10">
                <div className="text-center">
                    <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
                        🛒
                    </div>
                    <p className="text-gray-600">
                        Вы купили <span className="font-bold text-black">{itemCount} товаров</span>.
                        <br />
                        Запишем это в расходы?
                    </p>
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Сумма чека</label>
                    <input 
                        type="number" 
                        value={amount} 
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0" 
                        className="w-full bg-gray-50 rounded-xl p-4 text-2xl font-bold outline-none text-center"
                        autoFocus
                    />
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Счет списания</label>
                    <select 
                        value={safeAccountId} 
                        onChange={e => setAccountId(e.target.value)}
                        className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none appearance-none"
                    >
                        {accounts.map(a => (
                            <option key={a.id} value={a.id}>{a.name} ({formatMoney(a.balance)})</option>
                        ))}
                    </select>
                </div>

                <div className="flex gap-2">
                    <button 
                        onClick={onClose}
                        className="flex-1 bg-gray-100 text-gray-600 rounded-xl py-3 font-bold"
                    >
                        Отмена
                    </button>
                    <button 
                        onClick={() => {
                            onConfirm(Number(amount) * 100, safeAccountId);
                            onClose();
                            setAmount('');
                        }}
                        disabled={!amount}
                        className="flex-1 bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50 shadow-lg"
                    >
                        Оплатить
                    </button>
                </div>
            </div>
        </Modal>
    )
}
