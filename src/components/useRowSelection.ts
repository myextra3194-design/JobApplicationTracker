import { useEffect, useMemo, useState } from 'react';
import type { JobApplication } from '../lib/types';

/**
 * Part 10: checkbox selection shared by the List View table and the Archived
 * tab table. The selection is keyed by record id; whenever the visible rows
 * change (search, filter, sort, an action completing) the ids that are no
 * longer present are pruned, so the "N selected" count and the header
 * checkbox can never reference a row the table doesn't show.
 */
export function useRowSelection(rows: readonly JobApplication[]) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const visible = new Set(rows.map((row) => row.id));
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [rows]);

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const count = useMemo(() => visibleIds.filter((id) => selectedIds.has(id)).length, [visibleIds, selectedIds]);
  const allSelected = rows.length > 0 && count === rows.length;
  const someSelected = count > 0 && !allSelected;

  function toggle(id: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    setSelectedIds((current) => {
      const everyVisible = visibleIds.every((id) => current.has(id));
      if (everyVisible) return new Set();
      return new Set(visibleIds);
    });
  }

  function clear(): void {
    setSelectedIds(new Set());
  }

  return { selectedIds, count, allSelected, someSelected, toggle, toggleAll, clear };
}
