import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import { useKvkByNumber, useKvkSearch, type KvkCompany } from "@/hooks/useKvkLookup";

interface Props {
  onSelect: (company: KvkCompany) => void | Promise<void>;
}

function isKvkNumber(input: string): boolean {
  return /^\d{8}$/.test(input.replace(/\s+/g, ""));
}

export function KvkLookupBar({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<KvkCompany[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchMut = useKvkSearch();
  const byKvkMut = useKvkByNumber();

  const mode = useMemo<"search" | "byKvk" | "idle">(() => {
    const trimmed = input.trim();
    if (!trimmed) return "idle";
    if (isKvkNumber(trimmed)) return "byKvk";
    if (trimmed.length >= 2) return "search";
    return "idle";
  }, [input]);

  useEffect(() => {
    if (mode !== "search") {
      setResults([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await searchMut.mutateAsync(input);
        setResults(r);
        setOpen(true);
      } catch (err: any) {
        toast.error(err?.message ?? "Zoeken mislukt");
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
    // Alleen op input reageren, searchMut is een stabiele referentie per render
    // maar voegt niets toe aan de dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, mode]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePick = async (company: KvkCompany) => {
    setOpen(false);
    setInput("");
    setResults([]);
    await onSelect(company);
  };

  const handleByKvk = async () => {
    try {
      const result = await byKvkMut.mutateAsync(input);
      if (!result) {
        toast.error("Geen bedrijf gevonden bij dit KvK-nummer");
        return;
      }
      await handlePick(result);
    } catch (err: any) {
      toast.error(err?.message ?? "Ophalen mislukt");
    }
  };

  const busy = searchMut.isPending || byKvkMut.isPending;

  return (
    <div
      ref={wrapperRef}
      className="relative rounded-md border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-3"
    >
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            placeholder="Zoek op bedrijfsnaam of KvK-nummer"
            className="field-luxe w-full pl-8"
          />
          {busy && (
            <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {mode === "byKvk" && (
          <button
            type="button"
            onClick={handleByKvk}
            disabled={busy}
            className="btn-luxe btn-luxe--primary !h-9 whitespace-nowrap"
          >
            Ophalen
          </button>
        )}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Vult naam, KvK en adres automatisch vanuit het Handelsregister.
      </p>

      {open && results.length > 0 && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <button
              key={`${r.kvk}-${r.name}`}
              type="button"
              onClick={() => handlePick(r)}
              className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
            >
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  KvK {r.kvk}
                  {r.city ? `, ${r.city}` : ""}
                  {r.street ? ` , ${r.street} ${r.house_number}` : ""}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && !busy && mode === "search" && results.length === 0 && input.trim().length >= 2 && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
          Geen bedrijven gevonden.
        </div>
      )}
    </div>
  );
}
