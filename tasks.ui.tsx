
import React, { useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  Flag, 
  ListPlus, 
  Bell, 
  Trophy,
  EyeOff,
  Calendar,
  Clock,
  Repeat,
  Trash2,
  Plus,
  X as XIcon,
  List as ListIcon,
  Kanban
} from 'lucide-react';
import { Task, Epic, SubTask, Priority, TaskStatus, PRIORITIES, isOverdue, isToday } from './tasks.model';
import { User, AppData } from './types'; // AppData needed for Screen props
import { Avatar, VisibilitySelector } from './ui-kit';
import { formatMoney, isVisible } from './utils'; // Generic utils
import { FinancialGoal } from './finance.model';

// --- Components ---

export const TaskItem: React.FC<{ key?: React.Key, task: Task, assignee?: User, epic?: Epic, onClick: (task: Task) => void, onStatusChange?: (status: TaskStatus) => void }> = ({ task, assignee, epic, onClick, onStatusChange }) => {
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

export const KanbanCard: React.FC<{ key?: React.Key, task: Task, assignee?: User, epic?: Epic, onClick: () => void }> = ({ task, assignee, epic, onClick }) => {
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

// --- Editors ---

export const TaskEditor = ({ task, onSave, onDelete, members, epics, currentUser }: { key?: React.Key, task: Task | null, onSave: (t: Task) => void, onDelete: (id: string) => void, members: User[], epics: Epic[], currentUser: User }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'MEDIUM');
  const [points, setPoints] = useState(task?.points || 50);
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || currentUser.id);
  const [epicId, setEpicId] = useState(task?.epicId || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || new Date().toISOString().split('T')[0]);
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring || false);
  const [frequency, setFrequency] = useState(task?.frequency || 'WEEKLY');
  const [subtasks, setSubtasks] = useState<SubTask[]>(task?.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [visibleTo, setVisibleTo] = useState<string[]>(task?.visibleTo || []);

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: Math.random().toString(), title: newSubtask, isCompleted: false }]);
    setNewSubtask('');
  };

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({
      id: task?.id || Math.random().toString(36).substr(2, 9),
      title,
      description,
      priority,
      points,
      assigneeId,
      createdById: task?.createdById || currentUser.id,
      epicId: epicId || undefined,
      status: task?.status || 'TODO',
      subtasks,
      createdAt: task?.createdAt || Date.now(),
      dueDate,
      isRecurring,
      frequency: isRecurring ? frequency : undefined,
      visibleTo
    });
  };

  return (
    <div className="space-y-4 pb-20">
      <input 
        className="w-full text-xl font-bold placeholder-gray-300 outline-none border-none bg-transparent" 
        placeholder="Что нужно сделать?" 
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {Object.entries(PRIORITIES).map(([key, val]) => (
              <button 
                key={key}
                onClick={() => setPriority(key as Priority)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border ${priority === key ? val.color + ' border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                  <Flag size={12} className={priority === key ? 'fill-current' : ''} /> {val.label}
              </button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-1" />
          <div className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full border border-yellow-200">
             <span className="text-xs font-bold">XP</span>
             <input 
                type="number" 
                value={points} 
                onChange={e => setPoints(Number(e.target.value))} 
                className="w-10 bg-transparent text-center font-bold outline-none text-xs" 
             />
          </div>
      </div>

      <div className="space-y-3">
           <div>
              <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Исполнитель</label>
              <div className="flex gap-2">
                  {members.map(m => (
                      <Avatar 
                        key={m.id} 
                        user={m} 
                        selected={assigneeId === m.id} 
                        onClick={() => setAssigneeId(m.id)} 
                      />
                  ))}
              </div>
           </div>

           <div className="grid grid-cols-2 gap-3">
               <div>
                   <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Срок</label>
                   <div className="relative">
                       <input 
                            type="date" 
                            value={dueDate} 
                            onChange={e => setDueDate(e.target.value)}
                            className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200" 
                       />
                   </div>
               </div>
               <div>
                   <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Проект</label>
                   <select 
                        value={epicId} 
                        onChange={e => setEpicId(e.target.value)}
                        className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200"
                    >
                       <option value="">Без проекта</option>
                       {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                   </select>
               </div>
           </div>

           <div className="bg-gray-50 p-3 rounded-xl flex items-center justify-between">
               <div className="flex items-center gap-2">
                   <Repeat size={16} className={isRecurring ? "text-blue-500" : "text-gray-400"} />
                   <span className="text-sm font-medium text-gray-700">Повторять</span>
               </div>
               <div className="flex items-center gap-2">
                   {isRecurring && (
                       <select 
                            value={frequency} 
                            onChange={e => setFrequency(e.target.value as any)}
                            className="bg-white border border-gray-200 text-xs rounded px-2 py-1 outline-none"
                        >
                           <option value="DAILY">Каждый день</option>
                           <option value="WEEKLY">Раз в неделю</option>
                           <option value="MONTHLY">Раз в месяц</option>
                       </select>
                   )}
                   <button 
                        onClick={() => setIsRecurring(!isRecurring)} 
                        className={`w-10 h-5 rounded-full relative transition-colors ${isRecurring ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                       <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isRecurring ? 'translate-x-5' : ''}`} />
                   </button>
               </div>
           </div>

           <div>
              <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Описание</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Добавить детали..."
                className="w-full bg-gray-50 rounded-lg p-3 text-sm outline-none min-h-[80px] border border-gray-100 focus:border-blue-200"
              />
           </div>

           <div>
               <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Подзадачи</label>
               <div className="space-y-2 mb-2">
                   {subtasks.map((st, idx) => (
                       <div key={st.id} className="flex items-center gap-2 group">
                           <button 
                                onClick={() => {
                                    const newSt = [...subtasks];
                                    newSt[idx].isCompleted = !newSt[idx].isCompleted;
                                    setSubtasks(newSt);
                                }}
                                className={st.isCompleted ? 'text-green-500' : 'text-gray-300'}
                            >
                               {st.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                           </button>
                           <input 
                                value={st.title} 
                                onChange={e => {
                                    const newSt = [...subtasks];
                                    newSt[idx].title = e.target.value;
                                    setSubtasks(newSt);
                                }}
                                className={`flex-1 bg-transparent outline-none text-sm ${st.isCompleted ? 'line-through text-gray-400' : ''}`} 
                           />
                           <button onClick={() => setSubtasks(subtasks.filter((_, i) => i !== idx))} className="text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-400">
                               <XIcon size={14} />
                           </button>
                       </div>
                   ))}
               </div>
               <div className="flex items-center gap-2 text-gray-400">
                   <Plus size={18} />
                   <input 
                        value={newSubtask}
                        onChange={e => setNewSubtask(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                        placeholder="Добавить пункт..."
                        className="bg-transparent outline-none text-sm flex-1"
                   />
               </div>
           </div>

           <VisibilitySelector members={members} selectedIds={visibleTo} onChange={setVisibleTo} />
      </div>
      
      <div className="pt-4 flex gap-3">
          {task && (
              <button onClick={() => onDelete(task.id)} className="p-3 rounded-xl bg-red-50 text-red-500">
                  <Trash2 size={20} />
              </button>
          )}
          <button onClick={handleSave} className="flex-1 bg-black text-white rounded-xl py-3 font-bold shadow-lg active:scale-95 transition-transform">
              Сохранить
          </button>
      </div>
    </div>
  );
};

export const EpicEditor = ({ onSave, members, goals = [], initialData }: { key?: React.Key, onSave: (epic: Epic) => void, members: User[], goals?: FinancialGoal[], initialData?: Partial<Epic> }) => {
    const [title, setTitle] = useState(initialData?.title || '');
    const [priority, setPriority] = useState<Priority>(initialData?.priority || 'MEDIUM');
    const [color, setColor] = useState(initialData?.color || 'bg-blue-500');
    const [goalId, setGoalId] = useState(initialData?.goalId || '');
    const [visibleTo, setVisibleTo] = useState<string[]>(initialData?.visibleTo || []);

    const colors = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-indigo-500', 'bg-teal-500'];

    return (
        <div className="space-y-4">
            <input 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                placeholder="Название проекта"
                className="w-full bg-gray-50 rounded-xl p-3 outline-none font-bold text-lg"
            />

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Цвет</label>
                <div className="flex flex-wrap gap-2">
                    {colors.map(c => (
                        <button 
                            key={c}
                            onClick={() => setColor(c)}
                            className={`w-8 h-8 rounded-full ${c} ${color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                        />
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Приоритет</label>
                <div className="flex gap-2">
                    {Object.entries(PRIORITIES).map(([k, v]) => (
                        <button 
                            key={k}
                            onClick={() => setPriority(k as Priority)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${priority === k ? v.color + ' border-transparent' : 'bg-white border-gray-200 text-gray-500'}`}
                        >
                            {v.label}
                        </button>
                    ))}
                </div>
            </div>

            <div>
                <label className="text-xs font-bold text-gray-400 uppercase mb-2 block">Финансовая цель</label>
                <select 
                    value={goalId} 
                    onChange={e => setGoalId(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none"
                >
                    <option value="">Без цели</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title} ({formatMoney(g.targetAmount)})</option>)}
                </select>
            </div>

            <VisibilitySelector members={members} selectedIds={visibleTo} onChange={setVisibleTo} />

            <button 
                onClick={() => onSave({
                    id: Math.random().toString(36).substr(2,9),
                    title,
                    priority,
                    color,
                    goalId: goalId || undefined,
                    isCompleted: false,
                    visibleTo
                })}
                disabled={!title}
                className="w-full bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50"
            >
                Создать Эпик
            </button>
        </div>
    )
}

// --- Screens ---

export const TasksScreen = ({ 
    data, 
    onTaskClick, 
    onAddTask,
    onStatusChange,
    activeFilterEpicId
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onAddTask: () => void,
    onStatusChange: (id: string, status: TaskStatus) => void,
    activeFilterEpicId?: string
}) => {
    const [view, setView] = useState<'LIST' | 'KANBAN'>('LIST');
    
    let tasks = data.tasks.filter(t => isVisible(t, data.currentUser.id));
    if (activeFilterEpicId) {
        tasks = tasks.filter(t => t.epicId === activeFilterEpicId);
    }

    const activeEpic = activeFilterEpicId ? data.epics.find(e => e.id === activeFilterEpicId) : null;

    return (
        <div className="p-4 pb-24 min-h-screen flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold">{activeEpic ? activeEpic.title : 'Задачи'}</h1>
                    <p className="text-gray-500 text-sm">{tasks.length} всего</p>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button onClick={() => setView('LIST')} className={`p-2 rounded-lg transition-all ${view === 'LIST' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>
                        <ListIcon size={20} />
                    </button>
                    <button onClick={() => setView('KANBAN')} className={`p-2 rounded-lg transition-all ${view === 'KANBAN' ? 'bg-white shadow text-black' : 'text-gray-400'}`}>
                        <Kanban size={20} />
                    </button>
                </div>
            </div>

            <div className="flex-1">
                {view === 'LIST' ? (
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        {tasks.length === 0 ? (
                            <div className="p-10 text-center text-gray-400">
                                <p>Нет задач</p>
                            </div>
                        ) : (
                            tasks.sort((a,b) => (b.dueDate ? 1 : 0) - (a.dueDate ? 1 : 0)).map(task => (
                                <div key={task.id} className="px-4">
                                    <TaskItem 
                                        task={task}
                                        assignee={data.members.find(m => m.id === task.assigneeId)}
                                        epic={data.epics.find(e => e.id === task.epicId)}
                                        onClick={onTaskClick}
                                        onStatusChange={(s) => onStatusChange(task.id, s)}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                ) : (
                    <div className="flex gap-4 overflow-x-auto pb-4 h-full no-scrollbar">
                        {(['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map(status => (
                            <div key={status} className="min-w-[280px] flex-1 bg-gray-50 rounded-2xl p-3">
                                <div className="flex items-center gap-2 mb-3 text-sm font-bold text-gray-500 uppercase tracking-wider">
                                    <div className={`w-2 h-2 rounded-full ${status === 'TODO' ? 'bg-gray-400' : status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                    {status === 'TODO' ? 'Надо сделать' : status === 'IN_PROGRESS' ? 'В процессе' : 'Готово'}
                                </div>
                                <div className="space-y-2">
                                    {tasks.filter(t => t.status === status).map(task => (
                                        <KanbanCard 
                                            key={task.id}
                                            task={task}
                                            assignee={data.members.find(m => m.id === task.assigneeId)}
                                            epic={data.epics.find(e => e.id === task.epicId)}
                                            onClick={() => onTaskClick(task)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button 
                onClick={onAddTask}
                className="fixed bottom-24 right-4 w-14 h-14 bg-black text-white rounded-full shadow-xl flex items-center justify-center active:scale-90 transition-transform z-40"
            >
                <Plus size={24} />
            </button>
        </div>
    )
}
