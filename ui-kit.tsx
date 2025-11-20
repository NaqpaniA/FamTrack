
import React from 'react';
import { 
  X, 
  CheckCircle2, 
  Eye,
  EyeOff,
  Calendar
} from 'lucide-react';
import { User, ToastMessage } from './types';

export const Card = ({ children, className = '', onClick }: { children?: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 ${className}`}>
    {children}
  </div>
);

export const Avatar = ({ user, size = 'sm', selected = false, onClick }: { user?: User, size?: 'sm' | 'md' | 'lg' | 'xl', selected?: boolean, onClick?: () => void }) => {
  const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-lg', lg: 'w-14 h-14 text-2xl', xl: 'w-20 h-20 text-4xl' };
  return (
    <div 
      onClick={onClick}
      className={`${sizes[size]} rounded-full flex items-center justify-center bg-gray-100 border-2 transition-all cursor-pointer ${selected ? 'border-blue-500 ring-2 ring-blue-100 scale-110' : 'border-white'}`}
    >
      {user ? user.avatar : '?'}
    </div>
  );
};

export const VisibilitySelector = ({ members, selectedIds = [], onChange }: { members: User[], selectedIds?: string[], onChange: (ids: string[]) => void }) => {
    const toggle = (id: string) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(sid => sid !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };
    
    const isPublic = selectedIds.length === 0;

    return (
        <div className="bg-gray-50 p-3 rounded-xl">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-500 mb-2">
                {isPublic ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{isPublic ? 'Видно всем' : 'Видно только выбранным'}</span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {members.map(m => (
                    <div key={m.id} className="flex flex-col items-center gap-1 opacity-100 transition-opacity">
                        <div className="relative">
                             <Avatar 
                                user={m} 
                                size="md" 
                                selected={selectedIds.includes(m.id)} 
                                onClick={() => toggle(m.id)} 
                             />
                             {selectedIds.includes(m.id) && (
                                 <div className="absolute -top-1 -right-1 bg-blue-500 text-white rounded-full p-0.5">
                                     <CheckCircle2 size={10} />
                                 </div>
                             )}
                        </div>
                        <span className="text-[9px] text-gray-500 truncate max-w-[50px]">{m.name}</span>
                    </div>
                ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2 leading-tight">
                Нажмите на аватарки, чтобы ограничить доступ. Если никто не выбран, видят все.
            </p>
        </div>
    );
};

export const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom-10 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const ToastContainer = ({ toasts, removeToast }: { toasts: ToastMessage[], removeToast: (id: string) => void }) => {
    return (
        <div className="fixed top-4 left-0 right-0 z-[70] flex flex-col items-center gap-2 pointer-events-none px-4">
            {toasts.map(t => (
                <div key={t.id} className="bg-black/80 text-white px-4 py-2 rounded-full shadow-lg backdrop-blur-md text-sm animate-in slide-in-from-top-2 fade-in duration-300 flex items-center gap-2 pointer-events-auto">
                     {t.type === 'SUCCESS' ? <CheckCircle2 size={16} className="text-green-400" /> : <Calendar size={16} className="text-blue-400" />}
                     {t.message}
                </div>
            ))}
        </div>
    )
};
