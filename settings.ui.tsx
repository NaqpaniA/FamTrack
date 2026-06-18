
import React from 'react';
import { AppData } from './types';
import { Avatar } from './ui-kit';
import { RotateCcw, UserCircle2 } from 'lucide-react';

export const SettingsModal = ({ 
    data, 
    onReset 
}: { 
    data: AppData, 
    onReset: () => void 
}) => {
    const isOwner = data.currentUser.role === 'OWNER';

    return (
        <div className="space-y-6">
            {/* Telegram identity */}
            <div className="space-y-3">
                <div className="flex items-center gap-2 text-gray-500 font-bold text-sm uppercase tracking-wider">
                    <UserCircle2 size={18} />
                    Текущий профиль
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <Avatar user={data.currentUser} size="md" />
                    <div>
                        <div className="font-bold text-sm text-blue-950">{data.currentUser.name}</div>
                        <div className="text-[10px] text-blue-700">{data.currentUser.role}</div>
                    </div>
                </div>
                {isOwner && (
                    <div className="grid grid-cols-2 gap-2">
                        {data.members.filter(user => user.id !== data.currentUser.id).map(user => (
                            <div key={user.id} className="flex items-center gap-2 p-2 rounded-xl bg-gray-50 border border-gray-100">
                                <Avatar user={user} size="sm" />
                                <div>
                                    <div className="font-bold text-xs text-gray-900">{user.name}</div>
                                    <div className="text-[9px] text-gray-500">{user.role}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <hr className="border-gray-100" />

            {/* Data Management */}
            <div className="space-y-3">
                 <div className="text-gray-400 text-xs font-bold uppercase">Управление данными</div>
                 {isOwner ? (
                    <>
                        <button
                            onClick={onReset}
                            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl bg-red-50 text-red-600 font-bold text-sm hover:bg-red-100 transition-colors"
                        >
                            <RotateCcw size={18} />
                            Сбросить все данные и начать заново
                        </button>
                        <p className="text-[10px] text-center text-gray-400">
                            Это удалит все задачи, транзакции и вернет стандартные настройки.
                        </p>
                    </>
                 ) : (
                    <p className="text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
                        Управление семейными данными доступно владельцу.
                    </p>
                 )}
            </div>

            <div className="text-center pt-4">
                <p className="text-[10px] text-gray-300">Family OS v1.0 • Powered by Gemini</p>
            </div>
        </div>
    );
};
