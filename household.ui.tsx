import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Check,
    CirclePause,
    CloudSun,
    Gauge,
    Gift,
    HeartPulse,
    History,
    ListPlus,
    Medal,
    Minus,
    PackagePlus,
    Plus,
    RefreshCw,
    Settings2,
    SkipForward,
    X
} from 'lucide-react';
import type { AppData, DashboardPreferences } from './types';
import type { RoutinePresetId, RoutineTemplate } from './routines.model';
import type { Wishlist, WishlistItem } from './wishlist.model';
import { Panel, SectionHeader } from './ui-kit';
import { formatMoney } from './utils';

const DASHBOARD_WIDGETS = ['routines', 'day-pulse', 'house-health', 'history', 'leaderboard', 'projects', 'activity', 'notes', 'weather', 'wishlists'] as const;
type DashboardWidget = typeof DASHBOARD_WIDGETS[number];

const WIDGET_LABELS: Record<DashboardWidget, string> = {
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

const PRESETS: Array<{ id: RoutinePresetId; icon: string; label: string }> = [
    { id: 'TRASH', icon: '🗑️', label: 'Мусор' },
    { id: 'DISHWASHER', icon: '🍽️', label: 'Посуда' },
    { id: 'PETS', icon: '🐾', label: 'Питомцы' },
    { id: 'CLEANING', icon: '🧹', label: 'Уборка' },
    { id: 'LAUNDRY', icon: '🧺', label: 'Стирка' },
    { id: 'PLANTS', icon: '🪴', label: 'Растения' },
    { id: 'GROCERIES', icon: '🛒', label: 'Продукты' }
];

interface HouseholdActions {
    saveRoutine: (routine: Partial<RoutineTemplate> & { presetId?: string }) => void;
    pauseRoutine: (routineId: string, paused: boolean) => void;
    completeRoutine: (routineId: string, taskId?: string, units?: number) => void;
    recordRoutineUnit: (routineId: string, units?: number) => void;
    skipRoutine: (routineId: string) => void;
    savePreferences: (preferences: Partial<DashboardPreferences>) => void;
    saveWishlist: (wishlist: Partial<Wishlist>) => void;
    saveWishlistItem: (item: Partial<WishlistItem> & { wishlistId: string }) => void;
    deleteWishlistItem: (wishlistId: string, itemId: string) => void;
    reserveWishlistItem: (wishlistId: string, itemId: string, reserved: boolean) => void;
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
        hiddenWidgets: [],
        widgetOrder: [],
        weatherOptIn: false
    };
    const [customizing, setCustomizing] = useState(false);
    const order = useMemo(() => {
        const configured = preferences.widgetOrder.filter((widget): widget is DashboardWidget => (
            DASHBOARD_WIDGETS.includes(widget as DashboardWidget)
        ));
        return [...configured, ...DASHBOARD_WIDGETS.filter(widget => !configured.includes(widget))];
    }, [preferences.widgetOrder]);
    const hidden = new Set(preferences.hiddenWidgets);
    const updatePreferences = (patch: Partial<DashboardPreferences>) => actions.savePreferences({ ...preferences, ...patch });
    const moveWidget = (widget: DashboardWidget, offset: -1 | 1) => {
        const index = order.indexOf(widget);
        const target = index + offset;
        if (target < 0 || target >= order.length) return;
        const next = [...order];
        [next[index], next[target]] = [next[target], next[index]];
        updatePreferences({ widgetOrder: next });
    };
    const toggleWidget = (widget: DashboardWidget) => {
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

    const widgets: Record<DashboardWidget, React.ReactNode> = {
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
    const [title, setTitle] = useState('');
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
    const routines = (data.routines || [])
        .filter(routine => scope === 'PERSONAL' ? routine.visibility === 'PERSONAL' : routine.visibility === 'FAMILY')
        .sort((left, right) => (left.nextOccurrenceDate || '9999').localeCompare(right.nextOccurrenceDate || '9999'));
    const addCustom = (event: React.FormEvent) => {
        event.preventDefault();
        if (!title.trim()) return;
        actions.saveRoutine({
            title: title.trim(),
            kind: 'SCHEDULED',
            schedule: { kind: 'DAILY' },
            assignmentMode: 'FREE',
            visibility: scope
        });
        setTitle('');
    };

    return (
        <div>
            <SectionHeader
                title="Рутины сегодня"
                action={<button type="button" onClick={() => setShowPresets(value => !value)} className="inline-flex items-center gap-1 text-sm font-bold text-blue-600"><Plus size={15} /> Добавить</button>}
            />
            {showPresets && (
                <Panel className="mt-3 p-3">
                    <div className="no-scrollbar -mx-1 flex snap-x-app gap-2 overflow-x-auto px-1 pb-2">
                        {PRESETS.map(preset => (
                            <button
                                type="button"
                                key={preset.id}
                                onClick={() => actions.saveRoutine({ presetId: preset.id, assignmentMode: 'FREE', visibility: scope })}
                                className="min-w-[88px] snap-start rounded-2xl border border-black/5 bg-white/60 p-3 text-center text-xs font-bold active:scale-95"
                            >
                                <span className="mb-1 block text-2xl" aria-hidden="true">{preset.icon}</span>
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <form onSubmit={addCustom} className="mt-2 flex gap-2">
                        <label className="sr-only" htmlFor="routine-title">Название рутины</label>
                        <input id="routine-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="Своя ежедневная рутина" className="min-w-0 flex-1 rounded-xl border border-black/10 bg-white/70 px-3 text-sm outline-none focus:border-blue-400" />
                        <button type="submit" disabled={!title.trim()} className="grid h-11 w-11 place-items-center rounded-xl bg-gray-950 text-white disabled:opacity-35" aria-label="Создать рутину"><ListPlus size={18} /></button>
                    </form>
                </Panel>
            )}
            <Panel className="mt-3 overflow-hidden">
                {routines.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-400">В этом режиме рутин пока нет.</div>
                ) : routines.map(routine => {
                    const task = data.tasks.find(item => item.id === routine.openTaskId);
                    return (
                        <div key={routine.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${routine.kind === 'ACCUMULATOR' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                {routine.kind === 'ACCUMULATOR' ? <PackagePlus size={19} /> : <HeartPulse size={19} />}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-bold">{routine.title}</div>
                                <div className="mt-0.5 text-[11px] text-gray-500">
                                    {routine.paused
                                        ? 'На паузе'
                                        : routine.kind === 'ACCUMULATOR'
                                            ? `${routine.accumulatedUnits} ${routine.unitLabel || 'ед.'} · серия ${routine.streak}`
                                            : `${routine.nextOccurrenceDate || 'Без следующей даты'} · серия ${routine.streak}`}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {routine.kind === 'ACCUMULATOR' && !routine.paused && (
                                    <button type="button" onClick={() => actions.recordRoutineUnit(routine.id, 1)} className="grid h-9 min-w-9 place-items-center rounded-xl bg-amber-100 px-2 text-xs font-black text-amber-800" aria-label={`Добавить ${routine.unitLabel || 'единицу'}`}>+1</button>
                                )}
                                {!routine.paused && (routine.kind === 'SCHEDULED' || routine.accumulatedUnits > 0) && (
                                    <button type="button" onClick={() => actions.completeRoutine(routine.id, task?.id, routine.kind === 'ACCUMULATOR' ? routine.accumulatedUnits : undefined)} className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-100 text-emerald-700" aria-label={`Завершить ${routine.title}`}><Check size={17} /></button>
                                )}
                                <button type="button" onClick={() => actions.pauseRoutine(routine.id, !routine.paused)} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400" aria-label={routine.paused ? `Возобновить ${routine.title}` : `Поставить на паузу ${routine.title}`}>
                                    {routine.paused ? <Plus size={16} /> : <CirclePause size={16} />}
                                </button>
                                {routine.kind === 'SCHEDULED' && !routine.paused && (
                                    <button type="button" onClick={() => actions.skipRoutine(routine.id)} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400" aria-label={`Пропустить ${routine.title}`}><SkipForward size={16} /></button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </Panel>
        </div>
    );
};

const DayPulseWidget = ({ data }: { data: AppData }) => {
    const summary = data.routineSummary;
    const timezone = data.family?.settings.timezone || 'UTC';
    const today = dateKeyInTimezone(Date.now(), timezone);
    const scope = data.dashboardPreferences?.scope || 'FAMILY';
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
    const health = data.routineSummary?.houseHealth;
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
    const [title, setTitle] = useState('');
    const createList = () => actions.saveWishlist({ title: scope === 'PERSONAL' ? 'Мои желания' : 'Семейные желания', visibility: scope });
    const addWish = (event: React.FormEvent) => {
        event.preventDefault();
        if (!list || !title.trim()) return;
        actions.saveWishlistItem({ wishlistId: list.id, title: title.trim(), ownerId: data.currentUser.id, priority: 'MEDIUM' });
        setTitle('');
    };
    return (
        <div>
            <SectionHeader title="Желания" />
            <Panel className="mt-3 overflow-hidden">
                {!list ? (
                    <button type="button" onClick={createList} className="flex w-full items-center justify-center gap-2 p-5 text-sm font-bold text-blue-600"><Gift size={18} /> Создать список желаний</button>
                ) : (
                    <>
                        <form onSubmit={addWish} className="flex gap-2 border-b border-black/5 p-3">
                            <label className="sr-only" htmlFor="wish-title">Новое желание</label>
                            <input id="wish-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder="Что хотелось бы?" className="min-w-0 flex-1 rounded-xl bg-black/[0.035] px-3 text-sm outline-none focus:ring-2 focus:ring-blue-200" />
                            <button type="submit" disabled={!title.trim()} className="grid h-10 w-10 place-items-center rounded-xl bg-gray-950 text-white disabled:opacity-35" aria-label="Добавить желание"><Plus size={17} /></button>
                        </form>
                        {list.items.length === 0 ? <div className="p-5 text-center text-sm text-gray-400">Список пока пуст.</div> : list.items.map(item => {
                            const mine = item.ownerId === data.currentUser.id;
                            const reservedByMe = item.reservedById === data.currentUser.id;
                            return (
                                <div key={item.id} className="flex items-center gap-3 border-b border-black/5 p-3 last:border-0">
                                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-pink-50 text-pink-600"><Gift size={17} /></div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-bold">{item.title}</div>
                                        <div className="text-[11px] text-gray-400">{mine ? 'Моё желание · бронь скрыта' : item.reservedById ? 'Уже забронировано' : 'Свободно'}</div>
                                    </div>
                                    {mine ? (
                                        <button type="button" onClick={() => actions.deleteWishlistItem(list.id, item.id)} className="grid h-9 w-9 place-items-center text-gray-300" aria-label={`Удалить ${item.title}`}><Minus size={16} /></button>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={!!item.reservedById && !reservedByMe}
                                            onClick={() => actions.reserveWishlistItem(list.id, item.id, !reservedByMe)}
                                            className={`min-h-9 rounded-xl px-3 text-xs font-bold disabled:opacity-45 ${reservedByMe ? 'bg-amber-100 text-amber-800' : 'bg-pink-100 text-pink-700'}`}
                                        >
                                            {reservedByMe ? 'Снять бронь' : item.reservedById ? 'Занято' : 'Заберу'}
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </>
                )}
            </Panel>
        </div>
    );
};
