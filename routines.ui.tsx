import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { User } from './family.model';
import { ROUTINE_PRESETS } from './routine-presets';
import type {
    RoutineAssignmentMode,
    RoutineKind,
    RoutinePresetId,
    RoutineSchedule,
    RoutineScheduleKind,
    RoutineTemplate,
    RoutineVisibility
} from './routines.model';
import type { Priority, TaskDifficulty } from './tasks.model';

export type RoutineDraft = Partial<RoutineTemplate> & { presetId?: RoutinePresetId };

const FIELD_CLASS = 'w-full rounded-xl border border-black/10 bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-blue-400';
const LABEL_CLASS = 'mb-1.5 block text-[11px] font-black uppercase tracking-wide text-gray-400';

const todayInTimezone = (timezone: string) => {
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(Date.now());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
};

export const routineDraftFromPreset = (
    presetId: RoutinePresetId,
    timezone: string,
    visibility: RoutineVisibility
): RoutineDraft => {
    const preset = ROUTINE_PRESETS[presetId];
    return {
        presetId,
        title: preset.title,
        kind: preset.kind,
        schedule: preset.schedule ? { ...preset.schedule, weekDays: preset.schedule.weekDays ? [...preset.schedule.weekDays] : undefined } : undefined,
        unitLabel: preset.unitLabel,
        difficulty: preset.difficulty,
        priority: preset.priority,
        assignmentMode: 'FREE',
        assigneeIds: [],
        visibility,
        startDate: todayInTimezone(timezone),
        timezone
    };
};

export const blankRoutineDraft = (timezone: string, visibility: RoutineVisibility): RoutineDraft => ({
    title: '',
    kind: 'SCHEDULED',
    schedule: { kind: 'DAILY' },
    assignmentMode: 'FREE',
    assigneeIds: [],
    difficulty: 'MEDIUM',
    priority: 'MEDIUM',
    visibility,
    startDate: todayInTimezone(timezone),
    timezone
});

const SCHEDULE_OPTIONS: Array<{ value: RoutineScheduleKind; label: string }> = [
    { value: 'DAILY', label: 'Ежедневно' },
    { value: 'WEEKDAYS', label: 'По дням недели' },
    { value: 'INTERVAL_DAYS', label: 'Раз в N дней' },
    { value: 'INTERVAL_WEEKS', label: 'Раз в N недель' },
    { value: 'MONTHLY', label: 'День месяца' },
    { value: 'YEARLY', label: 'Ежегодно' }
];

const WEEKDAYS = [
    { value: 1, label: 'Пн' },
    { value: 2, label: 'Вт' },
    { value: 3, label: 'Ср' },
    { value: 4, label: 'Чт' },
    { value: 5, label: 'Пт' },
    { value: 6, label: 'Сб' },
    { value: 0, label: 'Вс' }
];

