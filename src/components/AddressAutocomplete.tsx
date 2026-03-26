import { useState, useRef, useEffect } from "react";
import { MapPin, Globe, History } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface Suggestion {
  address: string;
  source: "history" | "google";
}

export function AddressAutocomplete({ value, onChange, placeholder, className }: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const searchHistory = async (query: string): Promise<Suggestion[]> => {
    try {
      const { data } = await supabase
        .from("orders")
        .select("pickup_address, delivery_address")
        .or(`pickup_address.ilike.%${query}%,delivery_address.ilike.%${query}%`)
        .limit(30);
      if (!data) return [];
      const counts = new Map<string, number>();
      for (const row of data) {
        for (const addr of [row.pickup_address, row.delivery_address]) {
          if (addr && addr.toLowerCase().includes(query.toLowerCase())) {
            counts.set(addr, (counts.get(addr) || 0) + 1);
          }
        }
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([address]) => ({ address, source: "history" as const }));
    } catch {
      return [];
    }
  };

  const searchGoogle = async (query: string): Promise<Suggestion[]> => {
    try {
      const { data, error } = await supabase.functions.invoke("google-places", {
        body: { input: query },
      });
      if (error || !data?.predictions) return [];
      return data.predictions.map((p: any) => ({
        address: p.description,
        source: "google" as const,
      }));
    } catch {
      return [];
    }
  };

  const search = async (query: string) => {
    if (query.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const [history, google] = await Promise.all([searchHistory(query), searchGoogle(query)]);
      // Merge: history first, then google (deduped)
      const seen = new Set(history.map(s => s.address.toLowerCase()));
      const googleFiltered = google.filter(s => !seen.has(s.address.toLowerCase()));
      const merged = [...history, ...googleFiltered].slice(0, 8);
      setSuggestions(merged);
      setOpen(merged.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 300);
  };

  const select = (addr: string) => {
    onChange(addr);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <Input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        placeholder={placeholder}
        className={className}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-[200] top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={`${s.source}-${i}`}
              type="button"
              onClick={() => select(s.address)}
              className={cn(
                "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-accent transition-colors",
                i > 0 && "border-t border-border/40"
              )}
            >
              {s.source === "history" ? (
                <History className="h-3 w-3 text-primary shrink-0" />
              ) : (
                <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
              )}
              <span className="truncate">{s.address}</span>
              {s.source === "history" && (
                <span className="ml-auto text-[9px] text-muted-foreground shrink-0">eerder gebruikt</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
