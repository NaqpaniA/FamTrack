import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Check,
    CirclePause,
    CloudSun,
    ExternalLink,
    Gauge,
    Gift,
    HeartPulse,
    History,
    Loader2,
    Medal,
    PackagePlus,
    Pencil,
    Plus,
    RefreshCw,
    Settings2,
    SkipForward,
    Trash2,
    X
} from 'lucide-react';
import {
    DASHBOARD_WIDGET_IDS,
    DEFAULT_DASHBOARD_HIDDEN_WIDGETS,
    type AppData,
    type DashboardPreferences,
    type DashboardWidgetId
} from './types';
import type { RoutinePresetId, RoutineTemplate } from './routines.model';
import type { Wishlist, WishlistItem, WishlistPriority } from './wishlist.model';
import { Modal, Panel, SectionHeader } from './ui-kit';
import { formatMoney } from './utils';
import { ROUTINE_PRESETS } from './routine-presets';
import { blankRoutineDraft, RoutineEditor, routineDraftFromPreset, type RoutineDraft } from './routines.ui';

const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
    routines: 'Рутины сегодня',
    'day-pulse': 'Пульс дня',
    'house-health': 'House Health',
    history: 'История рутин',
    leaderboard: 'Лидерборд',
    projects: 'Проекты и цели',
    activity: 'Активность',
    notes: 'Заметки',
    weather: 'Погода (opt-in)',
    wishlists: 'Желания'
};

const PRESET_IDS = Object.keys(ROUTINE_PRESETS) as RoutinePresetId[];

type AsyncActionResult = boolean | void | Promise<boolean | void>;

interface HouseholdActions {
    saveRoutine: (routine: Partial<RoutineTemplate> & { presetId?: string }) => AsyncActionResult;
    pauseRoutine: (routineId: string, paused: boolean) => AsyncActionResult;
    completeRoutine: (routineId: string, taskId?: string, units?: number) => AsyncActionResult;
    recordRoutineUnit: (routineId: string, units?: number) => AsyncActionResult;
    skipRoutine: (routineId: string) => AsyncActionResult;
    pendingRoutineIds?: ReadonlySet<string>;
    savePreferences: (preferences: Partial<DashboardPreferences>) => void;
    saveWishlist: (wishlist: Partial<Wishlist>) => AsyncActionResult;
    saveWishlistItem: (item: Partial<WishlistItem> & { wishlistId: string }) => AsyncActionResult;
    deleteWishlistItem: (wishlistId: string, itemId: string) => AsyncActionResult;
    reserveWishlistItem: (wishlistId: string, itemId: string, reserved: boolean) => AsyncActionResult;
}

