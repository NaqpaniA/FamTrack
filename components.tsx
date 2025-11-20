
import React, { useEffect } from 'react';
import { 
  X, 
  CheckCircle2, 
  Circle, 
  Flag, 
  ListPlus, 
  Bell, 
  Trophy, 
  AlertTriangle,
  Eye,
  EyeOff,
  Calendar,
  Clock
} from 'lucide-react';
import { User, Task, Epic, TaskStatus, Transaction, ToastMessage } from './types';
import { PRIORITIES, CATEGORIES } from './constants';
import { formatMoney, isOverdue, isToday } from './utils';

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

export const TaskItem: React.FC<{ task: Task, assignee?: User, epic?: Epic, onClick: (task: Task) => void, onStatusChange?: (status: TaskStatus) => void }> = ({ task, assignee, epic, onClick, onStatusChange }) => {
  const completedSub = task.subtasks.filter(s => s.isCompleted).length;
  const totalSub = task.subtasks.length;
  const priorityConfig = PRIORITIES[task.priority] || PRIORITIES.LOW;
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';
  const today = isToday(task.dueDate) && task.status !== 'DONE';

  const handleCheck = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onStatusChange) {
          const nextStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
          onStatusChange(nextStatus);
      }
  };

  return (
    <div className={`flex items-start gap-3 py-3 border-b border-gray-50 last:border-0 animate-in fade-in duration-300 ${task.status === 'DONE' ? 'opacity-60' : ''}`}>
      <button 
        onClick={handleCheck}
        className={`mt-1 transition-colors active:scale-90 transform ${task.status === 'DONE' ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'}`}
      >
        {task.status === 'DONE' ? <CheckCircle2 size={24} className="fill-green-50" /> : <Circle size={24} />}
      </button>
      <div className="flex-1 cursor-pointer select-none" onClick={() => onClick(task)}>
        <div className="flex items-center gap-2 mb-1">
           {epic && (
               <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase tracking-wide">
                   {epic.title}
               </span>
           )}
           <Flag size={12} className={priorityConfig.iconColor} />
           {task.visibleTo && task.visibleTo.length > 0 && <EyeOff size={10} className="text-gray-400" />}
           {task.isRecurring && <Clock size={10} className="text-blue-400" />}
        </div>

        <div className={`font-medium text-[15px] transition-all ${task.status === 'DONE' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {task.title}
        </div>
        
        <div className="flex flex-wrap gap-2 mt-1.5">
            {totalSub > 0 && (
                <div className="text-[10px] text-gray-400 flex items-center gap-1 bg-gray-50 px-1.5 rounded">
                    <ListPlus size={12} /> {completedSub}/{totalSub}
                </div>
            )}
            
            {task.dueDate && task.status !== 'DONE' && (
                <div className={`text-[10px] flex items-center gap-1 px-1.5 rounded ${overdue ? 'bg-red-50 text-red-500' : today ? 'bg-orange-50 text-orange-500' : 'bg-gray-50 text-gray-400'}`}>
                    <Calendar size={10} />
                    {overdue ? 'Просрочено' : today ? 'Сегодня' : new Date(task.dueDate).toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'})}
                </div>
            )}

            {task.reminderTime && task.status !== 'DONE' && (
                <div className="flex items-center gap-1 text-[10px] text-blue-500 bg-blue-50 px-1.5 rounded">
                    <Bell size={10} />
                    {new Date(task.reminderTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
            )}
        </div>

        <div className="flex items-center gap-2 mt-2">
          {assignee && (
            <div className="flex items-center gap-1 bg-gray-50 pr-2 rounded-full border border-gray-100">
                <Avatar user={assignee} size="sm" />
                <span className="text-[10px] font-medium text-gray-600">{assignee.name}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const KanbanCard: React.FC<{ task: Task, assignee?: User, epic?: Epic, onClick: () => void }> = ({ task, assignee, epic, onClick }) => {
    const priorityConfig = PRIORITIES[task.priority];
    const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';

    return (
        <div onClick={onClick} className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 mb-2 active:scale-95 transition-transform">
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-1">
                    {epic ? (
                        <span className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase">
                            {epic.title}
                        </span>
                    ) : <span></span>}
                    {task.isRecurring && <Clock size={10} className="text-blue-400" />}
                </div>
                <div className={`w-2 h-2 rounded-full ${priorityConfig.iconColor.replace('text', 'bg')}`} />
            </div>
            <div className="font-medium text-sm text-gray-800 mb-2 line-clamp-2">{task.title}</div>
            
            {task.dueDate && (
                 <div className={`text-[10px] mb-2 flex items-center gap-1 ${overdue ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                    <Calendar size={10} />
                    {new Date(task.dueDate).toLocaleDateString('ru-RU')}
                 </div>
            )}

            <div className="flex items-center justify-between">
                 {assignee ? <Avatar user={assignee} size="sm" /> : <div />}
                 <span className="text-[10px] font-bold text-yellow-600 flex items-center gap-0.5">
                    <Trophy size={10} /> {task.points}
                 </span>
            </div>
        </div>
    )
}

export const TransactionItem = ({ transaction, user }: { transaction: Transaction, user?: User }) => {
  const isExpense = transaction.type === 'EXPENSE';
  const category = CATEGORIES[transaction.categoryId] || CATEGORIES.other;
  
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${category.color} relative`}>
          {category.icon}
          {transaction.deviationReason && (
             <div className="absolute -bottom-1 -right-1 bg-red-500 text-white rounded-full p-0.5 border border-white">
                <AlertTriangle size={10} />
             </div>
          )}
        </div>
        <div>
          <div className="font-medium text-gray-800">{transaction.title || category.label}</div>
          <div className="text-xs text-gray-400 flex items-center gap-1">
             {user && <span className="bg-gray-100 px-1 rounded text-[10px]">{user.name}</span>}
             {transaction.deviationReason && <span className="text-red-400 truncate max-w-[100px]">{transaction.deviationReason}</span>}
          </div>
        </div>
      </div>
      <div className={`font-semibold ${isExpense ? 'text-gray-900' : 'text-green-600'}`}>
        {isExpense ? '-' : '+'}{formatMoney(transaction.amount)}
      </div>
    </div>
  );
};
