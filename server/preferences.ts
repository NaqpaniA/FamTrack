import {
    DASHBOARD_WIDGET_IDS,
    DEFAULT_DASHBOARD_HIDDEN_WIDGETS,
    type AppData,
    type DashboardPreferences,
    type DashboardWidgetId
} from '../types.js';
import type { User } from '../family.model.js';
import { DomainError } from './domain.js';

const KNOWN_WIDGETS = new Set<string>(DASHBOARD_WIDGET_IDS);

export const updateDashboardPreferences = (data: AppData, raw: unknown, actor: User): AppData => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new DomainError('Preferences payload is required');
    const input = raw as Record<string, unknown>;
    const previous = data.dashboardPreferences || {
        userId: actor.id,
        scope: 'FAMILY' as const,
        hiddenWidgets: [...DEFAULT_DASHBOARD_HIDDEN_WIDGETS],
        widgetOrder: [],
        weatherOptIn: false
    };
    const normalizeWidgets = (value: unknown, fallback: DashboardWidgetId[]) => Array.isArray(value)
        ? [...new Set(value.filter((item): item is DashboardWidgetId => typeof item === 'string' && KNOWN_WIDGETS.has(item)))]
        : fallback;
    const preferences: DashboardPreferences = {
        userId: actor.id,
        scope: input.scope === 'PERSONAL' || input.scope === 'FAMILY' ? input.scope : previous.scope,
        hiddenWidgets: normalizeWidgets(input.hiddenWidgets, previous.hiddenWidgets),
        widgetOrder: normalizeWidgets(input.widgetOrder, previous.widgetOrder),
        weatherOptIn: typeof input.weatherOptIn === 'boolean' ? input.weatherOptIn : previous.weatherOptIn
    };
    return { ...data, dashboardPreferences: preferences };
};
