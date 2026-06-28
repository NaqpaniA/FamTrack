
import React, { useRef, useState } from 'react';
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
  Pencil,
  X as XIcon,
  List as ListIcon,
  Kanban,
  Sparkles
} from 'lucide-react';
import { Task, Epic, SubTask, Priority, TaskStatus, PRIORITIES, isOverdue, isToday } from './tasks.model';
import { User, AppData } from './types'; // AppData needed for Screen props
import { Avatar, FloatingActionButton, Panel, Screen, SegmentedControl, VisibilitySelector } from './ui-kit';
import { formatMoney, isVisible } from './utils'; // Generic utils
import { FinancialGoal } from './finance.model';
import { api } from './api';

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
    <div className={`flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0 animate-in fade-in duration-300 ${task.status === 'DONE' ? 'opacity-60' : ''}`}>
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

        <div className={`font-medium text-[14px] transition-all ${task.status === 'DONE' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
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

export const KanbanCard: React.FC<{
    key?: React.Key,
    task: Task,
    assignee?: User,
    epic?: Epic,
    onClick: () => void,
    onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void,
    onPointerMove?: (event: React.PointerEvent<HTMLDivElement>) => void,
    onPointerUp?: (event: React.PointerEvent<HTMLDivElement>) => void,
    onPointerCancel?: (event: React.PointerEvent<HTMLDivElement>) => void,
    isDragging?: boolean
}> = ({ task, assignee, epic, onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, isDragging }) => {
    const priorityConfig = PRIORITIES[task.priority];
    const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';

    return (
        <div
            data-kanban-task={task.id}
            role="button"
            tabIndex={0}
            onClick={onClick}
            onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onClick();
                }
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            className={`touch-none select-none bg-white p-2.5 rounded-[12px] shadow-sm border mb-2 active:scale-95 transition-transform ${isDragging ? 'opacity-60 border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}
        >
            <div className="flex justify-between items-start gap-2 mb-2">
                <div className="flex items-center gap-1 min-w-0">
                    {epic ? (
                        <span className="text-[9px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase truncate max-w-full">
                            {epic.title}
                        </span>
                    ) : <span></span>}
                    {task.isRecurring && <Clock size={10} className="text-blue-400" />}
                </div>
                <div className={`w-2 h-2 rounded-full shrink-0 ${priorityConfig.iconColor.replace('text', 'bg')}`} />
            </div>
            <div className="font-medium text-[13px] leading-snug text-gray-800 mb-2 line-clamp-3 break-words">{task.title}</div>
            
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
  const [isBreakingDown, setBreakingDown] = useState(false);

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
      sortOrder: task?.sortOrder,
      dueDate,
      isRecurring,
      frequency: isRecurring ? frequency : undefined,
      visibleTo
    });
  };

  const handleBreakdown = async () => {
    if (!title.trim() || isBreakingDown) return;
    setBreakingDown(true);
    try {
        const response = await api.breakdownTask({ title, description });
        const existingTitles = new Set(subtasks.map(item => item.title.trim().toLowerCase()));
        const next = response.result.subtasks
            .filter(item => !existingTitles.has(item.title.trim().toLowerCase()))
            .map(item => ({ ...item, id: item.id || Math.random().toString(36).slice(2) }));
        setSubtasks([...subtasks, ...next]);
    } catch (error) {
        alert(error instanceof Error ? error.message : 'Не удалось разбить задачу');
    } finally {
        setBreakingDown(false);
    }
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
               <div className="flex items-center justify-between gap-2 mb-1">
                   <label className="text-xs font-bold text-gray-400 uppercase block">Подзадачи</label>
                   <button
                        onClick={handleBreakdown}
                        disabled={!title.trim() || isBreakingDown}
                        className="h-8 px-2.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                   >
                       <Sparkles size={13} />
                       {isBreakingDown ? 'Думаю' : 'Разбить'}
                   </button>
               </div>
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

export const EpicEditor = ({ onSave, onDelete, members, goals = [], initialData }: { key?: React.Key, onSave: (epic: Epic) => void, onDelete?: (id: string) => void, members: User[], goals?: FinancialGoal[], initialData?: Partial<Epic> }) => {
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

            <div className="pt-2 space-y-2">
                {initialData?.id && onDelete && (
                    <button
                        onClick={() => onDelete(initialData.id!)}
                        className="w-full h-12 rounded-xl bg-red-50 text-red-600 font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                        aria-label="Удалить проект"
                        title="Удалить проект"
                    >
                        <Trash2 size={18} />
                        Удалить проект
                    </button>
                )}
                <button 
                    onClick={() => onSave({
                        id: initialData?.id || Math.random().toString(36).substr(2,9),
                        title,
                        priority,
                        color,
                        goalId: goalId || undefined,
                        isCompleted: initialData?.isCompleted || false,
                        createdById: initialData?.createdById,
                        visibleTo
                    })}
                    disabled={!title}
                    className="w-full bg-black text-white rounded-xl py-3 font-bold disabled:opacity-50"
                >
                    {initialData?.id ? 'Сохранить' : 'Создать проект'}
                </button>
            </div>
        </div>
    )
}

