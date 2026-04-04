import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Package, Search, MapPin, Truck, CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

interface TrackOrder {
  order_number: number;
  client_name: string | null;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  created_at: string;
  eta: string | null;
  recipient_name: string | null;
}

const TIMELINE_STEPS = [
  { key: "DRAFT", label: "Order ontvangen", icon: Package },
  { key: "PENDING", label: "In behandeling", icon: Clock },
  { key: "PLANNED", label: "Gepland", icon: MapPin },
  { key: "IN_TRANSIT", label: "Onderweg", icon: Truck },
  { key: "DELIVERED", label: "Afgeleverd", icon: CheckCircle2 },
] as const;

const STATUS_ORDER: Record<string, number> = {
  DRAFT: 0,
  PENDING: 1,
  PLANNED: 2,
  IN_TRANSIT: 3,
  DELIVERED: 4,
};

const STATUS_BADGE_LABELS: Record<string, string> = {
  DRAFT: "Ontvangen",
  PENDING: "In behandeling",
  PLANNED: "Gepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  DRAFT: "bg-blue-100 text-blue-700",
  PENDING: "bg-amber-100 text-amber-700",
  PLANNED: "bg-purple-100 text-purple-700",
  IN_TRANSIT: "bg-[#dc2626] text-white",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function TrackTrace() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<TrackOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearchWithQuery = async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setOrder(null);
    setSearched(true);

    try {
      const numericQuery = parseInt(trimmed, 10);
      let data: TrackOrder | null = null;

      if (!isNaN(numericQuery)) {
        const { data: result, error: dbError } = await supabase
          .from("orders")
          .select("order_number, client_name, status, pickup_address, delivery_address, weight_kg, created_at, time_window_end, recipient_name")
          .eq("order_number", numericQuery)
          .maybeSingle();

        if (dbError) throw dbError;
        if (result) {
          data = { ...result, eta: (result as any).time_window_end ?? null };
        }
      }

      if (!data) {
        const { data: results, error: dbError } = await supabase
          .from("orders")
          .select("order_number, client_name, status, pickup_address, delivery_address, weight_kg, created_at, time_window_end, recipient_name")
          .eq("order_number", trimmed)
          .maybeSingle();

        if (dbError && dbError.code !== "PGRST116") throw dbError;
        if (results) {
          data = { ...results, eta: (results as any).time_window_end ?? null };
        }
      }

      setOrder(data);
    } catch (err) {
      console.error("Track search error:", err);
      setError("Er is een fout opgetreden. Probeer het later opnieuw.");
    } finally {
      setLoading(false);
    }
  };

  // Auto-search from URL ?q= param on mount
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      handleSearchWithQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async () => {
    await handleSearchWithQuery(query);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const currentStepIndex = order ? (STATUS_ORDER[order.status] ?? -1) : -1;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center px-4 py-12">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-[#dc2626] flex items-center justify-center">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-gray-900">
            {DEFAULT_COMPANY.name}
          </span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mt-6">Track &amp; Trace</h1>
        <p className="text-gray-500 mt-2">
          Voer uw ordernummer in om uw zending te volgen
        </p>
      </div>

      {/* Search card */}
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ordernummer of trackingcode"
              className="pl-10 h-11"
            />
          </div>
          <Button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="h-11 px-6 bg-[#dc2626] hover:bg-[#b91c1c] text-white"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Zoeken...
              </span>
            ) : (
              "Volg zending"
            )}
          </Button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600 text-center">{error}</p>
        )}

        {searched && !loading && !order && !error && (
          <div className="mt-8 text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Geen zending gevonden</p>
            <p className="text-gray-400 text-sm mt-1">
              Controleer het ordernummer en probeer het opnieuw
            </p>
          </div>
        )}
      </div>

      {/* Result card */}
      {order && (
        <div className="w-full max-w-lg mt-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
          {/* Order header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-sm text-gray-500">Ordernummer</p>
              <p className="text-lg font-bold text-gray-900">#{order.order_number}</p>
              {order.client_name && (
                <p className="text-sm text-gray-600 mt-0.5">{order.client_name}</p>
              )}
            </div>
            <Badge
              className={cn(
                "text-xs font-semibold px-3 py-1 rounded-full border-0",
                STATUS_BADGE_COLORS[order.status] || "bg-gray-100 text-gray-600"
              )}
            >
              {STATUS_BADGE_LABELS[order.status] || order.status}
            </Badge>
          </div>

          {/* Status timeline */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Verzendstatus</h3>
            <div className="relative pl-4">
              {TIMELINE_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                const isLast = idx === TIMELINE_STEPS.length - 1;
                const StepIcon = step.icon;

                return (
                  <div key={step.key} className="relative flex items-start gap-4 pb-6 last:pb-0">
                    {/* Vertical line */}
                    {!isLast && (
                      <div
                        className={cn(
                          "absolute left-[11px] top-[28px] w-0.5 h-[calc(100%-16px)]",
                          isCompleted && idx < currentStepIndex
                            ? "bg-emerald-500"
                            : "bg-gray-200"
                        )}
                      />
                    )}

                    {/* Circle indicator */}
                    <div className="relative z-10 flex-shrink-0">
                      {isCompleted ? (
                        <div
                          className={cn(
                            "h-6 w-6 rounded-full flex items-center justify-center",
                            isCurrent
                              ? "bg-[#dc2626] ring-4 ring-red-100"
                              : "bg-emerald-500"
                          )}
                        >
                          {isCurrent ? (
                            <StepIcon className="h-3 w-3 text-white" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                          )}
                        </div>
                      ) : (
                        <div className="h-6 w-6 rounded-full border-2 border-gray-200 bg-white flex items-center justify-center">
                          <Circle className="h-3 w-3 text-gray-300" />
                        </div>
                      )}
                    </div>

                    {/* Label */}
                    <div className="pt-0.5">
                      <p
                        className={cn(
                          "text-sm font-medium",
                          isCompleted ? "text-gray-900" : "text-gray-400"
                        )}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Addresses */}
          {(order.pickup_address || order.delivery_address) && (
            <div className="border-t border-gray-100 pt-5 mb-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Route</h3>
              <div className="space-y-3">
                {order.pickup_address && (
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Ophaaladres</p>
                      <p className="text-sm text-gray-900">{order.pickup_address}</p>
                    </div>
                  </div>
                )}
                {order.delivery_address && (
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <MapPin className="h-4 w-4 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Afleveradres</p>
                      <p className="text-sm text-gray-900">{order.delivery_address}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ETA section — shown for IN_TRANSIT orders */}
          {order.status === "IN_TRANSIT" && (
            <div className="border-t border-gray-100 pt-5 mb-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-4 w-4 text-[#dc2626]" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Verwachte aankomst</p>
                  <p className="text-sm font-medium text-gray-900">
                    {order.eta
                      ? new Date(order.eta).toLocaleString("nl-NL", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })
                      : "Wordt berekend..."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Weight */}
          {order.weight_kg != null && (
            <div className="border-t border-gray-100 pt-5">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <Package className="h-4 w-4 text-gray-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Geschat gewicht</p>
                  <p className="text-sm font-medium text-gray-900">{order.weight_kg} kg</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <p className="mt-12 text-xs text-gray-400">
        &copy; {new Date().getFullYear()} {DEFAULT_COMPANY.name}. Alle rechten voorbehouden.
      </p>
    </div>
  );
}
