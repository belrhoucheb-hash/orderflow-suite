// Gedeelde vehicle-config voor de vloot-pagina's. Kleuren volgen het
// luxe/gold-palet (emerald voor beschikbaar, amber voor onderhoud,
// rose voor defect, gold-deep voor onderweg).

export const TYPE_LABELS: Record<string, string> = {
  busje: "Busje",
  bakwagen: "Bakwagen",
  koelwagen: "Koelwagen",
  trekker: "Trekker",
};

export const TYPE_ORDER = ["busje", "bakwagen", "koelwagen", "trekker"];

export const STATUS_CONFIG: Record<string, { label: string; dotClass: string; textClass: string }> = {
  beschikbaar: {
    label: "Beschikbaar",
    dotClass: "bg-emerald-500",
    textClass: "text-emerald-700",
  },
  onderweg: {
    label: "Onderweg",
    dotClass: "bg-[hsl(var(--gold-deep))]",
    textClass: "text-[hsl(var(--gold-deep))]",
  },
  onderhoud: {
    label: "Onderhoud",
    dotClass: "bg-amber-500",
    textClass: "text-amber-700",
  },
  defect: {
    label: "Defect",
    dotClass: "bg-rose-500",
    textClass: "text-rose-700",
  },
};