// --- Screens ---

export const TasksScreen = ({ 
    data, 
    onTaskClick, 
    onAddTask,
    onStatusChange,
    onMoveTask,
    onAddEpic,
    onEditEpic,
    onEpicFilterChange,
    activeFilterEpicId
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onAddTask: () => void,
    onStatusChange: (id: string, status: TaskStatus) => void,
    onMoveTask: (id: string, status: TaskStatus, beforeTaskId?: string) => void,
    onAddEpic: () => void,
    onEditEpic: (epic: Epic) => void,
    onEpicFilterChange: (epicId?: string) => void,
    activeFilterEpicId?: string
}) => {
    const [view, setView] = useState<'LIST' | 'KANBAN'>('KANBAN');
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const dragStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    
    const visibleEpics = data.epics.filter(e => isVisible(e, data.currentUser));
    const visibleTasks = data.tasks.filter(t => isVisible(t, data.currentUser));
    let tasks = visibleTasks;
    if (activeFilterEpicId) {
        tasks = tasks.filter(t => t.epicId === activeFilterEpicId);
    }

    const activeEpic = activeFilterEpicId ? visibleEpics.find(e => e.id === activeFilterEpicId) : null;
    const orderedTasks = (status: TaskStatus) => tasks
        .filter(t => t.status === status)
        .sort((left, right) => (left.sortOrder ?? left.createdAt) - (right.sortOrder ?? right.createdAt));

    const beginDrag = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
        dragStart.current = { id, x: event.clientX, y: event.clientY, moved: false };
        try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
            // Some synthetic/WebView pointer events are not capturable.
        }
    };

    const updateDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!dragStart.current) return;
        const distance = Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y);
        if (distance > 8) {
            dragStart.current.moved = true;
            setDraggingId(dragStart.current.id);
        }
    };

    const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        const state = dragStart.current;
        dragStart.current = null;
        setDraggingId(null);
        try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture may be absent if the WebView did not grant it.
        }
        if (!state?.moved) return;

        suppressClick.current = true;
        window.setTimeout(() => {
            suppressClick.current = false;
        }, 0);

        const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        const column = target?.closest('[data-kanban-column]') as HTMLElement | null;
        const targetStatus = column?.dataset.kanbanColumn as TaskStatus | undefined;
        if (!targetStatus) return;
        const targetCard = target?.closest('[data-kanban-task]') as HTMLElement | null;
        const beforeTaskId = targetCard?.dataset.kanbanTask;
        onMoveTask(state.id, targetStatus, beforeTaskId && beforeTaskId !== state.id ? beforeTaskId : undefined);
    };

    const cancelDrag = (event: React.PointerEvent<HTMLDivElement>) => {
        dragStart.current = null;
        setDraggingId(null);
        try {
            event.currentTarget.releasePointerCapture?.(event.pointerId);
        } catch {
            // Pointer capture may be absent if the drag was cancelled early.
        }
    };

    return (
        <Screen className="flex flex-col">
            <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-[24px] leading-tight font-bold truncate">{activeEpic ? activeEpic.title : 'Задачи'}</h1>
                        <p className="text-gray-500 text-[13px]">{tasks.length} всего</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <SegmentedControl
                            value={view}
                            onChange={setView}
                            options={[
                                { value: 'LIST', icon: ListIcon },
                                { value: 'KANBAN', icon: Kanban }
                            ]}
                        />
                    </div>
                </div>

                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1" role="tablist" aria-label="Проекты">
                    <button
                        type="button"
                        onClick={() => onEpicFilterChange(undefined)}
                        className={`h-9 shrink-0 rounded-full border px-3 text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform ${!activeFilterEpicId ? 'bg-black text-white border-black shadow-sm' : 'bg-white text-gray-600 border-gray-200'}`}
                        aria-pressed={!activeFilterEpicId}
                    >
                        Все
                        <span className={`min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] ${!activeFilterEpicId ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                            {visibleTasks.length}
                        </span>
                    </button>
                    {visibleEpics.map(epic => {
                        const isActive = activeFilterEpicId === epic.id;
                        const count = visibleTasks.filter(task => task.epicId === epic.id).length;
                        return (
                            <button
                                key={epic.id}
                                type="button"
                                onClick={() => onEpicFilterChange(epic.id)}
                                className={`h-9 max-w-[220px] shrink-0 rounded-full border pl-2.5 pr-2 text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform ${isActive ? 'bg-gray-950 text-white border-gray-950 shadow-sm' : 'bg-white text-gray-700 border-gray-200'}`}
                                aria-pressed={isActive}
                            >
                                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${epic.color}`} />
                                <span className="truncate">{epic.title}</span>
                                <span className={`min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                    {activeEpic && (
                        <button
                            type="button"
                            onClick={() => onEditEpic(activeEpic)}
                            className="h-9 shrink-0 rounded-full bg-gray-50 border border-gray-200 text-gray-700 px-3 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                            aria-label="Редактировать проект"
                            title="Редактировать проект"
                        >
                            <Pencil size={15} />
                            <span className="text-xs font-bold">Править</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onAddEpic}
                        className="h-9 shrink-0 rounded-full bg-blue-50 text-blue-600 border border-blue-100 px-3 flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                        aria-label="Создать проект"
                        title="Создать проект"
                    >
                        <Plus size={15} />
                        <span className="text-xs font-bold">Проект</span>
                    </button>
                </div>
            </div>

            <div className="flex-1">
                {view === 'LIST' ? (
                    <Panel className="overflow-hidden mt-4">
                        {tasks.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <p>Нет задач</p>
                            </div>
                        ) : (
                            [...tasks].sort((a,b) => (b.dueDate ? 1 : 0) - (a.dueDate ? 1 : 0)).map(task => (
                                <div key={task.id} className="px-3">
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
                    </Panel>
                ) : (
                    <div className="flex gap-2 overflow-x-auto pb-4 h-full no-scrollbar snap-x-app mt-4 -mx-1 px-1">
                        {(['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map(status => (
                            <div
                                key={status}
                                data-kanban-column={status}
                                className="min-w-[calc((100vw-36px)/2)] max-w-[calc((100vw-36px)/2)] sm:min-w-[220px] sm:max-w-[240px] shrink-0 bg-gray-50 rounded-[14px] border border-gray-100 p-2 snap-start"
                            >
                                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${status === 'TODO' ? 'bg-gray-400' : status === 'IN_PROGRESS' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                    {status === 'TODO' ? 'Надо сделать' : status === 'IN_PROGRESS' ? 'В процессе' : 'Готово'}
                                </div>
                                <div className="space-y-2">
                                    {orderedTasks(status).map(task => (
                                        <KanbanCard 
                                            key={task.id}
                                            task={task}
                                            assignee={data.members.find(m => m.id === task.assigneeId)}
                                            epic={data.epics.find(e => e.id === task.epicId)}
                                            isDragging={draggingId === task.id}
                                            onPointerDown={(event) => beginDrag(event, task.id)}
                                            onPointerMove={updateDrag}
                                            onPointerUp={finishDrag}
                                            onPointerCancel={cancelDrag}
                                            onClick={() => {
                                                if (!suppressClick.current) onTaskClick(task);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <FloatingActionButton onClick={onAddTask} icon={Plus} label="Добавить задачу" />
        </Screen>
    )
}
