
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
  Sparkles,
  Loader2,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import {
  Task,
  Epic,
  SubTask,
  Priority,
  TaskDifficulty,
  TaskStatus,
  PRIORITIES,
  TASK_DIFFICULTIES,
  calculateTaskXp,
  isOverdue,
  isToday
} from './tasks.model';
import { User, AppData } from './types'; // AppData needed for Screen props
import { Avatar, FloatingActionButton, Panel, Screen, SegmentedControl, VisibilitySelector } from './ui-kit';
import { formatMoney, isVisible } from './utils'; // Generic utils
import { FinancialGoal } from './finance.model';
import { api } from './api';
import type { TaskNotificationMode } from './settings.model';
import type { TaskSaveFlowResult } from './task-save-flow';

const TASK_STATUS_META: Record<TaskStatus, { label: string; shortLabel: string; color: string }> = {
    INBOX: { label: 'Входящие', shortLabel: 'Inbox', color: 'bg-violet-500' },
    TODO: { label: 'Надо сделать', shortLabel: 'Сделать', color: 'bg-gray-400' },
    IN_PROGRESS: { label: 'В процессе', shortLabel: 'В работе', color: 'bg-blue-500' },
    BLOCKED: { label: 'Заблокировано', shortLabel: 'Блок', color: 'bg-red-500' },
    WAITING: { label: 'Ожидает', shortLabel: 'Ждём', color: 'bg-amber-500' },
    DONE: { label: 'Готово', shortLabel: 'Готово', color: 'bg-green-500' },
    DROPPED: { label: 'Отменено', shortLabel: 'Отмена', color: 'bg-slate-400' }
};
const TASK_STATUSES = Object.keys(TASK_STATUS_META) as TaskStatus[];
const NEW_TASK_STATUSES: TaskStatus[] = ['INBOX', 'TODO', 'WAITING'];
export type TaskOwnershipFilter = 'ALL' | 'MINE';

const reminderClock = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return '';
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const reminderTimestamp = (date: string, clock: string) => {
    if (!date || !clock) return undefined;
    const value = new Date(`${date}T${clock}:00`);
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
};

// --- Components ---

