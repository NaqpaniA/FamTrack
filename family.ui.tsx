
import React, { useState } from 'react';
import { 
  Trophy, 
  Crown, 
  Sparkles, 
  ShoppingBag, 
  History, 
  Star,
  Lock,
  Coins,
  Backpack,
  Ticket,
  CheckCheck,
  Clock
} from 'lucide-react';
import { AppData } from './types';
import { User, Reward, InventoryItem, calculateLevel, getLevelProgress, getNextLevelXp } from './family.model';
import { Avatar, Modal, Screen, SectionHeader, SegmentedControl } from './ui-kit';

// --- Components ---

export const MemberCard = ({ user, isCurrentUser }: { key?: React.Key, user: User, isCurrentUser: boolean }) => {
    const nextLevelXp = getNextLevelXp(user.level);
    const progress = getLevelProgress(user.xp);

    return (
        <div className={`bg-white p-3 rounded-[14px] shadow-sm border ${isCurrentUser ? 'border-blue-200 ring-1 ring-blue-50' : 'border-gray-100'} relative overflow-hidden`}>
             {user.role === 'OWNER' && <Crown size={16} className="absolute top-3 right-3 text-yellow-500" />}
             
             <div className="flex flex-col items-center text-center mb-3 relative z-10">
                <div className="mb-2 relative">
                    <Avatar user={user} size="xl" />
                    <div className="absolute -bottom-2 -right-2 bg-black text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">
                        Lvl {user.level}
                    </div>
                </div>
                <div className="font-bold text-[15px] leading-tight">{user.name}</div>
                <div className="text-xs text-gray-400 capitalize mb-1">{user.role.toLowerCase()}</div>
                <div className="flex items-center gap-1 text-yellow-600 font-bold text-sm bg-yellow-50 px-2 py-0.5 rounded-lg">
                    <Star size={12} className="fill-current" />
                    {user.xp} XP
                </div>
             </div>

             <div className="relative z-10 mt-2">
                 <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>Прогресс</span>
                    <span>{Math.round(nextLevelXp - user.xp)} до след. уровня</span>
                 </div>
                 <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-yellow-400 to-orange-400 h-full rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                 </div>
             </div>

             {/* Decor background */}
             <div className="absolute -top-10 -left-10 w-32 h-32 bg-gray-50 rounded-full opacity-50 pointer-events-none" />
        </div>
    );
};

