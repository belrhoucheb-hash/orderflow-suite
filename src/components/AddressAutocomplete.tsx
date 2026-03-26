import { useState, useRef, useEffect } from "react";
import { MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AddressAutocomplete({ value, onChange, placeholder, className }: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = async (query: string) => {
    if (query.length < 2) { setSuggestions([]); return; }
    setLoading(true);
    try {
      // Search both pickup and delivery addresses
      const { data } = await supabase
        .from("orders")
        .select("pickup_address, delivery_address")
        .or(`pickup_address.ilike.%${query}%,delivery_address.ilike.%${query}%`)
        .limit(30);

      if (!data) { setSuggestions([]); return; }

      // Dedupe and rank by frequency
      const counts = new Map<string, number>();
      for (const row of data) {
        for (const addr of [row.pickup_address, row.delivery_address]) {
          if (addr && addr.toLowerCase().includes(query.toLowerCase())) {
            counts.set(addr, (counts.get(addr) || 0) + 1);
          }
        }
      }
      const sorted = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([addr]) => addr);

      setSuggestions(sorted);
      setOpen(sorted.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (val: string) => {
    onChange(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 250);
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
          {suggestions.map((addr, i) => (
            <button
              key={i}
              type="button"
              onClick={() => select(addr)}
              className={cn(
                "w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-accent transition-colors",
                i > 0 && "border-t border-border/40"
              )}
            >
              <MapPin className="h-3 w-3 text-primary shrink-0" />
              <span className="truncate">{addr}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
