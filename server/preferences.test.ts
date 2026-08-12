import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_DATA } from '../data.js';
import { DEFAULT_DASHBOARD_HIDDEN_WIDGETS } from '../types.js';
import type { AppData } from '../types.js';
import { updateDashboardPreferences } from './preferences.js';

const cloneData = () => JSON.parse(JSON.stringify(INITIAL_DATA)) as AppData;

test('new dashboard preferences start with only the compact core enabled', () => {
    const data = cloneData();
    data.dashboardPreferences = undefined;
    const updated = updateDashboardPreferences(data, { scope: 'PERSONAL' }, data.currentUser);
    assert.equal(updated.dashboardPreferences?.scope, 'PERSONAL');
    assert.deepEqual(updated.dashboardPreferences?.hiddenWidgets, DEFAULT_DASHBOARD_HIDDEN_WIDGETS);
    assert.ok(updated.dashboardPreferences?.hiddenWidgets.includes('wishlists'));
});

test('preference patches preserve saved widget choices and accept wishlists as a shared id', () => {
    const data = cloneData();
    data.dashboardPreferences = {
        userId: data.currentUser.id,
        scope: 'FAMILY',
        hiddenWidgets: ['notes'],
        widgetOrder: ['wishlists', 'routines'],
        weatherOptIn: true
    };
    const scoped = updateDashboardPreferences(data, { scope: 'PERSONAL' }, data.currentUser);
    assert.deepEqual(scoped.dashboardPreferences?.hiddenWidgets, ['notes']);
    assert.deepEqual(scoped.dashboardPreferences?.widgetOrder, ['wishlists', 'routines']);
    assert.equal(scoped.dashboardPreferences?.weatherOptIn, true);

    const normalized = updateDashboardPreferences(scoped, { widgetOrder: ['wishlists', 'unknown', 'day-pulse'] }, data.currentUser);
    assert.deepEqual(normalized.dashboardPreferences?.widgetOrder, ['wishlists', 'day-pulse']);
});
