import { STATUS_TONE } from '../lib/pipeline';
import type { ApplicationStatus } from '../lib/types';

interface StatusChipProps {
  status: ApplicationStatus;
  className?: string;
}

/** Shared status treatment for rows, cards and dashboard items. */
export function StatusChip({ status, className = '' }: StatusChipProps) {
  const tone = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-black/5 px-2.5 py-0.5 text-[11px] font-medium shadow-sm dark:border-white/10 ${tone.chip} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
      {status}
    </span>
  );
}
