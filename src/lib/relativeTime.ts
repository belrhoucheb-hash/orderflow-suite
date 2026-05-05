// Korte NL-relatieve-tijd voor inbox/lijsten.
// < 1u  -> "zojuist"
// < 72u -> "{n}u geleden"
// < 14d -> "{n}d geleden"
// >= 14d -> "{d} {mnd}" (bv. "14 apr"); ander jaar -> "{d} {mnd} {jjjj}"

const MAANDEN_KORT = [
  "jan", "feb", "mrt", "apr", "mei", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

export function formatRelativeNl(input: string | Date | null | undefined): string {
  if (!input) return "";
  const date = typeof input === "string" ? new Date(input) : input;
  const ms = date.getTime();
  if (Number.isNaN(ms)) return "";

  const diffMs = Date.now() - ms;
  const hours = Math.floor(diffMs / 3_600_000);

  if (hours < 1) return "zojuist";
  if (hours < 72) return `${hours}u geleden`;

  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d geleden`;

  const d = date.getDate();
  const m = MAANDEN_KORT[date.getMonth()];
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    ? `${d} ${m}`
    : `${d} ${m} ${date.getFullYear()}`;
}
