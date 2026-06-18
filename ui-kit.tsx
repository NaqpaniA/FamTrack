
import React from 'react';
import { 
  X, 
  CheckCircle2, 
  Eye,
  EyeOff,
  Calendar,
  Flame
} from 'lucide-react';
import { Tab, User, ToastMessage } from './types';

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export const Screen = ({ children, className = '' }: { children?: React.ReactNode, className?: string }) => (
  <main className={`app-screen max-w-2xl mx-auto space-y-5 ${className}`}>
    {children}
  </main>
);

export const Panel = ({ children, className = '', onClick }: { children?: React.ReactNode, className?: string, onClick?: () => void }) => (
  <section onClick={onClick} className={`app-panel ${className}`}>
    {children}
  </section>
);

export const SectionHeader = ({ title, action, icon: Icon }: { title: string, action?: React.ReactNode, icon?: IconComponent }) => (
  <div className="flex items-center justify-between gap-3">
    <h2 className="text-[17px] leading-tight font-bold text-gray-950 flex items-center gap-2">
      {Icon && <Icon size={18} />}
      {title}
    </h2>
    {action}
  </div>
);

export const SegmentedControl = <T extends string>({
  value,
  options,
  onChange,
  className = ''
}: {
  value: T,
  options: Array<{ value: T, label?: string, icon?: IconComponent }>,
  onChange: (value: T) => void,
  className?: string
}) => (
  <div className={`inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200/70 ${className}`}>
    {options.map(option => {
      const Icon = option.icon;
      const active = option.value === value;
      return (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-9 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${active ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
          aria-pressed={active}
        >
          {Icon && <Icon size={17} strokeWidth={active ? 2.5 : 2} />}
          {option.label && <span>{option.label}</span>}
        </button>
      );
    })}
  </div>
);

export const FloatingActionButton = ({ onClick, icon: Icon, label }: { onClick: () => void, icon: IconComponent, label: string }) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={label}
    className="fixed right-4 z-40 w-12 h-12 rounded-2xl bg-black text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
    style={{ bottom: 'calc(var(--bottom-nav-height) + 14px + env(safe-area-inset-bottom))' }}
  >
    <Icon size={22} />
  </button>
);

export const BottomNav = ({
  activeTab,
  items,
  onNavigate
}: {
  activeTab: Tab,
  items: Array<{ id: Tab, label: string, icon: IconComponent }>,
  onNavigate: (tab: Tab) => void
}) => (
  <nav className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-200/80 shadow-[0_-6px_24px_rgba(15,23,42,0.06)] safe-bottom">
    <div className="h-16 max-w-2xl mx-auto grid grid-cols-5">
      {items.map(item => {
        const active = item.id === activeTab;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${active ? 'text-black' : 'text-gray-400'}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={23} strokeWidth={active ? 2.6 : 2} />
            <span className="text-[10px] leading-none font-bold">{item.label}</span>
          </button>
        );
      })}
    </div>
  </nav>
);

export const Card = ({ children, className = '', onClick }: { children?: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`app-panel p-4 ${className}`}>
    {children}
  </div>
);

export const Avatar = ({ user, size = 'sm', selected = false, onClick }: { key?: React.Key, user?: User, size?: 'sm' | 'md' | 'lg' | 'xl', selected?: boolean, onClick?: () => void }) => {
  const sizes = { sm: 'w-7 h-7 text-xs', md: 'w-9 h-9 text-base', lg: 'w-12 h-12 text-xl', xl: 'w-16 h-16 text-3xl' };
  return (
    <div 
      onClick={onClick}
      className={`${sizes[size]} rounded-full flex items-center justify-center bg-gray-100 border transition-all cursor-pointer ${selected ? 'border-blue-500 ring-2 ring-blue-100 scale-105' : 'border-white'}`}
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
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl p-4 max-h-[88svh] overflow-y-auto animate-in slide-in-from-bottom-10 duration-300 shadow-2xl" onClick={e => e.stopPropagation()}>
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

export const StreakModal = ({ isOpen, onClose, streak, xp }: { isOpen: boolean, onClose: () => void, streak: number, xp: number }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-300" onClick={onClose}>
             <div className="bg-white w-full max-w-xs rounded-3xl p-6 text-center relative shadow-2xl animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
                 <div className="absolute -top-10 left-1/2 transform -translate-x-1/2">
                     <div className="bg-orange-500 text-white p-6 rounded-full shadow-lg border-4 border-white">
                         <Flame size={40} fill="currentColor" className="animate-pulse" />
                     </div>
                 </div>
                 
                 <div className="mt-8">
                     <h2 className="text-2xl font-black text-gray-900 mb-2">День {streak}!</h2>
                     <p className="text-gray-500 text-sm mb-6">
                         Огонь! Ты заходишь в приложение {streak} дн. подряд. Так держать!
                     </p>
                     
                     <div className="bg-yellow-50 text-yellow-700 font-bold p-3 rounded-xl mb-6 border border-yellow-100">
                         +{xp} XP
                     </div>

                     <button 
                        onClick={onClose} 
                        className="w-full bg-black text-white py-3 rounded-xl font-bold shadow-lg active:scale-95 transition-transform"
                    >
                        Круто!
                     </button>
                 </div>
             </div>
             {/* Confetti CSS effects could be added here */}
        </div>
    )
}

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