export const TaskItem: React.FC<{
  key?: React.Key,
  task: Task,
  assignee?: User,
  epic?: Epic,
  onClick: (task: Task) => void,
  onStatusChange?: (status: TaskStatus) => void,
  onRoutineComplete?: () => void,
  routinePending?: boolean
}> = ({ task, assignee, epic, onClick, onStatusChange, onRoutineComplete, routinePending = false }) => {
  const completedSub = task.subtasks.filter(s => s.isCompleted).length;
  const totalSub = task.subtasks.length;
  const priorityConfig = PRIORITIES[task.priority] || PRIORITIES.LOW;
  const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';
  const today = isToday(task.dueDate) && task.status !== 'DONE';
  const isRoutineTask = !!task.routineTemplateId;

  const handleCheck = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (isRoutineTask) {
          onRoutineComplete?.();
      } else if (onStatusChange) {
          const nextStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
          onStatusChange(nextStatus);
      }
  };

  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0 animate-in fade-in duration-300 ${task.status === 'DONE' ? 'opacity-60' : ''}`}>
      <button 
        type="button"
        onClick={handleCheck}
        aria-label={isRoutineTask
          ? onRoutineComplete ? `Завершить рутину «${task.title}»` : `Рутина «${task.title}» управляется на главной`
          : task.status === 'DONE' ? `Вернуть задачу «${task.title}»` : `Завершить задачу «${task.title}»`}
        title={isRoutineTask ? 'Завершить рутину' : task.status === 'DONE' ? 'Вернуть в работу' : 'Завершить'}
        disabled={(isRoutineTask && !onRoutineComplete) || routinePending}
        aria-busy={routinePending || undefined}
        className={`mt-1 transition-colors active:scale-90 transform disabled:cursor-default ${task.status === 'DONE' ? 'text-green-500' : isRoutineTask ? onRoutineComplete ? 'text-blue-500' : 'text-blue-300' : 'text-gray-300 hover:text-gray-400'}`}
      >
        {routinePending ? <Loader2 size={24} className="animate-spin text-blue-500" /> : task.status === 'DONE' ? <CheckCircle2 size={24} className="fill-green-50" /> : <Circle size={24} />}
      </button>
      <button type="button" className="flex-1 cursor-pointer select-none text-left" onClick={() => onClick(task)}>
        <div className="flex items-center gap-2 mb-1">
           {epic && (
               <span className="text-[10px] font-bold bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded uppercase tracking-wide">
                   {epic.title}
               </span>
           )}
           <Flag size={12} className={priorityConfig.iconColor} />
           {task.visibleTo && task.visibleTo.length > 0 && <EyeOff size={10} className="text-gray-400" />}
           {task.isRecurring && <Clock size={10} className="text-blue-400" />}
           {isRoutineTask && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">РУТИНА</span>}
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
            {task.estimateMinutes ? (
                <div className="flex items-center gap-1 rounded bg-gray-50 px-1.5 text-[10px] text-gray-500"><Clock size={10} />≈ {task.estimateMinutes} мин</div>
            ) : null}
            {task.dependsOnIds?.length ? (
                <div className="rounded bg-red-50 px-1.5 text-[10px] text-red-600">Зависит от {task.dependsOnIds.length}</div>
            ) : null}
        </div>

        {task.nextAction ? <p className="mt-1.5 line-clamp-2 text-xs text-gray-500"><span className="font-bold text-gray-600">Следом:</span> {task.nextAction}</p> : null}

        <div className="flex items-center gap-2 mt-2">
          {assignee && (
            <div className="flex items-center gap-1 bg-gray-50 pr-2 rounded-full border border-gray-100">
                <Avatar user={assignee} size="sm" />
                <span className="text-[10px] font-medium text-gray-600">{assignee.name}</span>
            </div>
          )}
        </div>
      </button>
    </div>
  );
};

export const KanbanCard: React.FC<{
    key?: React.Key,
    task: Task,
    assignee?: User,
    epic?: Epic,
    onClick: () => void,
    onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void,
    onPointerMove?: (event: React.PointerEvent<HTMLButtonElement>) => void,
    onPointerUp?: (event: React.PointerEvent<HTMLButtonElement>) => void,
    onPointerCancel?: (event: React.PointerEvent<HTMLButtonElement>) => void,
    onStatusMove?: (status: TaskStatus) => void,
    isDragging?: boolean,
    statusPending?: boolean
}> = ({ task, assignee, epic, onClick, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onStatusMove, isDragging, statusPending = false }) => {
    const priorityConfig = PRIORITIES[task.priority];
    const overdue = isOverdue(task.dueDate) && task.status !== 'DONE';
    const currentIndex = TASK_STATUSES.indexOf(task.status);
    const previousStatus = TASK_STATUSES[currentIndex - 1];
    const nextStatus = TASK_STATUSES[currentIndex + 1];
    const canMove = !!onStatusMove && !task.routineTemplateId;

    return (
        <div
            data-kanban-task={task.id}
            className={`mb-2 w-full select-none overflow-hidden rounded-[12px] border bg-white shadow-sm transition-opacity ${isDragging ? 'opacity-60 border-blue-300 ring-2 ring-blue-100' : 'border-gray-100'}`}
        >
            <button
                type="button"
                onClick={onClick}
                aria-label={`Открыть задачу «${task.title}»${canMove ? '. Стрелки влево и вправо меняют статус.' : ''}`}
                onKeyDown={event => {
                    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && canMove && !statusPending) {
                        const targetStatus = event.key === 'ArrowLeft' ? previousStatus : nextStatus;
                        if (targetStatus) {
                            event.preventDefault();
                            onStatusMove(targetStatus);
                        }
                    }
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                className="w-full touch-none p-2.5 text-left transition-transform active:scale-[0.98]"
            >
                <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                        {epic ? (
                            <span className="max-w-full truncate rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-gray-600">
                                {epic.title}
                            </span>
                        ) : <span></span>}
                        {task.isRecurring && <Clock size={10} className="text-blue-400" />}
                    </div>
                    <div className={`h-2 w-2 shrink-0 rounded-full ${priorityConfig.iconColor.replace('text', 'bg')}`} />
                </div>
                <div className="mb-2 line-clamp-3 break-words text-[13px] font-medium leading-snug text-gray-800">{task.title}</div>
                {task.dueDate && (
                    <div className={`mb-2 flex items-center gap-1 text-[10px] ${overdue ? 'font-bold text-red-500' : 'text-gray-400'}`}>
                        <Calendar size={10} />
                        {new Date(task.dueDate).toLocaleDateString('ru-RU')}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    {assignee ? <Avatar user={assignee} size="sm" /> : <div />}
                    <span className="flex items-center gap-0.5 text-[10px] font-bold text-yellow-600">
                        <Trophy size={10} /> {task.points}
                    </span>
                </div>
            </button>
            {canMove ? (
                <div className="flex items-center justify-between border-t border-black/5 px-1">
                    <button
                        type="button"
                        disabled={!previousStatus || statusPending}
                        onClick={() => previousStatus && onStatusMove(previousStatus)}
                        className="grid h-11 w-11 place-items-center rounded-xl text-gray-500 disabled:opacity-25"
                        aria-label={previousStatus ? `Переместить «${task.title}» в ${TASK_STATUS_META[previousStatus].label}` : `«${task.title}» уже в первой колонке`}
                    ><ArrowLeft size={18} /></button>
                    {statusPending ? <Loader2 size={16} className="animate-spin text-blue-500" aria-label="Сохраняю статус" /> : null}
                    <button
                        type="button"
                        disabled={!nextStatus || statusPending}
                        onClick={() => nextStatus && onStatusMove(nextStatus)}
                        className="grid h-11 w-11 place-items-center rounded-xl text-gray-500 disabled:opacity-25"
                        aria-label={nextStatus ? `Переместить «${task.title}» в ${TASK_STATUS_META[nextStatus].label}` : `«${task.title}» уже в последней колонке`}
                    ><ArrowRight size={18} /></button>
                </div>
            ) : null}
        </div>
    )
}

// --- Editors ---

export const TaskEditor = ({ task, onSave, onDelete, onRoutineComplete, routinePending = false, members, epics, availableTasks, currentUser }: { key?: React.Key, task: Task | null, onSave: (t: Task) => void | TaskSaveFlowResult | Promise<void | TaskSaveFlowResult>, onDelete: (id: string) => void, onRoutineComplete?: (routineId: string, taskId: string) => void, routinePending?: boolean, members: User[], epics: Epic[], availableTasks: Task[], currentUser: User }) => {
  const [title, setTitle] = useState(task?.title || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<Priority>(task?.priority || 'MEDIUM');
  const [difficulty, setDifficulty] = useState<TaskDifficulty>(task?.difficulty || 'MEDIUM');
  const points = calculateTaskXp(difficulty, priority);
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId || currentUser.id);
  const [epicId, setEpicId] = useState(task?.epicId || '');
  const [dueDate, setDueDate] = useState(task?.dueDate || '');
  const [reminderTime, setReminderTime] = useState(reminderClock(task?.reminderTime));
  const [isRecurring, setIsRecurring] = useState(task?.isRecurring || false);
  const [frequency, setFrequency] = useState(task?.frequency || 'WEEKLY');
  const [subtasks, setSubtasks] = useState<SubTask[]>(task?.subtasks || []);
  const [newSubtask, setNewSubtask] = useState('');
  const [visibleTo, setVisibleTo] = useState<string[]>(task?.visibleTo || []);
  const [notificationMode, setNotificationMode] = useState<TaskNotificationMode>(task?.notificationMode || 'INHERIT');
  const [isBreakingDown, setBreakingDown] = useState(false);
  const [status, setStatus] = useState<TaskStatus>(task?.status || 'INBOX');
  const [nextAction, setNextAction] = useState(task?.nextAction || '');
  const [estimateMinutes, setEstimateMinutes] = useState(task?.estimateMinutes ? String(task.estimateMinutes) : '');
  const [dependsOnIds, setDependsOnIds] = useState<string[]>(task?.dependsOnIds || []);
  const [isSaving, setSaving] = useState(false);
  const isRoutineTask = !!task?.routineTemplateId;

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, { id: Math.random().toString(), title: newSubtask, isCompleted: false }]);
    setNewSubtask('');
  };

  const handleSave = async () => {
    if (!title.trim() || isSaving) return;
    setSaving(true);
    const result = await onSave({
      id: task?.id || Math.random().toString(36).substr(2, 9),
      title,
      description,
      priority,
      difficulty,
      points,
      assigneeId,
      createdById: task?.createdById || currentUser.id,
      epicId: epicId || undefined,
      status,
      subtasks,
      createdAt: task?.createdAt || Date.now(),
      sortOrder: task?.sortOrder,
      dueDate,
      reminderTime: reminderTimestamp(dueDate, reminderTime),
      isRecurring,
      frequency: isRecurring ? frequency : undefined,
      visibleTo,
      notificationMode,
      capturedAt: task?.capturedAt || Date.now(),
      nextAction: nextAction.trim() || undefined,
      estimateMinutes: estimateMinutes ? Number(estimateMinutes) : undefined,
      dependsOnIds
    });
    if (result && result.kind === 'status-failed') setStatus(result.confirmedStatus);
    setSaving(false);
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
      {isRoutineTask ? (
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              Это экземпляр рутины. Его можно выполнить здесь; расписание и пропуск появятся в блоке «Рутины сегодня» после включения следующего этапа.
          </div>
      ) : null}
      <input 
        aria-label="Название задачи"
        className="w-full text-xl font-bold placeholder-gray-300 outline-none border-none bg-transparent" 
        placeholder="Что нужно сделать?" 
        value={title}
        onChange={e => setTitle(e.target.value)}
        autoFocus
      />

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {Object.entries(PRIORITIES).map(([key, val]) => (
              <button 
                type="button"
                key={key}
                onClick={() => setPriority(key as Priority)}
                aria-pressed={priority === key}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1 border ${priority === key ? val.color + ' border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
              >
                  <Flag size={12} className={priority === key ? 'fill-current' : ''} /> {val.label}
              </button>
          ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <label className="text-xs font-bold text-gray-400 uppercase">Сложность</label>
          <span className="flex items-center gap-1 rounded-full border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-bold text-yellow-700">
            <Trophy size={12} /> {points} XP
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TASK_DIFFICULTIES).map(([key, value]) => (
            <button
              type="button"
              key={key}
              onClick={() => setDifficulty(key as TaskDifficulty)}
              aria-pressed={difficulty === key}
              title={value.hint}
              className={`rounded-xl border px-2 py-2 text-xs font-bold ${difficulty === key
                ? 'border-black bg-black text-white'
                : 'border-gray-200 bg-white text-gray-500'}`}
            >
              {value.label}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">
          XP рассчитывается автоматически по сложности и приоритету.
        </p>
      </div>

      <div className="space-y-3">
           {!isRoutineTask ? (
               <div>
                   <label className="mb-1 block text-xs font-bold uppercase text-gray-400" htmlFor="task-status">{task ? 'Статус' : 'Куда положить'}</label>
                   <select id="task-status" aria-label="Статус задачи" value={status} onChange={event => setStatus(event.target.value as TaskStatus)} className="w-full rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm outline-none focus:border-blue-200">
                       {(task ? TASK_STATUSES : NEW_TASK_STATUSES).map(candidate => (
                           <option key={candidate} value={candidate}>{task ? TASK_STATUS_META[candidate].label : candidate === 'INBOX' ? 'Во входящие — разобрать позже' : candidate === 'TODO' ? 'Сразу в список дел' : 'Ожидает ответа или события'}</option>
                       ))}
                   </select>
               </div>
           ) : null}
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

           <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
               <label className="space-y-1">
                   <span className="block text-xs font-bold uppercase text-gray-400">Следующее действие</span>
                   <input value={nextAction} onChange={event => setNextAction(event.target.value)} maxLength={500} placeholder="Один конкретный шаг" className="w-full rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm outline-none focus:border-blue-200" />
               </label>
               <label className="space-y-1">
                   <span className="block text-xs font-bold uppercase text-gray-400">Оценка, мин</span>
                   <input type="number" min="0" max="100000" inputMode="numeric" value={estimateMinutes} onChange={event => setEstimateMinutes(event.target.value)} placeholder="15" className="w-full rounded-lg border border-gray-100 bg-gray-50 p-2 text-sm outline-none focus:border-blue-200" />
               </label>
           </div>

           {availableTasks.some(candidate => candidate.id !== task?.id && !['DONE', 'DROPPED'].includes(candidate.status)) ? (
               <details className="rounded-xl bg-gray-50 p-3">
                   <summary className="cursor-pointer text-sm font-semibold text-gray-700">Зависит от других задач · {dependsOnIds.length}</summary>
                   <div className="mt-3 max-h-36 space-y-2 overflow-y-auto">
                       {availableTasks.filter(candidate => candidate.id !== task?.id && !['DONE', 'DROPPED'].includes(candidate.status)).map(candidate => (
                           <label key={candidate.id} className="flex items-start gap-2 text-sm text-gray-600">
                               <input
                                   type="checkbox"
                                   checked={dependsOnIds.includes(candidate.id)}
                                   onChange={() => setDependsOnIds(current => current.includes(candidate.id) ? current.filter(id => id !== candidate.id) : [...current, candidate.id])}
                                   className="mt-0.5"
                               />
                               <span className="line-clamp-2">{candidate.title}</span>
                           </label>
                       ))}
                   </div>
                   <p className="mt-2 text-[11px] text-gray-400">Это подсказка: FamTrack не запрещает начать задачу раньше.</p>
               </details>
           ) : null}

           <div className="grid grid-cols-2 gap-3">
               <div>
                   <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Срок</label>
                   <div className="relative">
                       <input 
                            type="date" 
                            aria-label="Срок задачи"
                            value={dueDate} 
                            onChange={e => setDueDate(e.target.value)}
                            className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200" 
                       />
                   </div>
               </div>
               <div>
                   <label className="text-xs font-bold text-gray-400 uppercase mb-1 block">Проект</label>
                   <select 
                        aria-label="Проект задачи"
                        value={epicId} 
                        onChange={e => setEpicId(e.target.value)}
                        className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200"
                    >
                       <option value="">Без проекта</option>
                       {epics.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
                   </select>
               </div>
           </div>

           <div className="grid grid-cols-2 gap-3">
               <label className="space-y-1">
                   <span className="text-xs font-bold text-gray-400 uppercase block">Напомнить</span>
                   <input
                        type="time"
                        value={reminderTime}
                        onChange={event => setReminderTime(event.target.value)}
                        className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200"
                   />
               </label>
               <label className="space-y-1">
                   <span className="text-xs font-bold text-gray-400 uppercase block">Куда отправить</span>
                   <select
                        value={notificationMode}
                        onChange={event => setNotificationMode(event.target.value as TaskNotificationMode)}
                        className="w-full bg-gray-50 rounded-lg p-2 text-sm outline-none border border-gray-100 focus:border-blue-200"
                   >
                       <option value="INHERIT">Как в семье</option>
                       <option value="PRIVATE">Лично</option>
                       <option value="GROUP">В группу</option>
                       <option value="BOTH">Лично и в группу</option>
                       <option value="OFF">Не напоминать</option>
                   </select>
               </label>
           </div>
           {visibleTo.length > 0 ? (
               <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                   Приватная задача никогда не отправляется в общий чат — только выбранным участникам лично.
               </p>
           ) : null}

           <div className="bg-gray-50 p-3 rounded-xl flex items-center justify-between">
               <div className="flex items-center gap-2">
                   <Repeat size={16} className={isRecurring ? "text-blue-500" : "text-gray-400"} />
                   <span className="text-sm font-medium text-gray-700">Повторять</span>
               </div>
               <div className="flex items-center gap-2">
                   {isRecurring && (
                       <select 
                            aria-label="Период повтора"
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
                        type="button"
                        onClick={() => setIsRecurring(!isRecurring)} 
                        aria-label="Повторять задачу"
                        aria-pressed={isRecurring}
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
                        type="button"
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
                                type="button"
                                onClick={() => {
                                    const newSt = [...subtasks];
                                    newSt[idx].isCompleted = !newSt[idx].isCompleted;
                                    setSubtasks(newSt);
                                }}
                                aria-label={st.isCompleted ? `Отметить подзадачу «${st.title}» невыполненной` : `Завершить подзадачу «${st.title}»`}
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
                           <button type="button" aria-label={`Удалить подзадачу «${st.title}»`} onClick={() => setSubtasks(subtasks.filter((_, i) => i !== idx))} className="text-gray-300 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-red-400">
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
          {task && !isRoutineTask && (
              <button type="button" aria-label="Удалить задачу" title="Удалить задачу" onClick={() => onDelete(task.id)} className="p-3 rounded-xl bg-red-50 text-red-500">
                  <Trash2 size={20} />
              </button>
          )}
          {isRoutineTask && task?.routineTemplateId && onRoutineComplete ? (
              <button type="button" disabled={routinePending} aria-busy={routinePending || undefined} onClick={() => onRoutineComplete(task.routineTemplateId!, task.id)} className="flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white shadow-lg transition-transform active:scale-95 disabled:opacity-45">
                  {routinePending ? <span className="inline-flex items-center gap-2"><Loader2 size={17} className="animate-spin" /> Выполняю…</span> : 'Выполнить рутину'}
              </button>
          ) : (
              <button type="button" onClick={() => void handleSave()} disabled={isRoutineTask || isSaving} className="flex-1 bg-black text-white rounded-xl py-3 font-bold shadow-lg active:scale-95 transition-transform disabled:opacity-40">
                  {isSaving ? 'Сохраняю…' : 'Сохранить'}
              </button>
          )}
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
    const [isCompleted, setCompleted] = useState(initialData?.isCompleted || false);

    const colors = ['bg-blue-500', 'bg-red-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-indigo-500', 'bg-teal-500'];

    return (
        <div className="space-y-4">
            <input 
                aria-label="Название проекта"
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
                            type="button"
                            key={c}
                            onClick={() => setColor(c)}
                            aria-label={`Цвет проекта ${colors.indexOf(c) + 1}`}
                            aria-pressed={color === c}
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
                            type="button"
                            key={k}
                            onClick={() => setPriority(k as Priority)}
                            aria-pressed={priority === k}
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
                    aria-label="Финансовая цель проекта"
                    value={goalId} 
                    onChange={e => setGoalId(e.target.value)}
                    className="w-full bg-gray-50 rounded-xl p-3 text-sm outline-none"
                >
                    <option value="">Без цели</option>
                    {goals.map(g => <option key={g.id} value={g.id}>{g.title} ({formatMoney(g.targetAmount)})</option>)}
                </select>
            </div>

            <VisibilitySelector members={members} selectedIds={visibleTo} onChange={setVisibleTo} />

            <label className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 p-3">
                <span>
                    <span className="block text-sm font-bold">Проект завершён</span>
                    <span className="block text-xs text-gray-400">Задачи сохраняются и остаются доступны по фильтру</span>
                </span>
                <input
                    type="checkbox"
                    checked={isCompleted}
                    onChange={event => setCompleted(event.target.checked)}
                    className="h-5 w-5 accent-black"
                />
            </label>

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
                        isCompleted,
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
    onRoutineComplete,
    pendingRoutineIds,
    pendingTaskIds,
    onMoveTask,
    onAddEpic,
    onEditEpic,
    onEpicFilterChange,
    activeFilterEpicId,
    ownershipFilter,
    onOwnershipFilterChange
}: { 
    data: AppData, 
    onTaskClick: (t: Task) => void,
    onAddTask: () => void,
    onStatusChange: (id: string, status: TaskStatus) => void,
    onRoutineComplete: (routineId: string, taskId: string) => void,
    pendingRoutineIds?: ReadonlySet<string>,
    pendingTaskIds?: ReadonlySet<string>,
    onMoveTask: (id: string, status: TaskStatus, beforeTaskId?: string) => void,
    onAddEpic: () => void,
    onEditEpic: (epic: Epic) => void,
    onEpicFilterChange: (epicId?: string) => void,
    activeFilterEpicId?: string,
    ownershipFilter: TaskOwnershipFilter,
    onOwnershipFilterChange: (filter: TaskOwnershipFilter) => void
}) => {
    const [view, setView] = useState<'LIST' | 'KANBAN'>('KANBAN');
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const dragStart = useRef<{ id: string; x: number; y: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);
    
    const visibleEpics = data.epics.filter(e => isVisible(e, data.currentUser));
    const visibleTasks = data.tasks.filter(t => isVisible(t, data.currentUser));
    const ownershipTasks = ownershipFilter === 'MINE'
        ? visibleTasks.filter(task => task.assigneeId === data.currentUser.id)
        : visibleTasks;
    let tasks = ownershipTasks;
    if (activeFilterEpicId) {
        tasks = tasks.filter(t => t.epicId === activeFilterEpicId);
    }

    const activeEpic = activeFilterEpicId ? visibleEpics.find(e => e.id === activeFilterEpicId) : null;
    const orderedTasks = (status: TaskStatus) => tasks
        .filter(t => t.status === status)
        .sort((left, right) => (left.sortOrder ?? left.createdAt) - (right.sortOrder ?? right.createdAt));

    const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
        dragStart.current = { id, x: event.clientX, y: event.clientY, moved: false };
        try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
            // Some synthetic/WebView pointer events are not capturable.
        }
    };

    const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!dragStart.current) return;
        const distance = Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y);
        if (distance > 8) {
            dragStart.current.moved = true;
            setDraggingId(dragStart.current.id);
        }
    };

    const finishDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
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

    const cancelDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
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
                            value={ownershipFilter}
                            onChange={onOwnershipFilterChange}
                            ariaLabel="Исполнитель задач"
                            options={[
                                { value: 'ALL', label: 'Все' },
                                { value: 'MINE', label: 'Мои' }
                            ]}
                        />
                        <SegmentedControl
                            value={view}
                            onChange={setView}
                            ariaLabel="Вид задач"
                            options={[
                                { value: 'LIST', icon: ListIcon, ariaLabel: 'Список задач' },
                                { value: 'KANBAN', icon: Kanban, ariaLabel: 'Канбан' }
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
                            {ownershipTasks.length}
                        </span>
                    </button>
                    {visibleEpics.map(epic => {
                        const isActive = activeFilterEpicId === epic.id;
                        const count = ownershipTasks.filter(task => task.epicId === epic.id).length;
                        return (
                            <button
                                key={epic.id}
                                type="button"
                                onClick={() => onEpicFilterChange(epic.id)}
                                className={`h-9 max-w-[220px] shrink-0 rounded-full border pl-2.5 pr-2 text-xs font-bold flex items-center gap-2 active:scale-95 transition-transform ${epic.isCompleted ? 'opacity-60' : ''} ${isActive ? 'bg-gray-950 text-white border-gray-950 shadow-sm' : 'bg-white text-gray-700 border-gray-200'}`}
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
                    {activeEpic && (data.currentUser.role === 'OWNER' || data.currentUser.role === 'ADMIN') && (
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
                    {(data.currentUser.role === 'OWNER' || data.currentUser.role === 'ADMIN') && (
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
                    )}
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
                                        onRoutineComplete={task.routineTemplateId ? () => onRoutineComplete(task.routineTemplateId!, task.id) : undefined}
                                        routinePending={!!task.routineTemplateId && pendingRoutineIds?.has(task.routineTemplateId)}
                                    />
                                </div>
                            ))
                        )}
                    </Panel>
                ) : (
                    <div className="flex gap-2 overflow-x-auto pb-4 h-full no-scrollbar snap-x-app mt-4 -mx-1 px-1">
                        {TASK_STATUSES.map(status => (
                            <div
                                key={status}
                                data-kanban-column={status}
                                role="list"
                                aria-label={TASK_STATUS_META[status].label}
                                className="min-w-[calc((100vw-36px)/2)] max-w-[calc((100vw-36px)/2)] sm:min-w-[220px] sm:max-w-[240px] shrink-0 bg-gray-50 rounded-[14px] border border-gray-100 p-2 snap-start"
                            >
                                <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${TASK_STATUS_META[status].color}`} />
                                    {TASK_STATUS_META[status].label}
                                </div>
                                <div className="space-y-2">
                                    {orderedTasks(status).map(task => (
                                        <KanbanCard 
                                            key={task.id}
                                            task={task}
                                            assignee={data.members.find(m => m.id === task.assigneeId)}
                                            epic={data.epics.find(e => e.id === task.epicId)}
                                            isDragging={draggingId === task.id}
                                            statusPending={pendingTaskIds?.has(task.id)}
                                            onPointerDown={task.routineTemplateId ? undefined : (event) => beginDrag(event, task.id)}
                                            onPointerMove={task.routineTemplateId ? undefined : updateDrag}
                                            onPointerUp={task.routineTemplateId ? undefined : finishDrag}
                                            onPointerCancel={task.routineTemplateId ? undefined : cancelDrag}
                                            onStatusMove={task.routineTemplateId ? undefined : (nextStatus) => onMoveTask(task.id, nextStatus)}
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

            <FloatingActionButton onClick={onAddTask} icon={Plus} label="Добавить задачу" visibleLabel="Задача" />
        </Screen>
    )
}
