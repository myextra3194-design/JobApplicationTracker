import { tagColor } from '../lib/tagColor';

interface TagChipProps {
  tag: string;
  className?: string;
  onRemove?: () => void;
}

/** One visual language for tags in the list, board, archive and form. */
export function TagChip({ tag, className = '', onRemove }: TagChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] leading-tight ${tagColor(tag)} ${className}`}
    >
      <span className="max-w-40 truncate">{tag || '—'}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded-full px-0.5 text-current opacity-70 hover:opacity-100"
          aria-label={`Remove tag ${tag}`}
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
