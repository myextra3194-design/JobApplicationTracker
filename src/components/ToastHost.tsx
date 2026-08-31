import { useEffect, useSyncExternalStore } from 'react';
import { dismissToast, toastQueue, type ToastTone } from '../lib/toast';

const TONE_CLASS: Record<ToastTone, string> = {
  success: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  info: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  warning: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  error: 'border-red-500/40 bg-red-500/10 text-red-100',
};

/** React bridge for the small in-memory queue in `lib/toast.ts`. */
export function useToasts() {
  return useSyncExternalStore(toastQueue.subscribe, toastQueue.getSnapshot, toastQueue.getSnapshot);
}

/** Mounted once by App; cleanup also clears every pending expiry timer. */
export function ToastHost() {
  const toasts = useToasts();

  useEffect(() => {
    return () => {
      toastQueue.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:inset-x-auto sm:right-5 sm:w-96">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm shadow-2xl backdrop-blur ${TONE_CLASS[toast.tone]}`}
        >
          <span className="min-w-0 flex-1 leading-relaxed">{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss notification"
            className="shrink-0 rounded-md px-1 text-current opacity-70 transition hover:bg-white/10 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
