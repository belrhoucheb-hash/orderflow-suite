// Categorie-specifieke empty-states voor de marketplace.
//
// Eigen, simpele inline SVG's. Bewust geometrisch zodat ze passen bij
// de luxe-laag (gold-accent) en geen externe assets vereisen.

import type { ConnectorCategory } from "@/lib/connectors/catalog";

interface Props {
  category: ConnectorCategory | "alle";
  query?: string;
  onClear: () => void;
}

const CATEGORY_LABELS_FOR_EMPTY: Record<ConnectorCategory | "alle", string> = {
  alle: "koppelingen",
  boekhouding: "Boekhouding-koppelingen",
  telematica: "Telematica-koppelingen",
  communicatie: "Communicatie-koppelingen",
  webshop_erp: "Webshop & ERP-koppelingen",
  klantportaal: "Klantportaal-koppelingen",
  overig: "koppelingen",
};

export function EmptyStateIllustration({ category, query, onClear }: Props) {
  const label = CATEGORY_LABELS_FOR_EMPTY[category];
  const headline = query
    ? `Geen ${label} matchen je zoekterm`
    : `Geen ${label} gevonden`;
  const sub = query
    ? "Probeer een andere zoekterm of wis het filter."
    : "Probeer een andere categorie of wis het filter.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[hsl(var(--gold)/0.18)] bg-gradient-to-br from-white to-[hsl(var(--gold-soft)/0.2)] p-12 text-center"
    >
      <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center">
        <CategoryArt category={category} />
      </div>
      <p className="text-base font-display font-semibold text-foreground">{headline}</p>
      <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
      <button
        type="button"
        onClick={onClear}
        className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-full border border-[hsl(var(--gold)/0.3)] bg-white px-4 text-xs font-display font-semibold text-[hsl(var(--gold-deep))] transition-all hover:border-[hsl(var(--gold)/0.5)] hover:bg-[hsl(var(--gold-soft)/0.4)]"
      >
        Wis filter
      </button>
    </div>
  );
}

function CategoryArt({ category }: { category: ConnectorCategory | "alle" }) {
  switch (category) {
    case "boekhouding":
      return <NotebookArt />;
    case "telematica":
      return <GpsArt />;
    case "communicatie":
      return <ChatArt />;
    case "webshop_erp":
      return <CartArt />;
    default:
      return <GenericArt />;
  }
}

const STROKE = "hsl(var(--gold-deep))";
const FILL = "hsl(var(--gold-soft))";

function NotebookArt() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="20" y="14" width="56" height="68" rx="6" fill={FILL} stroke={STROKE} strokeWidth="2" />
      <line x1="20" y1="26" x2="76" y2="26" stroke={STROKE} strokeWidth="1.5" />
      <line x1="32" y1="40" x2="64" y2="40" stroke={STROKE} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <line x1="32" y1="50" x2="56" y2="50" stroke={STROKE} strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <line x1="32" y1="60" x2="60" y2="60" stroke={STROKE} strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      <circle cx="26" cy="20" r="1.6" fill={STROKE} />
      <circle cx="26" cy="46" r="1.6" fill={STROKE} />
      <circle cx="26" cy="56" r="1.6" fill={STROKE} />
      <circle cx="26" cy="66" r="1.6" fill={STROKE} />
      <path d="M64 70l4 4 8-10" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GpsArt() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="48" cy="48" r="34" fill={FILL} opacity="0.5" />
      <circle cx="48" cy="48" r="22" fill="none" stroke={STROKE} strokeWidth="2" opacity="0.6" />
      <circle cx="48" cy="48" r="10" fill="none" stroke={STROKE} strokeWidth="2" />
      <circle cx="48" cy="48" r="3" fill={STROKE} />
      <line x1="48" y1="14" x2="48" y2="22" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="48" y1="74" x2="48" y2="82" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="14" y1="48" x2="22" y2="48" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="74" y1="48" x2="82" y2="48" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ChatArt() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M14 26a8 8 0 0 1 8-8h36a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H32l-12 10v-10h-6a0 0 0 0 1 0 0V26z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M44 50a8 8 0 0 1 8-8h22a8 8 0 0 1 8 8v14a8 8 0 0 1-8 8h-2v8l-10-8H52a8 8 0 0 1-8-8V50z"
        fill="white"
        stroke={STROKE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="34" r="2" fill={STROKE} />
      <circle cx="40" cy="34" r="2" fill={STROKE} />
      <circle cx="50" cy="34" r="2" fill={STROKE} />
    </svg>
  );
}

function CartArt() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 22h10l4 8" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M28 30h54l-6 28H38l-10-28z"
        fill={FILL}
        stroke={STROKE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line x1="42" y1="40" x2="42" y2="50" stroke={STROKE} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="55" y1="40" x2="55" y2="50" stroke={STROKE} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <line x1="68" y1="40" x2="68" y2="50" stroke={STROKE} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <circle cx="40" cy="74" r="5" fill="white" stroke={STROKE} strokeWidth="2" />
      <circle cx="70" cy="74" r="5" fill="white" stroke={STROKE} strokeWidth="2" />
    </svg>
  );
}

function GenericArt() {
  return (
    <svg viewBox="0 0 96 96" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="48" cy="48" r="32" fill={FILL} opacity="0.5" />
      <circle cx="48" cy="48" r="22" fill="none" stroke={STROKE} strokeWidth="2" />
      <line x1="65" y1="65" x2="80" y2="80" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
