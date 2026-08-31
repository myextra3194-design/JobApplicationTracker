export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

export interface ToastQueue {
  readonly getSnapshot: () => readonly Toast[];
  readonly push: (message: string, tone?: ToastTone, durationMs?: number) => string | null;
  readonly dismiss: (id: string) => void;
  readonly clear: () => void;
  readonly subscribe: (listener: () => void) => () => void;
}

type TimerHandle = ReturnType<typeof setTimeout>;

/**
 * Make an in-memory toast queue. It has no storage side effects: the queue is
 * only a small event source for the mounted ToastHost. Keeping construction
 * separate makes the de-dupe and expiry rules easy to test in isolation.
 */
export function createToastQueue(defaultDurationMs = 4_500): ToastQueue {
  let entries: Toast[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();
  const timers = new Map<string, TimerHandle>();

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function dismiss(id: string): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) return;
    entries = next;
    notify();
  }

  function push(message: string, tone: ToastTone = 'success', durationMs = defaultDurationMs): string | null {
    const clean = message.trim();
    if (clean === '') return null;

    // The same confirmation can be emitted by two quick UI paths (for example,
    // a repeated import). Keep one visible message rather than stacking noise.
    const existing = entries.find((entry) => entry.message === clean);
    if (existing) return existing.id;

    sequence += 1;
    const id = `toast-${sequence}`;
    entries = [...entries, { id, message: clean, tone }];
    if (durationMs > 0) {
      timers.set(id, setTimeout(() => dismiss(id), durationMs));
    }
    notify();
    return id;
  }

  function clear(): void {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    if (entries.length === 0) return;
    entries = [];
    notify();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    getSnapshot: () => entries,
    push,
    dismiss,
    clear,
    subscribe,
  };
}

/** The one application queue. It is intentionally not persisted. */
export const toastQueue = createToastQueue();

export function pushToast(message: string, tone: ToastTone = 'success', durationMs?: number): string | null {
  return toastQueue.push(message, tone, durationMs);
}

export function dismissToast(id: string): void {
  toastQueue.dismiss(id);
}
