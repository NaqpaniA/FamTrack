
import React from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Flag, 
  ListPlus, 
  Bell, 
  Trophy, 
  AlertTriangle,
  EyeOff,
  Calendar,
  Clock
} from 'lucide-react';
import { User, Task, Epic, TaskStatus, Transaction } from './types';
import { PRIORITIES, CATEGORIES } from './constants';
import { formatMoney, isOverdue, isToday } from './utils';
import { Avatar } from './ui-kit';

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
