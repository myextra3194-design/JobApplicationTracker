// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, DEFAULT_WEEKLY_GOAL, LocalSettingsStore } from './localSettingsStore';

/**
 * The settings document is the persistence seam for both the weekly goal and
 * the light/dark theme. These tests keep that shape honest without touching
 * the real `jat.settings.v1` document.
 */
describe('LocalSettingsStore theme aware settings', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('defaults to dark when no settings document exists', async () => {
    const store = new LocalSettingsStore('jat.settings.test.defaults');
    const settings = await store.get();
    expect(settings.theme).toBe(DEFAULT_THEME);
    expect(settings.weeklyGoal).toBe(DEFAULT_WEEKLY_GOAL);
  });

  it('loads a legacy document that has no theme field safely', async () => {
    const key = 'jat.settings.test.legacy';
    globalThis.localStorage.setItem(key, JSON.stringify({ weeklyGoal: 9 }));
    const store = new LocalSettingsStore(key);
    const settings = await store.get();
    expect(settings.theme).toBe('dark');
    expect(settings.weeklyGoal).toBe(9);
  });

  it('persists theme without resetting weeklyGoal', async () => {
    const store = new LocalSettingsStore('jat.settings.test.roundtrip');
    await store.set({ theme: 'light' });
    const light = await store.get();
    expect(light.theme).toBe('light');
    expect(light.weeklyGoal).toBe(DEFAULT_WEEKLY_GOAL);

    await store.set({ weeklyGoal: 8 });
    const withGoal = await store.get();
    expect(withGoal.theme).toBe('light');
    expect(withGoal.weeklyGoal).toBe(8);
  });

  it('normalises an unknown theme and an out-of-range goal', async () => {
    const store = new LocalSettingsStore('jat.settings.test.normalise');
    await store.set({ theme: 'sepia' as unknown as 'dark', weeklyGoal: 500 });
    const settings = await store.get();
    expect(settings.theme).toBe('dark');
    expect(settings.weeklyGoal).toBe(99);
  });
});