export const HouseholdDashboard = ({
    data,
    actions,
    externalWidgets = {}
}: {
    data: AppData;
    actions: HouseholdActions;
    externalWidgets?: Partial<Record<'projects' | 'activity' | 'notes', React.ReactNode>>;
}) => {
    const preferences = data.dashboardPreferences || {
        userId: data.currentUser.id,
        scope: 'FAMILY' as const,
        hiddenWidgets: [...DEFAULT_DASHBOARD_HIDDEN_WIDGETS],
        widgetOrder: [],
        weatherOptIn: false
    };
    const [customizing, setCustomizing] = useState(false);
    const order = useMemo(() => {
        const configured = preferences.widgetOrder.filter((widget): widget is DashboardWidgetId => (
            DASHBOARD_WIDGET_IDS.includes(widget as DashboardWidgetId)
        ));
        return [...configured, ...DASHBOARD_WIDGET_IDS.filter(widget => !configured.includes(widget))];
    }, [preferences.widgetOrder]);
    const hidden = new Set(preferences.hiddenWidgets);
    const updatePreferences = (patch: Partial<DashboardPreferences>) => actions.savePreferences({ ...preferences, ...patch });
    const moveWidget = (widget: DashboardWidgetId, offset: -1 | 1) => {
        const index = order.indexOf(widget);
        const target = index + offset;
        if (target < 0 || target >= order.length) return;
        const next = [...order];
        [next[index], next[target]] = [next[target], next[index]];
        updatePreferences({ widgetOrder: next });
    };
    const toggleWidget = (widget: DashboardWidgetId) => {
        if (widget === 'weather') {
            updatePreferences({
                weatherOptIn: !preferences.weatherOptIn,
                hiddenWidgets: preferences.hiddenWidgets.filter(item => item !== widget)
            });
            return;
        }
        updatePreferences({
            hiddenWidgets: hidden.has(widget)
                ? preferences.hiddenWidgets.filter(item => item !== widget)
                : [...preferences.hiddenWidgets, widget]
        });
    };

    const widgets: Record<DashboardWidgetId, React.ReactNode> = {
        routines: <RoutinesWidget data={data} actions={actions} />,
        'day-pulse': <DayPulseWidget data={data} />,
        'house-health': <HouseHealthWidget data={data} />,
        history: <RoutineHistoryWidget data={data} />,
        leaderboard: <LeaderboardWidget data={data} />,
        projects: externalWidgets.projects || null,
        activity: externalWidgets.activity || null,
        notes: externalWidgets.notes || null,
        weather: <WeatherWidget onDisable={() => updatePreferences({ weatherOptIn: false })} />,
        wishlists: <WishlistWidget data={data} actions={actions} />
    };

    return (
        <section className="space-y-4" aria-label="Household Pulse">
            <div className="flex items-center justify-between gap-3">
                <div className="inline-flex rounded-full bg-black/5 p-1 dark:bg-white/10" aria-label="Область главной">
                    {(['PERSONAL', 'FAMILY'] as const).map(scope => (
                        <button
                            type="button"
                            key={scope}
                            onClick={() => updatePreferences({ scope })}
                            aria-pressed={preferences.scope === scope}
                            className={`min-h-9 rounded-full px-4 text-xs font-bold transition ${preferences.scope === scope ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500'}`}
                        >
                            {scope === 'PERSONAL' ? 'Личное' : 'Семья'}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => setCustomizing(value => !value)}
                    aria-expanded={customizing}
                    className="inline-flex min-h-10 items-center gap-2 rounded-full border border-black/10 px-3 text-xs font-bold text-gray-600"
                >
                    <Settings2 size={16} /> Настроить
                </button>
            </div>

            {customizing && (
                <Panel className="p-3" aria-label="Настройка виджетов">
                    <div className="space-y-2">
                        {order.map((widget, index) => {
                            const enabled = widget === 'weather' ? preferences.weatherOptIn : !hidden.has(widget);
                            return <div key={widget} className="flex min-h-11 items-center gap-2 rounded-xl bg-black/[0.025] px-3">
                                <button
                                    type="button"
                                    onClick={() => toggleWidget(widget)}
                                    className="flex flex-1 items-center gap-2 text-left text-sm font-semibold"
                                    aria-pressed={enabled}
                                >
                                    <span className={`grid h-5 w-5 place-items-center rounded-md ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-400'}`}>
                                        {enabled ? <Check size={12} /> : <X size={12} />}
                                    </span>
                                    {WIDGET_LABELS[widget]}
                                </button>
                                <button type="button" disabled={index === 0} onClick={() => moveWidget(widget, -1)} aria-label={`Поднять ${WIDGET_LABELS[widget]}`} className="p-2 disabled:opacity-25"><ArrowUp size={15} /></button>
                                <button type="button" disabled={index === order.length - 1} onClick={() => moveWidget(widget, 1)} aria-label={`Опустить ${WIDGET_LABELS[widget]}`} className="p-2 disabled:opacity-25"><ArrowDown size={15} /></button>
                            </div>;
                        })}
                        <p className="px-2 text-[10px] leading-relaxed text-gray-400">Погода запрашивает приблизительную геопозицию только после включения. Координаты не сохраняются в FamTrack и отправляются напрямую погодному сервису.</p>
                    </div>
                </Panel>
            )}

            {order.filter(widget => !hidden.has(widget) && (widget !== 'weather' || preferences.weatherOptIn)).map(widget => (
                <React.Fragment key={widget}>{widgets[widget]}</React.Fragment>
            ))}
        </section>
    );
};

const RoutinesWidget = ({ data, actions }: { data: AppData; actions: HouseholdActions }) => {
    const [showPresets, setShowPresets] = useState(false);
    const [editorDraft, setEditorDraft] = useState<RoutineDraft | null>(null);
    const [batchRoutine, setBatchRoutine] = useState<RoutineTemplate | null>(null);
    const [batchUnits, setBatchUnits] = useState(1);
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
    const familyTimezone = data.family?.settings.timezone || 'UTC';
    const routines = (data.routines || [])
        .filter(routine => scope === 'PERSONAL' ? routine.visibility === 'PERSONAL' : routine.visibility === 'FAMILY')
        .sort((left, right) => (left.nextOccurrenceDate || '9999').localeCompare(right.nextOccurrenceDate || '9999'));
    const openPreset = (presetId: RoutinePresetId) => {
        setEditorDraft(routineDraftFromPreset(presetId, familyTimezone, scope));
        setShowPresets(false);
    };
    const openBatch = (routine: RoutineTemplate) => {
        setBatchRoutine(routine);
        setBatchUnits(Math.max(1, routine.accumulatedUnits));
    };
    const completeBatch = async () => {
        if (!batchRoutine) return;
        const result = await actions.completeRoutine(batchRoutine.id, batchRoutine.openTaskId, batchUnits);
        if (result !== false) setBatchRoutine(null);
    };

    return (
        <>
            <div>
                <SectionHeader
                    title="Рутины сегодня"
                    action={<button type="button" onClick={() => setShowPresets(value => !value)} className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-blue-600"><Plus size={15} /> Добавить</button>}
                />
                {showPresets && (
                    <Panel className="mt-3 p-3">
                        <p className="mb-2 px-1 text-[11px] text-gray-500">Пресет откроется в редакторе и ничего не создаст без подтверждения.</p>
                        <div className="no-scrollbar -mx-1 flex snap-x-app gap-2 overflow-x-auto px-1 pb-2">
                            {PRESET_IDS.map(presetId => {
                                const preset = ROUTINE_PRESETS[presetId];
                                return (
                                    <button type="button" key={presetId} onClick={() => openPreset(presetId)} className="min-w-[88px] snap-start rounded-2xl border border-black/5 bg-white/60 p-3 text-center text-xs font-bold active:scale-95">
                                        <span className="mb-1 block text-2xl" aria-hidden="true">{preset.icon}</span>
                                        {preset.label}
                                    </button>
                                );
                            })}
                        </div>
                        <button type="button" onClick={() => { setEditorDraft(blankRoutineDraft(familyTimezone, scope)); setShowPresets(false); }} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 text-sm font-black text-white"><Plus size={17} /> Настроить свою</button>
                    </Panel>
                )}
                <Panel className="mt-3 overflow-hidden">
                    {routines.length === 0 ? (
                        <div className="p-6 text-center text-sm text-gray-400">В этом режиме рутин пока нет.</div>
                    ) : routines.map(routine => {
                        const task = data.tasks.find(item => item.id === routine.openTaskId);
                        const pending = actions.pendingRoutineIds?.has(routine.id) === true;
                        return (
                            <div key={routine.id} className="flex items-center gap-2 border-b border-black/5 p-3 last:border-0" aria-busy={pending || undefined}>
                                <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${routine.kind === 'ACCUMULATOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {pending ? <Loader2 size={18} className="animate-spin" /> : routine.kind === 'ACCUMULATOR' ? <PackagePlus size={19} /> : <HeartPulse size={19} />}
                                </div>
                                <button type="button" disabled={pending} onClick={() => setEditorDraft({ ...routine })} className="min-w-0 flex-1 rounded-lg text-left disabled:opacity-60" aria-label={`Редактировать рутину ${routine.title}`}>
                                    <span className="flex items-center gap-1.5"><span className="truncate text-sm font-bold">{routine.title}</span><Pencil size={11} className="shrink-0 text-gray-300" /></span>
                                    <span className="mt-0.5 block text-[11px] text-gray-500">
                                        {routine.paused ? 'На паузе' : routine.kind === 'ACCUMULATOR' ? `${routine.accumulatedUnits} ${routine.unitLabel || 'ед.'} · серия ${routine.streak}` : `${routine.nextOccurrenceDate || 'Без следующей даты'} · серия ${routine.streak}`}
                                    </span>
                                </button>
                                <div className="flex shrink-0 items-center gap-0.5">
                                    {routine.kind === 'ACCUMULATOR' && !routine.paused ? <button type="button" disabled={pending} onClick={() => void actions.recordRoutineUnit(routine.id, 1)} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-amber-100 px-2 text-xs font-black text-amber-800 disabled:opacity-45" aria-label={`Добавить ${routine.unitLabel || 'единицу'}`}>+1</button> : null}
                                    {!routine.paused && (routine.kind === 'SCHEDULED' || routine.accumulatedUnits > 0) ? <button type="button" disabled={pending} onClick={() => routine.kind === 'ACCUMULATOR' ? openBatch(routine) : void actions.completeRoutine(routine.id, task?.id)} className="grid min-h-11 min-w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700 disabled:opacity-45" aria-label={`Завершить ${routine.title}`}><Check size={17} /></button> : null}
                                    <button type="button" disabled={pending} onClick={() => void actions.pauseRoutine(routine.id, !routine.paused)} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-gray-400 disabled:opacity-45" aria-label={routine.paused ? `Возобновить ${routine.title}` : `Поставить на паузу ${routine.title}`}>{routine.paused ? <Plus size={16} /> : <CirclePause size={16} />}</button>
                                    {routine.kind === 'SCHEDULED' && !routine.paused ? <button type="button" disabled={pending} onClick={() => { if (window.confirm(`Пропустить «${routine.title}»? XP за этот период начислен не будет.`)) void actions.skipRoutine(routine.id); }} className="grid min-h-11 min-w-11 place-items-center rounded-xl text-gray-400 disabled:opacity-45" aria-label={`Пропустить ${routine.title} без XP`}><SkipForward size={16} /></button> : null}
                                </div>
                            </div>
                        );
                    })}
                </Panel>
            </div>

            <Modal isOpen={!!editorDraft} onClose={() => setEditorDraft(null)} title={editorDraft?.id ? 'Редактировать рутину' : 'Новая рутина'}>
                {editorDraft ? <RoutineEditor key={editorDraft.id || editorDraft.presetId || 'new'} draft={editorDraft} members={data.members} familyTimezone={familyTimezone} onSave={actions.saveRoutine} onDone={() => setEditorDraft(null)} /> : null}
            </Modal>

            <Modal isOpen={!!batchRoutine} onClose={() => setBatchRoutine(null)} title="Завершить накопление">
                {batchRoutine ? <div className="space-y-4">
                    <p className="text-sm text-gray-600">Выберите количество: от 1 до {batchRoutine.accumulatedUnits} {batchRoutine.unitLabel || 'ед.'}. XP будет начислен только за выбранный объём.</p>
                    <label><span className="mb-2 block text-xs font-black uppercase text-gray-400">Количество</span><input type="number" min="1" max={batchRoutine.accumulatedUnits} value={batchUnits} onChange={event => setBatchUnits(Math.min(batchRoutine.accumulatedUnits, Math.max(1, Number(event.target.value))))} className="w-full rounded-xl border border-black/10 px-3 py-3 text-lg font-black" /></label>
                    <button type="button" disabled={actions.pendingRoutineIds?.has(batchRoutine.id)} onClick={() => void completeBatch()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-black text-white disabled:opacity-45">{actions.pendingRoutineIds?.has(batchRoutine.id) ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Завершить {batchUnits}</button>
                </div> : null}
            </Modal>
        </>
    );
};

const DayPulseWidget = ({ data }: { data: AppData }) => {
    const timezone = data.family?.settings.timezone || 'UTC';
    const today = dateKeyInTimezone(Date.now(), timezone);
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
    const summary = data.routineSummaries?.[scope] || data.routineSummary;
    const expenses = data.transactions
        .filter(transaction => (
            transaction.type === 'EXPENSE'
            && dateKeyInTimezone(transaction.date, timezone) === today
            && (scope === 'FAMILY' || transaction.createdById === data.currentUser.id)
        ))
        .reduce((total, transaction) => total + transaction.amount, 0);
    const nextFocus = (data.routines || [])
        .filter(routine => (
            !routine.paused
            && routine.kind === 'SCHEDULED'
            && routine.visibility === scope
        ))
        .sort((left, right) => (left.nextOccurrenceDate || '9999').localeCompare(right.nextOccurrenceDate || '9999'))[0];
    return (
        <div>
            <SectionHeader title="Пульс дня" />
            <Panel className="mt-3 grid grid-cols-3 divide-x divide-black/5 p-1">
                <PulseMetric value={String(summary?.completedToday || 0)} label="готово" />
                <PulseMetric value={`+${summary?.xpToday || 0}`} label="XP" />
                <PulseMetric value={formatMoney(expenses).replace(',00 ₽', '')} label="расходы" />
            </Panel>
            {nextFocus && <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-900"><span className="font-black">Следующий фокус:</span> {nextFocus.title}</div>}
        </div>
    );
};

const dateKeyInTimezone = (value: number | string, timezone: string) => {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return typeof value === 'string' ? value.slice(0, 10) : '';
    try {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    } catch {
        return date.toISOString().slice(0, 10);
    }
};

const PulseMetric = ({ value, label }: { value: string; label: string }) => (
    <div className="min-w-0 px-2 py-3 text-center">
        <div className="truncate text-base font-black text-gray-950">{value}</div>
        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
    </div>
);

const HouseHealthWidget = ({ data }: { data: AppData }) => {
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
    const health = (data.routineSummaries?.[scope] || data.routineSummary)?.houseHealth;
    if (!health) return null;
    const tone = health.state === 'GREEN' ? 'text-emerald-700 bg-emerald-100' : health.state === 'AMBER' ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100';
    return (
        <div>
            <SectionHeader title="House Health" />
            <Panel className="mt-3 p-4">
                <div className="flex items-center gap-3">
                    <div className={`grid h-12 w-12 place-items-center rounded-2xl ${tone}`}><Gauge size={22} /></div>
                    <div className="flex-1">
                        <div className="flex items-baseline justify-between"><span className="text-sm font-bold">Состояние дома</span><span className="text-xl font-black">{health.score}</span></div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5"><div className={`h-full rounded-full ${health.state === 'GREEN' ? 'bg-emerald-500' : health.state === 'AMBER' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${health.score}%` }} /></div>
                    </div>
                </div>
                {health.items.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {health.items.slice(0, 6).map(item => (
                            <span key={item.routineId} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.state === 'GREEN' ? 'bg-emerald-50 text-emerald-700' : item.state === 'AMBER' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>{item.title}</span>
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    );
};

const RoutineHistoryWidget = ({ data }: { data: AppData }) => {
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
    const visibleRoutineIds = new Set((data.routines || [])
        .filter(routine => routine.visibility === scope)
        .map(routine => routine.id));
    const events = [...(data.routineEvents || [])]
        .filter(event => visibleRoutineIds.has(event.routineId) && ['COMPLETED', 'SKIPPED', 'UNIT_RECORDED'].includes(event.type))
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 6);
    const timezone = data.family?.settings.timezone || 'UTC';
    return (
        <div>
            <SectionHeader title="История рутин" />
            <Panel className="mt-3 overflow-hidden">
                {events.length === 0 ? <div className="p-5 text-center text-sm text-gray-400">История пока пуста.</div> : events.map(event => {
                    const routine = data.routines?.find(item => item.id === event.routineId);
                    const actor = data.members.find(member => member.id === event.actorId);
                    const detail = event.type === 'COMPLETED'
                        ? `Выполнено${event.xpAwarded ? ` · +${event.xpAwarded} XP` : ''}`
                        : event.type === 'SKIPPED'
                            ? 'Пропущено'
                            : `Накоплено +${event.units || 1}`;
                    return (
                        <div key={event.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600"><History size={17} /></div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold">{routine?.title || 'Рутина'}</div>
                                <div className="truncate text-[11px] text-gray-400">{detail}{actor ? ` · ${actor.name}` : ''}</div>
                            </div>
                            <time className="shrink-0 text-[10px] text-gray-400" dateTime={new Date(event.timestamp).toISOString()}>
                                {new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, day: '2-digit', month: '2-digit' }).format(event.timestamp)}
                            </time>
                        </div>
                    );
                })}
            </Panel>
        </div>
    );
};

const LeaderboardWidget = ({ data }: { data: AppData }) => {
    const members = [...data.members]
        .filter(member => member.isActive !== false)
        .sort((left, right) => right.xp - left.xp || left.name.localeCompare(right.name, 'ru'));
    return (
        <div>
            <SectionHeader title="Лидерборд" />
            <Panel className="mt-3 overflow-hidden">
                {members.map((member, index) => (
                    <div key={member.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl text-sm font-black ${index === 0 ? 'bg-amber-100 text-amber-700' : 'bg-black/[0.035] text-gray-500'}`}>
                            {index === 0 ? <Medal size={18} /> : index + 1}
                        </div>
                        <span className="text-xl" aria-hidden="true">{member.avatar}</span>
                        <div className="min-w-0 flex-1 truncate text-sm font-bold">{member.name}</div>
                        <div className="shrink-0 text-right"><div className="text-sm font-black">{member.xp} XP</div><div className="text-[10px] text-gray-400">уровень {member.level}</div></div>
                    </div>
                ))}
            </Panel>
        </div>
    );
};

type CurrentWeather = {
    temperature: number;
    apparentTemperature?: number;
    weatherCode: number;
    isDay: boolean;
    windSpeed?: number;
    updatedAt: number;
};

const WeatherWidget = ({ onDisable }: { onDisable: () => void }) => {
    const [weather, setWeather] = useState<CurrentWeather>();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        if (!navigator.geolocation) {
            setLoading(false);
            setError('Геопозиция недоступна в этом клиенте Telegram.');
            return () => controller.abort();
        }
        navigator.geolocation.getCurrentPosition(position => {
            const latitude = Math.round(position.coords.latitude * 100) / 100;
            const longitude = Math.round(position.coords.longitude * 100) / 100;
            const query = new URLSearchParams({
                latitude: String(latitude),
                longitude: String(longitude),
                current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
                timezone: 'auto',
                forecast_days: '1'
            });
            void fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: controller.signal })
                .then(async response => {
                    if (!response.ok) throw new Error(`Weather API ${response.status}`);
                    const payload = await response.json() as {
                        current?: {
                            temperature_2m?: unknown;
                            apparent_temperature?: unknown;
                            weather_code?: unknown;
                            is_day?: unknown;
                            wind_speed_10m?: unknown;
                        };
                    };
                    const current = payload.current;
                    const temperature = Number(current?.temperature_2m);
                    const weatherCode = Number(current?.weather_code);
                    if (!Number.isFinite(temperature) || !Number.isFinite(weatherCode)) throw new Error('Invalid weather response');
                    if (!active) return;
                    const apparentTemperature = Number(current?.apparent_temperature);
                    const windSpeed = Number(current?.wind_speed_10m);
                    setWeather({
                        temperature,
                        apparentTemperature: Number.isFinite(apparentTemperature) ? apparentTemperature : undefined,
                        weatherCode,
                        isDay: Number(current?.is_day) === 1,
                        windSpeed: Number.isFinite(windSpeed) ? windSpeed : undefined,
                        updatedAt: Date.now()
                    });
                    setLoading(false);
                })
                .catch(fetchError => {
                    if (!active || controller.signal.aborted) return;
                    setLoading(false);
                    setError(fetchError instanceof Error && fetchError.message.startsWith('Weather API')
                        ? 'Погодный сервис временно недоступен.'
                        : 'Не удалось загрузить погоду.');
                });
        }, geolocationError => {
            if (!active) return;
            setLoading(false);
            setError(geolocationError.code === geolocationError.PERMISSION_DENIED
                ? 'Доступ к геопозиции не разрешён.'
                : 'Не удалось определить приблизительное местоположение.');
        }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 15 * 60 * 1000 });
        return () => {
            active = false;
            controller.abort();
        };
    }, [refreshKey]);

    const condition = weather ? weatherCondition(weather.weatherCode, weather.isDay) : undefined;
    return (
        <div>
            <SectionHeader
                title="Погода"
                action={<button type="button" onClick={onDisable} className="text-xs font-bold text-gray-400">Выключить</button>}
            />
            <Panel className="mt-3 p-4">
                {loading ? (
                    <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-gray-400"><CloudSun size={18} className="animate-pulse" /> Загружаю погоду…</div>
                ) : error ? (
                    <div className="space-y-3 text-center">
                        <p className="text-sm text-gray-500">{error}</p>
                        <button type="button" onClick={() => setRefreshKey(value => value + 1)} className="min-h-10 rounded-xl bg-blue-50 px-4 text-xs font-black text-blue-700">Повторить</button>
                    </div>
                ) : weather && condition ? (
                    <div className="flex items-center gap-4">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-100 text-3xl" aria-hidden="true">{condition.icon}</div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2"><span className="text-2xl font-black">{Math.round(weather.temperature)}°</span><span className="truncate text-sm font-bold text-gray-600">{condition.label}</span></div>
                            <div className="mt-0.5 text-[11px] text-gray-400">Ощущается {Math.round(weather.apparentTemperature ?? weather.temperature)}°{weather.windSpeed == null ? '' : ` · ветер ${Math.round(weather.windSpeed)} км/ч`}</div>
                            <div className="mt-1 text-[9px] text-gray-300">Координаты округлены и не сохраняются · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">Open-Meteo</a></div>
                        </div>
                        <button type="button" onClick={() => setRefreshKey(value => value + 1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-gray-300" aria-label="Обновить погоду"><RefreshCw size={15} /></button>
                    </div>
                ) : null}
            </Panel>
        </div>
    );
};

const weatherCondition = (code: number, isDay: boolean) => {
    if (code === 0) return { label: 'Ясно', icon: isDay ? '☀️' : '🌙' };
    if ([1, 2, 3].includes(code)) return { label: 'Облачно', icon: isDay ? '⛅' : '☁️' };
    if ([45, 48].includes(code)) return { label: 'Туман', icon: '🌫️' };
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Дождь', icon: '🌧️' };
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return { label: 'Снег', icon: '🌨️' };
    if (code >= 95) return { label: 'Гроза', icon: '⛈️' };
    return { label: 'Переменная погода', icon: '🌤️' };
};

const WishlistWidget = ({ data, actions }: { data: AppData; actions: HouseholdActions }) => {
    const lists = data.wishlists || [];
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
    const list = lists.find(item => scope === 'PERSONAL' ? item.visibility === 'PERSONAL' : item.visibility === 'FAMILY');
    const [editingItem, setEditingItem] = useState<Partial<WishlistItem> | null>(null);
    const [creatingList, setCreatingList] = useState(false);
    const createList = async () => {
        setCreatingList(true);
        try {
            await actions.saveWishlist({ title: scope === 'PERSONAL' ? 'Мои желания' : 'Семейные желания', visibility: scope });
        } finally {
            setCreatingList(false);
        }
    };
    return (
        <>
            <div>
                <SectionHeader title={list?.title || 'Желания'} action={list ? <button type="button" onClick={() => setEditingItem({})} className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-blue-600"><Plus size={15} /> Желание</button> : undefined} />
                <Panel className="mt-3 overflow-hidden">
                    {!list ? (
                        <button type="button" disabled={creatingList} onClick={() => void createList()} className="flex min-h-14 w-full items-center justify-center gap-2 p-5 text-sm font-bold text-blue-600 disabled:opacity-45">{creatingList ? <Loader2 size={18} className="animate-spin" /> : <Gift size={18} />} Создать {scope === 'PERSONAL' ? 'личный' : 'семейный'} список</button>
                    ) : list.items.length === 0 ? <div className="p-5 text-center text-sm text-gray-400">Список пока пуст.</div> : list.items.map(item => {
                        const mine = item.ownerId === data.currentUser.id;
                        const reservedByMe = item.reservedById === data.currentUser.id;
                        const priorityTone = item.priority === 'HIGH' ? 'bg-red-50 text-red-600' : item.priority === 'LOW' ? 'bg-gray-50 text-gray-500' : 'bg-amber-50 text-amber-700';
                        return (
                            <div key={item.id} className="flex items-start gap-3 border-b border-black/5 p-3 last:border-0">
                                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-pink-50 text-pink-600"><Gift size={17} /></div>
                                <div className="min-w-0 flex-1">
                                    <button type="button" disabled={!mine} onClick={() => mine && setEditingItem(item)} className="flex max-w-full items-center gap-1.5 text-left disabled:cursor-default">
                                        <span className="truncate text-sm font-bold">{item.title}</span>{mine ? <Pencil size={11} className="shrink-0 text-gray-300" /> : null}
                                    </button>
                                    {item.description ? <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{item.description}</p> : null}
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                                        <span className={`rounded-full px-2 py-0.5 font-bold ${priorityTone}`}>{item.priority === 'HIGH' ? 'Важно' : item.priority === 'LOW' ? 'Можно потом' : 'Обычно'}</span>
                                        <span className="text-gray-400">{mine ? 'Моё · бронь скрыта' : item.reservedById ? 'Уже забронировано' : 'Свободно'}</span>
                                        {item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-bold text-blue-600">Ссылка <ExternalLink size={10} /></a> : null}
                                    </div>
                                </div>
                                {mine ? (
                                    <button type="button" onClick={() => { if (window.confirm(`Удалить желание «${item.title}»?`)) void actions.deleteWishlistItem(list.id, item.id); }} className="grid min-h-11 min-w-11 place-items-center text-gray-300" aria-label={`Удалить ${item.title}`}><Trash2 size={16} /></button>
                                ) : (
                                    <button type="button" disabled={!!item.reservedById && !reservedByMe} onClick={() => void actions.reserveWishlistItem(list.id, item.id, !reservedByMe)} className={`min-h-11 rounded-xl px-3 text-xs font-bold disabled:opacity-45 ${reservedByMe ? 'bg-amber-100 text-amber-800' : 'bg-pink-100 text-pink-700'}`}>
                                        {reservedByMe ? 'Снять бронь' : item.reservedById ? 'Занято' : 'Заберу'}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </Panel>
            </div>
            <Modal isOpen={!!editingItem && !!list} onClose={() => setEditingItem(null)} title={editingItem?.id ? 'Редактировать желание' : 'Новое желание'}>
                {editingItem && list ? <WishlistItemEditor item={editingItem} wishlistId={list.id} currentUserId={data.currentUser.id} onSave={actions.saveWishlistItem} onDone={() => setEditingItem(null)} /> : null}
            </Modal>
        </>
    );
};

const WishlistItemEditor = ({
    item,
    wishlistId,
    currentUserId,
    onSave,
    onDone
}: {
    item: Partial<WishlistItem>;
    wishlistId: string;
    currentUserId: string;
    onSave: HouseholdActions['saveWishlistItem'];
    onDone: () => void;
}) => {
    const [title, setTitle] = useState(item.title || '');
    const [description, setDescription] = useState(item.description || '');
    const [url, setUrl] = useState(item.url || '');
    const [priority, setPriority] = useState<WishlistPriority>(item.priority || 'MEDIUM');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!title.trim()) {
            setError('Укажите название желания.');
            return;
        }
        if (url && !url.startsWith('https://')) {
            setError('Ссылка должна начинаться с https://');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const result = await onSave({
                ...item,
                wishlistId,
                title: title.trim(),
                description: description.trim() || undefined,
                url: url.trim() || undefined,
                priority,
                ownerId: item.ownerId || currentUserId
            });
            if (result !== false) onDone();
        } catch {
            setError('Не удалось сохранить желание. Повторите попытку.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4" aria-label="Редактор желания">
            <label><span className="mb-1.5 block text-[11px] font-black uppercase text-gray-400">Название</span><input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} autoFocus className="w-full rounded-xl border border-black/10 px-3 py-3 text-sm" /></label>
            <label><span className="mb-1.5 block text-[11px] font-black uppercase text-gray-400">Описание</span><textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={1000} rows={4} className="w-full rounded-xl border border-black/10 px-3 py-3 text-sm" /></label>
            <label><span className="mb-1.5 block text-[11px] font-black uppercase text-gray-400">Ссылка</span><input type="url" inputMode="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…" className="w-full rounded-xl border border-black/10 px-3 py-3 text-sm" /></label>
            <fieldset><legend className="mb-1.5 block text-[11px] font-black uppercase text-gray-400">Приоритет</legend><div className="grid grid-cols-3 gap-2">{([['LOW', 'Можно потом'], ['MEDIUM', 'Обычно'], ['HIGH', 'Важно']] as const).map(([value, label]) => <button type="button" key={value} onClick={() => setPriority(value)} aria-pressed={priority === value} className={`min-h-11 rounded-xl px-2 text-xs font-black ${priority === value ? 'bg-pink-100 text-pink-800' : 'bg-black/5 text-gray-500'}`}>{label}</button>)}</div></fieldset>
            {error ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
            <button type="submit" disabled={saving} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 text-sm font-black text-white disabled:opacity-45">{saving ? <Loader2 size={17} className="animate-spin" /> : null}{item.id ? 'Сохранить' : 'Добавить желание'}</button>
        </form>
    );
};
