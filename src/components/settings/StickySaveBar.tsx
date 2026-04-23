import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void | Promise<void>;
  onRevert: () => void;
  /**
   * Label getoond links. Standaard "Niet-opgeslagen wijzigingen".
   * Geef een specifieker label mee als de context er is, bv.
   * "Branding heeft niet-opgeslagen wijzigingen".
   */
  label?: string;
}

/**
 * Goud-getinte save-bar die midden-onderaan verschijnt zodra er
 * onbewaarde wijzigingen zijn. Bevat een Annuleren- en een Opslaan-knop
 * zodat de admin ook zonder te scrollen kan saven of reverten. Blijft
 * zichtbaar tot de state weer schoon is.
 *
 * De bar registreert ook een beforeunload-listener zolang dirty=true,
 * zodat de browser "je hebt onopgeslagen wijzigingen"-waarschuwing
 * toont bij tab-sluiten.
 */
export function StickySaveBar({ dirty, saving, onSave, onRevert, label }: Props) {
  const [mounted, setMounted] = useState(dirty);

  // Houd de bar een korte periode na dirty=false gemount voor een nette fade-out.
  useEffect(() => {
    if (dirty) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), 180);
    return () => clearTimeout(t);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Vereist door sommige browsers
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed bottom-6 left-1/2 z-40 -translate-x-1/2 transition-all duration-200",
        dirty ? "translate-y-0 opacity-100" : "translate-y-2 pointer-events-none opacity-0",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className="card--luxe flex items-center gap-3 px-4 py-2.5 shadow-xl"
        style={{ borderColor: "hsl(var(--gold) / 0.45)" }}
      >
        <span className="inline-flex items-center gap-2 text-sm text-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
          {label ?? "Niet-opgeslagen wijzigingen"}
        </span>
        <button
          type="button"
          onClick={onRevert}
          disabled={saving}
          className="text-sm text-muted-foreground hover:text-foreground px-3 h-9 rounded-md transition-colors disabled:opacity-40"
        >
          Annuleren
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="btn-luxe btn-luxe--primary !h-9"
        >
          {saving ? "Opslaan..." : "Opslaan"}
        </button>
      </div>
    </div>
  );
}
