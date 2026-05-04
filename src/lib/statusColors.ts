// ─── Centralized Order Status Colors ────────────────────────
// Single source of truth for all status-related styling.
// ─────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  DRAFT: { bg: 'bg-blue-500/8', text: 'text-blue-700', dot: 'bg-blue-500', label: 'Concept' },
  PENDING: { bg: 'bg-amber-500/8', text: 'text-amber-700', dot: 'bg-amber-500', label: 'In behandeling' },
  CONFIRMED: { bg: 'bg-amber-500/8', text: 'text-amber-700', dot: 'bg-amber-500', label: 'In behandeling' },
  PLANNED: { bg: 'bg-violet-500/8', text: 'text-violet-700', dot: 'bg-violet-500', label: 'Ingepland' },
  IN_TRANSIT: { bg: 'bg-primary/8', text: 'text-primary', dot: 'bg-primary', label: 'Onderweg' },
  DELIVERED: { bg: 'bg-emerald-500/8', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Afgeleverd' },
  CANCELLED: { bg: 'bg-muted', text: 'text-muted-foreground', dot: 'bg-muted-foreground/40', label: 'Geannuleerd' },
};

export function getStatusColor(status: string) {
  return STATUS_COLORS[status] || STATUS_COLORS.DRAFT;
}

export function getStatusStyle(status: string): string {
  const c = getStatusColor(status);
  return `${c.bg} ${c.text}`;
}
