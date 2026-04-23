import { useEffect, useRef, useState } from "react";
import { Loader2, Search, Building2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCompanySearch,
  useCompanyDetails,
  type CompanyDetails,
  type CompanySearchHit,
} from "@/hooks/useCompanyLookup";

interface Props {
  onSelect: (company: CompanyDetails) => void | Promise<void>;
}

export function CompanyLookupBar({ onSelect }: Props) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<CompanySearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchMut = useCompanySearch();
  const detailsMut = useCompanyDetails();

  useEffect(() => {
    const trimmed = input.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const handle = setTimeout(async () => {
      try {
        const r = await searchMut.mutateAsync(trimmed);
        setResults(r);
        setOpen(true);
      } catch (err: any) {
        toast.error(err?.message ?? "Zoeken mislukt");
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handlePick = async (hit: CompanySearchHit) => {
    setOpen(false);
    try {
      const details = await detailsMut.mutateAsync(hit.place_id);
      if (!details) {
        toast.error("Kon bedrijfsdetails niet ophalen");
        return;
      }
      setInput("");
      setResults([]);
      await onSelect(details);
    } catch (err: any) {
      toast.error(err?.message ?? "Ophalen mislukt");
    }
  };

  const busy = searchMut.isPending || detailsMut.isPending;

  return (
    <div
      ref={wrapperRef}
      className="relative rounded-md border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-3"
    >
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Zoek bedrijf op naam"
          className="field-luxe w-full pl-8"
        />
        {busy && (
          <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {results.map((r) => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => handlePick(r)}
              className="flex w-full items-start gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent"
            >
              <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {r.description}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && !busy && results.length === 0 && input.trim().length >= 2 && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
          Geen bedrijven gevonden.
        </div>
      )}
    </div>
  );
}
