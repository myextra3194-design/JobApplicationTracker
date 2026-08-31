import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createToastQueue } from './toast';

describe('toast queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a toast and notifies subscribers', () => {
    const queue = createToastQueue(1000);
    let notifications = 0;
    const unsubscribe = queue.subscribe(() => {
      notifications += 1;
    });

    const id = queue.push('Saved.', 'success');

    expect(id).toBeTruthy();
    expect(queue.getSnapshot()).toEqual([{ id, message: 'Saved.', tone: 'success' }]);
    expect(notifications).toBe(1);
    unsubscribe();
    queue.clear();
  });

  it('deduplicates repeated messages while they are visible', () => {
    const queue = createToastQueue(1000);
    const first = queue.push('Export complete.', 'success');
    const second = queue.push('Export complete.', 'warning');

    expect(second).toBe(first);
    expect(queue.getSnapshot()).toHaveLength(1);
    queue.clear();
  });

  it('ignores blank messages', () => {
    const queue = createToastQueue(1000);

    expect(queue.push('   ')).toBeNull();
    expect(queue.getSnapshot()).toEqual([]);
    queue.clear();
  });

  it('auto-expires and clears its timer when dismissed', () => {
    const queue = createToastQueue(1000);
    queue.push('Temporary.', 'info');
    vi.advanceTimersByTime(999);
    expect(queue.getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(queue.getSnapshot()).toEqual([]);

    const second = queue.push('Dismiss me.', 'info');
    queue.dismiss(second ?? '');
    vi.advanceTimersByTime(5000);
    expect(queue.getSnapshot()).toEqual([]);
    queue.clear();
  });

  it('dismisses one item without clearing the rest', () => {
    const queue = createToastQueue(1000);
    const first = queue.push('First.');
    const second = queue.push('Second.');

    queue.dismiss(first ?? '');

    expect(queue.getSnapshot().map((toast) => toast.message)).toEqual(['Second.']);
    queue.clear();
    expect(second).toBeTruthy();
  });
});
