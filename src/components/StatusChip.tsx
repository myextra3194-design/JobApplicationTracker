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
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${tone.chip} ${className}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${tone.dot}`} />
      {status}
    </span>
  );
}