export const RewardCard = ({ reward, userXp, onBuy }: { key?: React.Key, reward: Reward, userXp: number, onBuy: () => void }) => {
    const canAfford = userXp >= reward.cost;
    
    return (
        <div className="bg-white p-3 rounded-[14px] shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden group active:scale-95 transition-transform min-h-[150px]">
            <div className="text-3xl mb-2 transform group-hover:scale-110 transition-transform duration-300">{reward.icon}</div>
            <div className="font-bold text-sm leading-tight mb-1">{reward.title}</div>
            {reward.description && <div className="text-[10px] text-gray-400 mb-2 line-clamp-2">{reward.description}</div>}
            
            <div className="mt-auto w-full">
                <button 
                    onClick={() => canAfford && onBuy()}
                    disabled={!canAfford}
                    className={`w-full py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors ${canAfford ? 'bg-black text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                    {canAfford ? (
                        <>
                           <Coins size={12} /> {reward.cost}
                        </>
                    ) : (
                        <>
                           <Lock size={12} /> {reward.cost}
                        </>
                    )}
                </button>
            </div>
        </div>
    )
};

export const InventoryItemCard = ({ item, reward, onConsume }: { key?: React.Key, item: InventoryItem, reward?: Reward, onConsume: () => void }) => {
    if (!reward) return null;
    const isUsed = item.status === 'USED';

    return (
        <div className={`relative p-3 rounded-[14px] border flex flex-col items-center text-center transition-all ${isUsed ? 'bg-gray-50 border-gray-100 opacity-60 grayscale' : 'bg-white border-blue-100 shadow-sm ring-1 ring-blue-50/50'}`}>
             {isUsed && (
                 <div className="absolute inset-0 flex items-center justify-center z-10">
                     <div className="bg-gray-800 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 rotate-[-10deg]">
                         <CheckCheck size={12} /> Использовано
                     </div>
                 </div>
             )}
             
             <div className="text-4xl mb-2">{reward.icon}</div>
             <div className="font-bold text-sm mb-1">{reward.title}</div>
             <div className="text-[10px] text-gray-400 mb-3 flex items-center gap-1">
                 {isUsed ? <Clock size={10} /> : <Ticket size={10} />}
                 {isUsed 
                    ? `Использовано ${new Date(item.usedAt!).toLocaleDateString()}`
                    : `Куплено ${new Date(item.purchasedAt).toLocaleDateString()}`
                 }
             </div>

             {!isUsed && (
                 <button 
                    onClick={onConsume}
                    className="w-full bg-blue-600 text-white text-xs font-bold py-2 rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-blue-200 shadow-lg"
                 >
                     Использовать
                 </button>
             )}
        </div>
    )
};

// --- Screens ---

export const FamilyScreen = ({ 
    data, 
    onUpdateUser, 
    onBuyReward,
    onConsumeItem
}: { 
    data: AppData, 
    onUpdateUser: (u: User) => void,
    onBuyReward: (reward: Reward) => void,
    onConsumeItem?: (item: InventoryItem, rewardTitle: string) => void
}) => {
    const [activeTab, setActiveTab] = useState<'MEMBERS' | 'SHOP' | 'INVENTORY'>('MEMBERS');
    const [isHistoryOpen, setHistoryOpen] = useState(false);

    const history = [...data.rewardLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
    
    // Inventory Logic
    const myInventory = (data.inventory || []).filter(i => i.ownerId === data.currentUser.id);
    const activeItems = myInventory.filter(i => i.status === 'AVAILABLE').sort((a,b) => b.purchasedAt - a.purchasedAt);
    const usedItems = myInventory.filter(i => i.status === 'USED').sort((a,b) => b.usedAt! - a.usedAt!);

    const handleConsume = (item: InventoryItem) => {
        const r = data.rewards.find(r => r.id === item.rewardId);
        if (r && confirm(`Активировать "${r.title}" сейчас? Это действие нельзя отменить.`)) {
            onConsumeItem?.(item, r.title);
        }
    };

    return (
        <Screen className="flex flex-col">
             {/* Header */}
             <div className="flex items-center justify-between flex-wrap gap-2">
                 <h1 className="text-[24px] leading-tight font-bold">Семья</h1>
                 <SegmentedControl
                    value={activeTab}
                    onChange={setActiveTab}
                    options={[
                        { value: 'MEMBERS', label: 'Участники' },
                        { value: 'INVENTORY', label: 'Рюкзак', icon: Backpack },
                        { value: 'SHOP', label: 'Магазин', icon: ShoppingBag }
                    ]}
                 />
            </div>

            {activeTab === 'MEMBERS' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-3">
                        {data.members.map(user => (
                            <MemberCard 
                                key={user.id} 
                                user={user} 
                                isCurrentUser={user.id === data.currentUser.id} 
                            />
                        ))}
                    </div>

                    <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-[14px] p-4 text-white shadow-md relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <Trophy className="text-yellow-300" size={24} />
                                <h3 className="text-[17px] font-bold">Лидерборд</h3>
                            </div>
                            <div className="space-y-3 mt-4">
                                {[...data.members].sort((a,b) => b.xp - a.xp).map((u, idx) => (
                                    <div key={u.id} className="flex items-center justify-between bg-white/10 p-2 rounded-xl backdrop-blur-sm border border-white/10">
                                        <div className="flex items-center gap-3">
                                            <div className="font-bold font-mono w-4 text-center">{idx + 1}</div>
                                            <Avatar user={u} size="sm" />
                                            <span className="font-medium text-sm">{u.name}</span>
                                        </div>
                                        <span className="font-bold text-sm">{u.xp} XP</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'INVENTORY' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-lg">Мои вещи</h3>
                        <span className="text-xs text-gray-400">{activeItems.length} доступно</span>
                    </div>

                    {myInventory.length === 0 ? (
                        <div className="text-center py-8 bg-gray-50 rounded-[14px] border border-dashed border-gray-200">
                            <Backpack className="mx-auto text-gray-300 mb-2" size={42} />
                            <p className="text-gray-400 text-sm">Рюкзак пуст. Купите что-нибудь в магазине!</p>
                            <button onClick={() => setActiveTab('SHOP')} className="mt-4 text-blue-500 text-sm font-bold">Перейти в магазин</button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            {activeItems.map(item => (
                                <InventoryItemCard 
                                    key={item.id} 
                                    item={item} 
                                    reward={data.rewards.find(r => r.id === item.rewardId)}
                                    onConsume={() => handleConsume(item)}
                                />
                            ))}
                            {usedItems.length > 0 && (
                                <>
                                    <div className="col-span-2 mt-4 mb-2 flex items-center gap-2">
                                        <div className="h-px flex-1 bg-gray-200" />
                                        <span className="text-xs text-gray-400 font-medium uppercase">История</span>
                                        <div className="h-px flex-1 bg-gray-200" />
                                    </div>
                                    {usedItems.map(item => (
                                        <InventoryItemCard 
                                            key={item.id} 
                                            item={item} 
                                            reward={data.rewards.find(r => r.id === item.rewardId)}
                                            onConsume={() => {}}
                                        />
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'SHOP' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                     {/* Balance */}
                     <div className="bg-black text-white p-4 rounded-[14px] flex items-center justify-between shadow-md">
                         <div>
                             <div className="text-gray-400 text-xs font-bold uppercase mb-1">Твой Баланс</div>
                             <div className="text-[24px] font-bold text-yellow-400 flex items-center gap-2">
                                 <Coins className="fill-current" />
                                 {data.currentUser.xp}
                             </div>
                         </div>
                         <button onClick={() => setHistoryOpen(true)} className="bg-white/20 p-2 rounded-xl hover:bg-white/30 transition-colors">
                             <History size={20} />
                         </button>
                     </div>

                     {/* Rewards Grid */}
                     <div>
                         <SectionHeader title="Награды" />
                         <div className="h-3" />
                         <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                             {data.rewards.map(reward => (
                                 <RewardCard 
                                    key={reward.id}
                                    reward={reward}
                                    userXp={data.currentUser.xp}
                                    onBuy={() => onBuyReward(reward)}
                                 />
                             ))}
                         </div>
                     </div>
                </div>
            )}

            {/* History Modal */}
            <Modal isOpen={isHistoryOpen} onClose={() => setHistoryOpen(false)} title="История наград">
                <div className="space-y-3 pb-10">
                    {history.length === 0 ? (
                        <div className="text-center text-gray-400 py-4">История пуста</div>
                    ) : (
                        history.map(log => {
                            const user = data.members.find(m => m.id === log.userId);
                            return (
                                <div key={log.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2 rounded-full ${log.action === 'EARNED' ? 'bg-green-100 text-green-600' : log.action === 'USED' ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                                            {log.action === 'EARNED' ? <Sparkles size={16} /> : log.action === 'USED' ? <Ticket size={16} /> : <ShoppingBag size={16} />}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium leading-tight">{log.description}</div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                                                {user && <span>{user.name}</span>} • {new Date(log.timestamp).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`font-bold text-sm ${log.action === 'EARNED' ? 'text-green-600' : 'text-gray-500'}`}>
                                        {log.action === 'EARNED' ? '+' + log.amount : log.action === 'SPENT' ? '-' + log.amount : ''}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </Modal>
        </Screen>
    )
}