export const RoutineEditor = ({
    draft,
    members,
    familyTimezone,
    onSave,
    onDone
}: {
    key?: React.Key;
    draft: RoutineDraft;
    members: User[];
    familyTimezone: string;
    onSave: (routine: RoutineDraft) => boolean | void | Promise<boolean | void>;
    onDone: () => void;
}) => {
    const [title, setTitle] = useState(draft.title || '');
    const [description, setDescription] = useState(draft.description || '');
    const [kind, setKind] = useState<RoutineKind>(draft.kind || 'SCHEDULED');
    const [schedule, setSchedule] = useState<RoutineSchedule>(draft.schedule || { kind: 'DAILY' });
    const [assignmentMode, setAssignmentMode] = useState<RoutineAssignmentMode>(draft.assignmentMode || 'FREE');
    const [assigneeIds, setAssigneeIds] = useState<string[]>(draft.assigneeIds || []);
    const [visibility, setVisibility] = useState<RoutineVisibility>(draft.visibility || 'FAMILY');
    const [difficulty, setDifficulty] = useState<TaskDifficulty>(draft.difficulty || 'MEDIUM');
    const [priority, setPriority] = useState<Priority>(draft.priority || 'MEDIUM');
    const [startDate, setStartDate] = useState(draft.startDate || todayInTimezone(familyTimezone));
    const [endDate, setEndDate] = useState(draft.endDate || '');
    const [time, setTime] = useState(draft.time || '');
    const [timezone, setTimezone] = useState(draft.timezone || familyTimezone);
    const [unitLabel, setUnitLabel] = useState(draft.unitLabel || 'ед.');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const toggleWeekday = (day: number) => {
        const selected = schedule.weekDays || [];
        setSchedule({
            ...schedule,
            weekDays: selected.includes(day) ? selected.filter(value => value !== day) : [...selected, day]
        });
    };
    const toggleAssignee = (id: string) => {
        if (assignmentMode === 'FIXED') {
            setAssigneeIds([id]);
            return;
        }
        setAssigneeIds(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]);
    };

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        if (!title.trim()) {
            setError('Укажите название рутины.');
            return;
        }
        if (endDate && endDate < startDate) {
            setError('Дата окончания не может быть раньше даты начала.');
            return;
        }
        if (assignmentMode !== 'FREE' && assigneeIds.length === 0) {
            setError('Выберите хотя бы одного исполнителя.');
            return;
        }
        if (kind === 'SCHEDULED' && ['WEEKDAYS', 'INTERVAL_WEEKS'].includes(schedule.kind) && !(schedule.weekDays || []).length) {
            setError('Выберите хотя бы один день недели.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await onSave({
                ...draft,
                title: title.trim(),
                description: description.trim() || undefined,
                kind,
                schedule: kind === 'SCHEDULED' ? schedule : undefined,
                assignmentMode,
                assigneeIds: assignmentMode === 'FREE' ? [] : assignmentMode === 'FIXED' ? assigneeIds.slice(0, 1) : assigneeIds,
                visibility,
                difficulty,
                priority,
                startDate,
                endDate: endDate || undefined,
                time: time || undefined,
                timezone: timezone.trim() || familyTimezone,
                unitLabel: kind === 'ACCUMULATOR' ? unitLabel.trim() || 'ед.' : undefined
            });
            if (result !== false) onDone();
        } catch {
            setError('Не удалось сохранить рутину. Повторите попытку.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4" aria-label="Редактор рутины">
            {draft.presetId ? <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">Пресет заполнен заранее. Проверьте параметры и подтвердите создание.</p> : null}

            <label><span className={LABEL_CLASS}>Название</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} className={FIELD_CLASS} autoFocus /></label>
            <label><span className={LABEL_CLASS}>Описание</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={2000} rows={3} className={FIELD_CLASS} /></label>

            <fieldset>
                <legend className={LABEL_CLASS}>Тип</legend>
                <div className="grid grid-cols-2 gap-2">
                    {([['SCHEDULED', 'По расписанию'], ['ACCUMULATOR', 'Накопительная']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setKind(value)} aria-pressed={kind === value} className={`min-h-11 rounded-xl border px-3 text-xs font-black ${kind === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-black/10 text-gray-500'}`}>{label}</button>
                    ))}
                </div>
            </fieldset>

            {kind === 'SCHEDULED' ? (
                <div className="space-y-3 rounded-2xl bg-black/[0.025] p-3">
                    <label><span className={LABEL_CLASS}>Повтор</span><select value={schedule.kind} onChange={event => setSchedule({ kind: event.target.value as RoutineScheduleKind })} className={FIELD_CLASS}>{SCHEDULE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                    {(schedule.kind === 'INTERVAL_DAYS' || schedule.kind === 'INTERVAL_WEEKS') ? (
                        <label><span className={LABEL_CLASS}>Интервал</span><input type="number" min="1" max={schedule.kind === 'INTERVAL_DAYS' ? 365 : 52} value={schedule.interval || 1} onChange={event => setSchedule({ ...schedule, interval: Number(event.target.value) })} className={FIELD_CLASS} /></label>
                    ) : null}
                    {(schedule.kind === 'WEEKDAYS' || schedule.kind === 'INTERVAL_WEEKS') ? (
                        <fieldset><legend className={LABEL_CLASS}>Дни недели</legend><div className="grid grid-cols-7 gap-1">{WEEKDAYS.map(day => {
                            const selected = (schedule.weekDays || []).includes(day.value);
                            return <button type="button" key={day.value} onClick={() => toggleWeekday(day.value)} aria-pressed={selected} className={`grid min-h-10 place-items-center rounded-lg text-[11px] font-black ${selected ? 'bg-blue-600 text-white' : 'bg-white text-gray-500'}`}>{day.label}</button>;
                        })}</div></fieldset>
                    ) : null}
                    {schedule.kind === 'MONTHLY' ? <label><span className={LABEL_CLASS}>День месяца</span><input type="number" min="1" max="31" value={schedule.dayOfMonth || 1} onChange={event => setSchedule({ ...schedule, dayOfMonth: Number(event.target.value) })} className={FIELD_CLASS} /></label> : null}
                    {schedule.kind === 'YEARLY' ? <div className="grid grid-cols-2 gap-2"><label><span className={LABEL_CLASS}>Месяц</span><input type="number" min="1" max="12" value={schedule.month || 1} onChange={event => setSchedule({ ...schedule, month: Number(event.target.value) })} className={FIELD_CLASS} /></label><label><span className={LABEL_CLASS}>День</span><input type="number" min="1" max="31" value={schedule.day || 1} onChange={event => setSchedule({ ...schedule, day: Number(event.target.value) })} className={FIELD_CLASS} /></label></div> : null}
                </div>
            ) : <label><span className={LABEL_CLASS}>Название единицы</span><input value={unitLabel} onChange={event => setUnitLabel(event.target.value)} maxLength={40} placeholder="пакет, загрузка, бутылка" className={FIELD_CLASS} /></label>}

            <div className="grid grid-cols-2 gap-2">
                <label><span className={LABEL_CLASS}>Начало</span><input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} required className={FIELD_CLASS} /></label>
                <label><span className={LABEL_CLASS}>Окончание</span><input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} min={startDate} className={FIELD_CLASS} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <label><span className={LABEL_CLASS}>Время</span><input type="time" value={time} onChange={event => setTime(event.target.value)} className={FIELD_CLASS} /></label>
                <label><span className={LABEL_CLASS}>Timezone семьи</span><input value={timezone} onChange={event => setTimezone(event.target.value)} maxLength={80} placeholder={familyTimezone} className={FIELD_CLASS} /></label>
            </div>

            <fieldset><legend className={LABEL_CLASS}>Видимость</legend><div className="grid grid-cols-2 gap-2">{([['PERSONAL', 'Личная'], ['FAMILY', 'Семейная']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setVisibility(value)} aria-pressed={visibility === value} className={`min-h-10 rounded-xl text-xs font-black ${visibility === value ? 'bg-gray-950 text-white' : 'bg-black/5 text-gray-500'}`}>{label}</button>)}</div></fieldset>

            <fieldset><legend className={LABEL_CLASS}>Исполнитель</legend><div className="grid grid-cols-3 gap-1.5">{([['FREE', 'Свободный'], ['FIXED', 'Фиксированный'], ['ROUND_ROBIN', 'По кругу']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setAssignmentMode(value)} aria-pressed={assignmentMode === value} className={`min-h-11 rounded-xl px-2 text-[11px] font-black ${assignmentMode === value ? 'bg-violet-100 text-violet-800' : 'bg-black/5 text-gray-500'}`}>{label}</button>)}</div></fieldset>

            {assignmentMode !== 'FREE' ? <fieldset><legend className={LABEL_CLASS}>{assignmentMode === 'FIXED' ? 'Кто выполняет' : 'Участники очереди'}</legend><div className="space-y-1.5">{members.filter(member => member.isActive !== false).map(member => {
                const selected = assigneeIds.includes(member.id);
                return <button type="button" key={member.id} onClick={() => toggleAssignee(member.id)} aria-pressed={selected} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-bold ${selected ? 'bg-violet-50 text-violet-800' : 'bg-black/[0.025]'}`}><span className="text-lg">{member.avatar}</span><span className="flex-1">{member.name}</span>{selected ? <Check size={16} /> : null}</button>;
            })}</div></fieldset> : null}

            <div className="grid grid-cols-2 gap-2">
                <label><span className={LABEL_CLASS}>Сложность</span><select value={difficulty} onChange={event => setDifficulty(event.target.value as TaskDifficulty)} className={FIELD_CLASS}><option value="EASY">Легко</option><option value="MEDIUM">Средне</option><option value="HARD">Сложно</option></select></label>
                <label><span className={LABEL_CLASS}>Приоритет</span><select value={priority} onChange={event => setPriority(event.target.value as Priority)} className={FIELD_CLASS}><option value="LOW">Низкий</option><option value="MEDIUM">Средний</option><option value="HIGH">Высокий</option></select></label>
            </div>

            {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button type="submit" disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-sm font-black text-white disabled:opacity-50">
                {submitting ? <Loader2 size={17} className="animate-spin" /> : null}
                {draft.id ? 'Сохранить рутину' : draft.presetId ? 'Подтвердить и создать' : 'Создать рутину'}
            </button>
        </form>
    );
};
