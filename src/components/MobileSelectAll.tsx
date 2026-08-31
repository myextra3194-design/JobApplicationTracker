interface MobileSelectAllProps {
  count: number;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  label?: string;
}

/**
 * Card lists have no table header to host select-all. Keep the same control at
 * the top of the card list so bulk actions remain discoverable on narrow screens.
 */
export function MobileSelectAll({
  count,
  allSelected,
  someSelected,
  onToggleAll,
  label = 'applications',
}: MobileSelectAllProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-2.5 shadow-sm sm:hidden">
      <label className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(element) => {
            if (element) element.indeterminate = someSelected;
          }}
          onChange={onToggleAll}
          aria-label={allSelected ? `Deselect all ${label}` : `Select all ${label}`}
          className="size-4 shrink-0 accent-[#6d28d9]"
        />
        <span>{allSelected ? 'Clear selection' : 'Select all'}</span>
      </label>
      <span className="shrink-0 font-mono text-[11px] text-muted">
        {count} {count === 1 ? 'item' : 'items'}
      </span>
    </div>
  );
}
