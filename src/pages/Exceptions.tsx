import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFleetVehicles } from "@/hooks/useFleet";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Clock,
  Truck,
  Package,
  ArrowRight,
  Loader2,
  CheckCircle2,
  Shield,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────
type ExceptionType = "Vertraging" | "Data mist" | "Capaciteit" | "SLA";
type Urgency = "critical" | "warning" | "info";

interface ExceptionItem {
  id: string;
  type: ExceptionType;
  urgency: Urgency;
  orderNumber: string;
  clientName: string;
  description: string;
  detectedAt: Date;
  actionLabel: string;
  actionTo: string;
}

// ── Helpers ──────────────────────────────────────────────────────────
function timeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m geleden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}u geleden`;
  const days = Math.floor(hrs / 24);
  return `${days}d geleden`;
}

const urgencyConfig: Record<Urgency, { color: string; bg: string; ring: string }> = {
  critical: { color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/40", ring: "ring-red-200 dark:ring-red-800" },
  warning: { color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40", ring: "ring-amber-200 dark:ring-amber-800" },
  info: { color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40", ring: "ring-emerald-200 dark:ring-emerald-800" },
};

const typeBadgeColor: Record<ExceptionType, string> = {
  Vertraging: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  "Data mist": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  Capaciteit: "bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400 dark:border-violet-800",
  SLA: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

// ── Data fetching ────────────────────────────────────────────────────
function useExceptionOrders() {
  return useQuery({
    queryKey: ["exception-orders"],
    queryFn: async () => {
      // Fetch DRAFT orders (for missing data + SLA risk)
      const { data: drafts, error: draftErr } = await supabase
        .from("orders")
        .select("id, order_number, client_name, status, missing_fields, received_at, created_at")
        .eq("status", "DRAFT");
      if (draftErr) throw draftErr;

      // Fetch IN_TRANSIT orders (for delays)
      const { data: inTransit, error: transitErr } = await supabase
        .from("orders")
        .select("id, order_number, client_name, status, created_at")
        .eq("status", "IN_TRANSIT");
      if (transitErr) throw transitErr;

      return { drafts: drafts ?? [], inTransit: inTransit ?? [] };
    },
    refetchInterval: 60_000,
  });
}

// ── Component ────────────────────────────────────────────────────────
const Exceptions = () => {
  const { data: orderData, isLoading: ordersLoading } = useExceptionOrders();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useFleetVehicles();

  const isLoading = ordersLoading || vehiclesLoading;

  const { exceptions, counts } = useMemo(() => {
    if (!orderData) return { exceptions: [] as ExceptionItem[], counts: { delays: 0, missingData: 0, capacity: 0, sla: 0 } };

    const items: ExceptionItem[] = [];
    const now = Date.now();
    const threeHoursMs = 3 * 60 * 60 * 1000;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // Missing data: DRAFT orders with missing_fields
    const missingDataOrders = orderData.drafts.filter(
      (o: any) => o.missing_fields && Array.isArray(o.missing_fields) && o.missing_fields.length > 0
    );
    for (const o of missingDataOrders) {
      items.push({
        id: `missing-${o.id}`,
        type: "Data mist",
        urgency: "warning",
        orderNumber: `#${o.order_number}`,
        clientName: o.client_name || "Onbekend",
        description: `Ontbrekende velden: ${(o.missing_fields as string[]).join(", ")}`,
        detectedAt: new Date(o.received_at || o.created_at),
        actionLabel: "Ga naar inbox",
        actionTo: "/inbox",
      });
    }

    // SLA risk: DRAFT orders received > 3 hours ago
    const slaOrders = orderData.drafts.filter((o: any) => {
      const receivedAt = o.received_at || o.created_at;
      return receivedAt && now - new Date(receivedAt).getTime() > threeHoursMs;
    });
    for (const o of slaOrders) {
      // Avoid duplicate if already in missing data
      if (items.find((i) => i.id === `missing-${o.id}`)) {
        // Still count it but create a separate exception entry
      }
      items.push({
        id: `sla-${o.id}`,
        type: "SLA",
        urgency: "critical",
        orderNumber: `#${o.order_number}`,
        clientName: o.client_name || "Onbekend",
        description: `Order al ${timeAgo(new Date(o.received_at || o.created_at))} in DRAFT — SLA risico`,
        detectedAt: new Date(o.received_at || o.created_at),
        actionLabel: "Ga naar inbox",
        actionTo: "/inbox",
      });
    }

    // Delays: IN_TRANSIT orders created > 24h ago
    const delayOrders = orderData.inTransit.filter(
      (o: any) => now - new Date(o.created_at).getTime() > twentyFourHoursMs
    );
    for (const o of delayOrders) {
      items.push({
        id: `delay-${o.id}`,
        type: "Vertraging",
        urgency: "critical",
        orderNumber: `#${o.order_number}`,
        clientName: o.client_name || "Onbekend",
        description: `Order al meer dan 24u onderweg`,
        detectedAt: new Date(o.created_at),
        actionLabel: "Bekijk order",
        actionTo: `/orders/${o.id}`,
      });
    }

    // Capacity: vehicles at 100% (status "niet_beschikbaar" or capacity logic)
    const fullVehicles = vehicles.filter((v) => v.status === "niet_beschikbaar" || v.status === "in_gebruik");
    for (const v of fullVehicles) {
      items.push({
        id: `cap-${v.id}`,
        type: "Capaciteit",
        urgency: "warning",
        orderNumber: v.code,
        clientName: v.name,
        description: `Voertuig ${v.plate} op volle capaciteit`,
        detectedAt: new Date(),
        actionLabel: "Bekijk order",
        actionTo: `/vloot/${v.id}`,
      });
    }

    // Sort by urgency (critical first) then by detectedAt (oldest first)
    const urgencyOrder: Record<Urgency, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const uo = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (uo !== 0) return uo;
      return a.detectedAt.getTime() - b.detectedAt.getTime();
    });

    return {
      exceptions: items,
      counts: {
        delays: delayOrders.length,
        missingData: missingDataOrders.length,
        capacity: fullVehicles.length,
        sla: slaOrders.length,
      },
    };
  }, [orderData, vehicles]);

  const totalCount = counts.delays + counts.missingData + counts.capacity + counts.sla;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const kpis = [
    { label: "Vertragingen", value: counts.delays, icon: Clock, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/40" },
    { label: "Ontbrekende data", value: counts.missingData, icon: Package, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40" },
    { label: "Capaciteit", value: counts.capacity, icon: Truck, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40" },
    { label: "SLA risico", value: counts.sla, icon: Shield, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/40" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
          Uitzonderingen
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {totalCount} items vereisen aandacht
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-xl border bg-card p-4 flex items-center gap-3"
          >
            <div className={cn("rounded-lg p-2.5", kpi.bg)}>
              <kpi.icon className={cn("h-5 w-5", kpi.color)} strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-2xl font-semibold tracking-tight">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Exception List */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b">
          <h2 className="text-sm font-semibold text-foreground">Alle uitzonderingen</h2>
        </div>

        {exceptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mb-3 text-emerald-500" />
            <p className="text-sm font-medium">Geen uitzonderingen</p>
            <p className="text-xs mt-1">Alles loopt volgens planning</p>
          </div>
        ) : (
          <div className="divide-y">
            {exceptions.map((exc, i) => {
              const uc = urgencyConfig[exc.urgency];
              return (
                <motion.div
                  key={exc.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors"
                >
                  {/* Urgency icon */}
                  <div className={cn("rounded-full p-1.5 ring-1", uc.bg, uc.ring)}>
                    <AlertTriangle className={cn("h-4 w-4", uc.color)} strokeWidth={2} />
                  </div>

                  {/* Type badge */}
                  <Badge
                    variant="outline"
                    className={cn("text-xs font-medium shrink-0 min-w-[80px] justify-center", typeBadgeColor[exc.type])}
                  >
                    {exc.type}
                  </Badge>

                  {/* Order + client */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {exc.orderNumber}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {exc.clientName}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {exc.description}
                    </p>
                  </div>

                  {/* Time since detected */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {timeAgo(exc.detectedAt)}
                  </span>

                  {/* Action button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="shrink-0 text-xs gap-1.5"
                  >
                    <Link to={exc.actionTo}>
                      {exc.actionLabel}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Exceptions;
