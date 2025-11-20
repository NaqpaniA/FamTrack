
import React, { useState } from 'react';
import { 
  Trophy, 
  Crown, 
  Sparkles, 
  ShoppingBag, 
  History, 
  Star,
  Lock,
  Coins
} from 'lucide-react';
import { AppData } from './types';
import { User, Reward, calculateLevel, getLevelProgress, getNextLevelXp } from './family.model';
import { Avatar, Card, Modal } from './ui-kit';

// --- Components ---

export const MemberCard = ({ user, isCurrentUser }: { user: User, isCurrentUser: boolean }) => {
    const nextLevelXp = getNextLevelXp(user.level);
    const progress = getLevelProgress(user.xp);

    return (
        <div className={`bg-white p-4 rounded-2xl shadow-sm border ${isCurrentUser ? 'border-blue-200 ring-1 ring-blue-50' : 'border-gray-100'} relative overflow-hidden`}>
             {user.role === 'OWNER' && <Crown size={16} className="absolute top-3 right-3 text-yellow-500" />}
             
             <div className="flex flex-col items-center text-center mb-3 relative z-10">
                <div className="mb-2 relative">
                    <Avatar user={user} size="xl" />
                    <div className="absolute -bottom-2 -right-2 bg-black text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-sm">
                        Lvl {user.level}
                    </div>
                </div>
                <div className="font-bold text-lg leading-tight">{user.name}</div>
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

export const RewardCard = ({ reward, userXp, onBuy }: { reward: Reward, userXp: number, onBuy: () => void }) => {
    const canAfford = userXp >= reward.cost;
    
    return (
        <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center relative overflow-hidden group active:scale-95 transition-transform">
            <div className="text-4xl mb-2 transform group-hover:scale-110 transition-transform duration-300">{reward.icon}</div>
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

// --- Screens ---

export const FamilyScreen = ({ 
    data, 
    onUpdateUser, 
    onBuyReward 
}: { 
    data: AppData, 
    onUpdateUser: (u: User) => void,
    onBuyReward: (reward: Reward) => void
}) => {
    const [activeTab, setActiveTab] = useState<'MEMBERS' | 'SHOP'>('MEMBERS');
    const [isHistoryOpen, setHistoryOpen] = useState(false);

    // Filter history for current user or all if owner? Let's show all for now but maybe limit length
    const history = [...data.rewardLogs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);

    return (
        <div className="p-4 pb-24 min-h-screen flex flex-col space-y-6">
             {/* Header */}
             <div className="flex items-center justify-between">
                 <h1 className="text-2xl font-bold">Семья</h1>
                 <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('MEMBERS')} 
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'MEMBERS' ? 'bg-white shadow text-black' : 'text-gray-400'}`}
                    >
                        Участники
                    </button>
                    <button 
                        onClick={() => setActiveTab('SHOP')} 
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeTab === 'SHOP' ? 'bg-white shadow text-black' : 'text-gray-400'}`}
                    >
                        <ShoppingBag size={14} /> Магазин
                    </button>
                </div>
            </div>

            {activeTab === 'MEMBERS' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="grid grid-cols-2 gap-4">
                        {data.members.map(user => (
                            <MemberCard 
                                key={user.id} 
                                user={user} 
                                isCurrentUser={user.id === data.currentUser.id} 
                            />
                        ))}
                    </div>

                    <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-2">
                                <Trophy className="text-yellow-300" size={24} />
                                <h3 className="text-lg font-bold">Лидерборд</h3>
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

            {activeTab === 'SHOP' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                     {/* Balance */}
                     <div className="bg-black text-white p-4 rounded-2xl flex items-center justify-between shadow-lg">
                         <div>
                             <div className="text-gray-400 text-xs font-bold uppercase mb-1">Твой Баланс</div>
                             <div className="text-2xl font-bold text-yellow-400 flex items-center gap-2">
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
                         <h3 className="font-bold text-lg mb-3">Награды</h3>
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
                                        <div className={`p-2 rounded-full ${log.action === 'EARNED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                            {log.action === 'EARNED' ? <Sparkles size={16} /> : <ShoppingBag size={16} />}
                                        </div>
                                        <div>
                                            <div className="text-sm font-medium leading-tight">{log.description}</div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                                                {user && <span>{user.name}</span>} • {new Date(log.timestamp).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={`font-bold text-sm ${log.action === 'EARNED' ? 'text-green-600' : 'text-red-600'}`}>
                                        {log.action === 'EARNED' ? '+' : '-'}{log.amount}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
            </Modal>
        </div>
    )
}
