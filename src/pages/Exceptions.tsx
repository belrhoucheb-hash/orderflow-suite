import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFleetVehicles } from "@/hooks/useFleet";
import { useAnomalies, useResolveAnomaly, anomalyToException } from "@/hooks/useAnomalyDetection";
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
  Brain,
  Bot,
  Sparkles,
  Wand2,
  Send,
  FileWarning,
  ReceiptText,
  ChevronDown,
  Play,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import { useMemo as useReactMemo, useState } from "react";
import {
  useCreateExceptionAction,
  useExceptionActions,
  useExceptionActionRuns,
  useExecuteExceptionAction,
  useUpdateExceptionActionStatus,
} from "@/hooks/useExceptionActions";
import type {
  CreateExceptionActionInput,
  ExceptionAction,
  ExceptionSourceType,
} from "@/types/exceptionActions";

// ── Types ────────────────────────────────────────────────────────────
type ExceptionType = "Vertraging" | "Data mist" | "Capaciteit" | "SLA" | "Voorspelde vertraging";
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
  /** "db" = from delivery_exceptions table, "adhoc" = computed from order data */
  source: "db" | "adhoc";
}

type ExceptionFocus = "all" | "critical" | "today" | "copilot" | "open";

function CopilotHistory({ actionId }: { actionId: string }) {
  const { data: runs = [] } = useExceptionActionRuns(actionId);

  if (runs.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[hsl(var(--gold)/0.12)] pt-3">
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-2">
        Copilot Historie
      </p>
      <div className="space-y-1.5">
        {runs.slice(0, 4).map((run) => (
          <div key={run.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-foreground font-medium">{run.runType}</span>
            <span className="text-muted-foreground">{new Date(run.createdAt).toLocaleString("nl-NL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ExceptionCopilotSuggestion {
  sourceType: ExceptionSourceType;
  sourceRef: string;
  actionType: string;
  title: string;
  description: string;
  confidence: number;
  impact: Record<string, unknown>;
  payload: Record<string, unknown>;
  requiresApproval: boolean;
}

function extractOrderId(exc: ExceptionItem): string | undefined {
  if (exc.id.startsWith("missing-")) return exc.id.replace("missing-", "");
  if (exc.id.startsWith("sla-")) return exc.id.replace("sla-", "");
  if (exc.id.startsWith("delay-")) return exc.id.replace("delay-", "");
  if (exc.actionTo.startsWith("/orders/")) return exc.actionTo.replace("/orders/", "");
  return undefined;
}

function extractTripId(exc: ExceptionItem): string | undefined {
  const match = exc.actionTo.match(/trip=([a-f0-9-]+)/i);
  if (match?.[1]) return match[1];
  if (exc.actionTo.startsWith("/planning/")) return exc.actionTo.replace("/planning/", "");
  return undefined;
}

function extractMissingFields(description: string): string[] {
  const marker = "Ontbrekende velden:";
  if (!description.includes(marker)) return [];
  return description
    .split(marker)[1]
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
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
  "Voorspelde vertraging":
    "bg-[hsl(var(--gold-soft)/0.4)] text-[hsl(var(--gold-deep))] border-[hsl(var(--gold)/0.3)]",
};

const copilotIconByAction: Record<string, typeof Send> = {
  SEND_ETA_UPDATE: Send,
  REQUEST_MISSING_INFO: FileWarning,
  FLAG_BILLING_REVIEW: ReceiptText,
  REMIND_DRIVER_FOR_POD: Sparkles,
};

function mapExceptionToSourceType(exc: ExceptionItem): ExceptionSourceType {
  if (exc.id.startsWith("anomaly-")) return "anomaly";
  if (exc.source === "adhoc") return "adhoc";
  return "delivery_exception";
}

function isSameDay(date: Date, compare: Date): boolean {
  return date.toDateString() === compare.toDateString();
}

function getUrgencyLabel(urgency: Urgency): string {
  if (urgency === "critical") return "Direct oppakken";
  if (urgency === "warning") return "Vandaag beoordelen";
  return "Monitoren";
}

function buildSuggestedAction(exc: ExceptionItem): ExceptionCopilotSuggestion {
  const sourceType = mapExceptionToSourceType(exc);
  const sourceRef = exc.id;
  const orderId = extractOrderId(exc);
  const tripId = extractTripId(exc);

  if (exc.type === "Voorspelde vertraging" || exc.type === "Vertraging") {
    return {
      sourceType,
      sourceRef,
      actionType: "SEND_ETA_UPDATE",
      title: "Stuur proactieve ETA-update",
      description: "Informeer klant en ontvanger direct over de afwijking om belverkeer en handmatige opvolging te beperken.",
      confidence: exc.type === "Voorspelde vertraging" ? 91 : 84,
      impact: {
        customerImpact: "high",
        riskReduction: "medium",
        summary: "Voorkomt verrassingen en verlaagt escalatiekans",
      },
      payload: {
        orderId,
        tripId,
        target: "customer_and_recipient",
        exceptionType: exc.type,
        orderNumber: exc.orderNumber,
      },
      requiresApproval: true,
    };
  }

  if (exc.type === "Data mist" || exc.type === "SLA") {
    return {
      sourceType,
      sourceRef,
      actionType: "REQUEST_MISSING_INFO",
      title: "Vraag ontbrekende info automatisch op",
      description: "Start direct een follow-up richting klant of planner zodat de order weer door de flow kan.",
      confidence: exc.type === "SLA" ? 89 : 93,
      impact: {
        customerImpact: "medium",
        riskReduction: "high",
        summary: "Verkort stilstand in intake en voorkomt SLA-verlies",
      },
      payload: {
        orderId,
        target: "customer",
        exceptionType: exc.type,
        orderNumber: exc.orderNumber,
        missingFields: extractMissingFields(exc.description),
      },
      requiresApproval: true,
    };
  }

  if (exc.description.toLowerCase().includes("pod")) {
    return {
      sourceType,
      sourceRef,
      actionType: "REMIND_DRIVER_FOR_POD",
      title: "Herinner chauffeur aan POD",
      description: "Stuur een gerichte reminder zodat aflevering sneller administratief wordt afgerond.",
      confidence: 88,
      impact: {
        customerImpact: "low",
        riskReduction: "medium",
        summary: "Versnelt orderafronding en voorkomt facturatieblokkade",
      },
      payload: {
        orderId,
        tripId,
        target: "driver",
        exceptionType: exc.type,
        orderNumber: exc.orderNumber,
      },
      requiresApproval: true,
    };
  }

  return {
    sourceType,
    sourceRef,
    actionType: "FLAG_BILLING_REVIEW",
    title: "Markeer voor billing review",
    description: "Zet deze uitzondering klaar voor financiële opvolging zodat extra kosten of afwijkingen niet verloren gaan.",
    confidence: 86,
    impact: {
      customerImpact: "low",
      riskReduction: "medium",
      summary: "Borgt opbrengst en maakt exception financieel zichtbaar",
    },
    payload: {
      orderId,
      tripId,
      target: "billing",
      exceptionType: exc.type,
      orderNumber: exc.orderNumber,
    },
    requiresApproval: true,
  };
}

// ── Delivery exceptions from DB ─────────────────────────────────────
function useDeliveryExceptions() {
  return useQuery({
    queryKey: ["delivery-exceptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_exceptions")
        .select("id, exception_type, severity, description, order_id, trip_id, created_at, status")
        .in("status", ["OPEN", "IN_PROGRESS"]);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });
}

function useResolveException() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (exceptionId: string) => {
      const { error } = await supabase
        .from("delivery_exceptions")
        .update({ status: "RESOLVED", resolved_at: new Date().toISOString() })
        .eq("id", exceptionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["delivery-exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["exception-count"] });
      toast.success("Exception opgelost");
    },
    onError: () => {
      toast.error("Kon exception niet oplossen");
    },
  });
}

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
  const [expandedCopilotId, setExpandedCopilotId] = useState<string | null>(null);
  const [focus, setFocus] = useState<ExceptionFocus>("all");
  const { data: orderData, isLoading: ordersLoading } = useExceptionOrders();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useFleetVehicles();
  const { data: deliveryExceptions = [], isLoading: dexLoading } = useDeliveryExceptions();
  const { data: anomalies = [], isLoading: anomaliesLoading } = useAnomalies({ unresolvedOnly: true });
  const { data: exceptionActions = [] } = useExceptionActions({ status: "ALL" });
  const createExceptionAction = useCreateExceptionAction();
  const updateExceptionActionStatus = useUpdateExceptionActionStatus();
  const executeExceptionAction = useExecuteExceptionAction();
  const resolveException = useResolveException();
  const resolveAnomaly = useResolveAnomaly();

  const isLoading = ordersLoading || vehiclesLoading || dexLoading || anomaliesLoading;

  const { exceptions, counts } = useMemo(() => {
    if (!orderData) return { exceptions: [] as ExceptionItem[], counts: { delays: 0, missingData: 0, capacity: 0, sla: 0, delivery: 0 } };

    const items: ExceptionItem[] = [];
    const now = Date.now();
    const threeHoursMs = 3 * 60 * 60 * 1000;
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // ── Delivery exceptions from DB ──────────────────────────────
    const severityToUrgency: Record<string, Urgency> = {
      CRITICAL: "critical",
      HIGH: "critical",
      MEDIUM: "warning",
      LOW: "info",
    };
    const dexTypeMap: Record<string, ExceptionType> = {
      DELAY: "Vertraging",
      MISSING_DATA: "Data mist",
      CAPACITY: "Capaciteit",
      SLA_BREACH: "SLA",
      PREDICTED_DELAY: "Voorspelde vertraging",
    };
    for (const dex of deliveryExceptions) {
      const isPredicted = dex.exception_type === "PREDICTED_DELAY";
      const tripId = dex.trip_id;
      items.push({
        id: dex.id,
        type: dexTypeMap[dex.exception_type] || "Vertraging",
        urgency: isPredicted ? "info" : (severityToUrgency[dex.severity] || "warning"),
        orderNumber: dex.order_id ? `Order` : "—",
        clientName: "",
        description: dex.description,
        detectedAt: new Date(dex.created_at),
        actionLabel: isPredicted
          ? "Bekijk rit"
          : dex.order_id
            ? "Bekijk order"
            : "Details",
        actionTo: isPredicted
          ? (tripId ? `/dispatch?trip=${tripId}` : "/dispatch")
          : dex.order_id
            ? `/orders/${dex.order_id}`
            : "/exceptions",
        source: "db",
      });
    }

    // ── Ad-hoc: Missing data ─────────────────────────────────────
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
        source: "adhoc",
      });
    }

    // ── Ad-hoc: SLA risk ─────────────────────────────────────────
    const slaOrders = orderData.drafts.filter((o: any) => {
      const receivedAt = o.received_at || o.created_at;
      return receivedAt && now - new Date(receivedAt).getTime() > threeHoursMs;
    });
    for (const o of slaOrders) {
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
        source: "adhoc",
      });
    }

    // ── Ad-hoc: Delays ───────────────────────────────────────────
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
        source: "adhoc",
      });
    }

    // ── Ad-hoc: Capacity ─────────────────────────────────────────
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
        actionLabel: "Bekijk voertuig",
        actionTo: `/vloot/${v.id}`,
        source: "adhoc",
      });
    }

    // ── Anomaly-detected items ────────────────────────────────
    for (const a of anomalies) {
      const exc = anomalyToException(a);
      items.push({
        id: exc.id,
        type: (exc.type === "Prijs" || exc.type === "Timing" || exc.type === "Compliance" || exc.type === "Patroon")
          ? "Data mist" as ExceptionType // map non-standard types to nearest existing badge
          : exc.type === "Capaciteit"
            ? "Capaciteit" as ExceptionType
            : "Vertraging" as ExceptionType,
        urgency: exc.urgency,
        orderNumber: exc.orderNumber,
        clientName: exc.clientName,
        description: exc.description,
        detectedAt: exc.detectedAt,
        actionLabel: exc.actionLabel,
        actionTo: exc.actionTo,
        source: "db" as const, // treat as DB-sourced so resolve button appears
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
        delivery: deliveryExceptions.length,
        anomalies: anomalies.length,
      },
    };
  }, [orderData, vehicles, deliveryExceptions, anomalies]);

  const actionsBySource = useReactMemo(() => {
    const map = new Map<string, ExceptionAction[]>();
    for (const action of exceptionActions) {
      const key = `${action.sourceType}:${action.sourceRef}`;
      const list = map.get(key) ?? [];
      list.push(action);
      map.set(key, list);
    }
    return map;
  }, [exceptionActions]);

  const recommendedCount = useReactMemo(
    () => exceptionActions.filter((action) => action.recommended && action.status === "PENDING").length,
    [exceptionActions],
  );

  const focusCounts = useReactMemo(() => {
    const today = new Date();
    const withActions = exceptions.map((exc) => {
      const sourceType = mapExceptionToSourceType(exc);
      const sourceKey = `${sourceType}:${exc.id}`;
      const actions = actionsBySource.get(sourceKey) ?? [];
      const recommendedAction =
        actions.find((action) => action.recommended && action.status === "PENDING") ?? actions[0] ?? null;
      return { exc, recommendedAction };
    });

    return {
      all: withActions.length,
      critical: withActions.filter(({ exc }) => exc.urgency === "critical").length,
      today: withActions.filter(({ exc }) => isSameDay(exc.detectedAt, today)).length,
      copilot: withActions.filter(({ recommendedAction }) => !!recommendedAction).length,
      open: withActions.filter(({ exc }) => exc.source === "adhoc" || exc.source === "db").length,
    };
  }, [actionsBySource, exceptions]);

  const filteredExceptions = useReactMemo(() => {
    const today = new Date();
    return exceptions.filter((exc) => {
      const sourceType = mapExceptionToSourceType(exc);
      const sourceKey = `${sourceType}:${exc.id}`;
      const actions = actionsBySource.get(sourceKey) ?? [];
      const hasCopilot = actions.length > 0;

      if (focus === "critical") return exc.urgency === "critical";
      if (focus === "today") return isSameDay(exc.detectedAt, today);
      if (focus === "copilot") return hasCopilot;
      if (focus === "open") return exc.source === "db" || exc.source === "adhoc";
      return true;
    });
  }, [actionsBySource, exceptions, focus]);

  const totalCount = counts.delays + counts.missingData + counts.capacity + counts.sla + counts.delivery + (counts.anomalies ?? 0);

  if (isLoading) {
    return <LoadingState message="Uitzonderingen laden..." />;
  }

  const kpis = [
    { label: "Delivery", value: counts.delivery, icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950/40" },
    { label: "Vertragingen", value: counts.delays, icon: Clock, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/40" },
    { label: "Ontbrekende data", value: counts.missingData, icon: Package, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40" },
    { label: "Capaciteit", value: counts.capacity, icon: Truck, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950/40" },
    { label: "SLA risico", value: counts.sla, icon: Shield, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950/40" },
    { label: "Anomalies", value: counts.anomalies ?? 0, icon: Brain, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950/40" },
    { label: "Copilot acties", value: recommendedCount, icon: Bot, color: "text-[hsl(var(--gold-deep))]", bg: "bg-[hsl(var(--gold-soft)/0.35)]" },
  ];

  const focusOptions: Array<{ key: ExceptionFocus; label: string }> = [
    { key: "all", label: "Alles" },
    { key: "critical", label: "Kritiek" },
    { key: "today", label: "Vandaag" },
    { key: "copilot", label: "Met copilot" },
    { key: "open", label: "Open werk" },
  ];

  const handleSaveSuggestion = async (exc: ExceptionItem, suggestion: ExceptionCopilotSuggestion) => {
    const payload: CreateExceptionActionInput = {
      exceptionId: mapExceptionToSourceType(exc) === "delivery_exception" ? exc.id : undefined,
      sourceType: suggestion.sourceType,
      sourceRef: suggestion.sourceRef,
      actionType: suggestion.actionType,
      title: suggestion.title,
      description: suggestion.description,
      confidence: suggestion.confidence,
      impact: suggestion.impact,
      payload: suggestion.payload,
      recommended: true,
      requiresApproval: suggestion.requiresApproval,
    };

    await createExceptionAction.mutateAsync(payload);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title="Uitzonderingen"
        subtitle={`${totalCount} items vereisen aandacht`}
      />

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-7 gap-3">
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

      <div className="rounded-xl border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              Planner focus
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Werk sneller vanuit een focuslijst in plaats van de hele exceptionstroom tegelijk.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {focusOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setFocus(option.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  focus === option.key
                    ? "border-[hsl(var(--gold)/0.28)] bg-[hsl(var(--gold-soft)/0.38)] text-[hsl(var(--gold-deep))]"
                    : "border-border/60 bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label} ({focusCounts[option.key]})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Exception List */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3.5 border-b">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-foreground">Alle uitzonderingen</h2>
            <span className="text-xs text-muted-foreground">
              {filteredExceptions.length} zichtbaar van {exceptions.length}
            </span>
          </div>
        </div>

        {filteredExceptions.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={exceptions.length === 0 ? "Geen uitzonderingen" : "Geen uitzonderingen in deze focus"}
            description={exceptions.length === 0 ? "Alles loopt volgens planning" : "Kies een andere focus om meer werkitems te zien"}
          />
        ) : (
          <div className="divide-y">
            {filteredExceptions.map((exc, i) => {
              const uc = urgencyConfig[exc.urgency];
              return (
                <motion.div
                  key={exc.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="px-5 py-3.5 hover:bg-muted/40 transition-colors"
                >
                  {(() => {
                    const sourceType = mapExceptionToSourceType(exc);
                    const sourceKey = `${sourceType}:${exc.id}`;
                    const actions = actionsBySource.get(sourceKey) ?? [];
                    const recommendedAction = actions.find((action) => action.recommended && action.status === "PENDING") ?? actions[0] ?? null;
                    const suggestion = buildSuggestedAction(exc);
                    const ActionIcon = copilotIconByAction[(recommendedAction?.actionType ?? suggestion.actionType)] ?? Wand2;
                    const isExpanded = expandedCopilotId === exc.id;

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <div className={cn("rounded-full p-1.5 ring-1", uc.bg, uc.ring)}>
                            <AlertTriangle className={cn("h-4 w-4", uc.color)} strokeWidth={2} />
                          </div>

                          <Badge
                            variant="outline"
                            className={cn("text-xs font-medium shrink-0 min-w-[80px] justify-center", typeBadgeColor[exc.type])}
                          >
                            {exc.type}
                          </Badge>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground truncate">
                                {exc.orderNumber}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                {exc.clientName}
                              </span>
                              <span className="hidden md:inline-flex rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                                {getUrgencyLabel(exc.urgency)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {exc.description}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span className="chiplet">
                                Aanbevolen: {(recommendedAction?.title ?? suggestion.title)}
                              </span>
                              <span className="chiplet">
                                {Math.round(recommendedAction?.confidence ?? suggestion.confidence)}% confidence
                              </span>
                            </div>
                          </div>

                          <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                            {timeAgo(exc.detectedAt)}
                          </span>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {exc.source === "db" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                disabled={resolveException.isPending || resolveAnomaly.isPending}
                                onClick={() => {
                                  if (exc.id.startsWith("anomaly-")) {
                                    resolveAnomaly.mutate({ id: exc.id.replace("anomaly-", "") });
                                  } else {
                                    resolveException.mutate(exc.id);
                                  }
                                }}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Opgelost
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="text-xs gap-1.5"
                            >
                              <Link to={exc.actionTo}>
                                {exc.actionLabel}
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1.5 border-[hsl(var(--gold)/0.22)] hover:bg-[hsl(var(--gold-soft)/0.18)]"
                              onClick={() => setExpandedCopilotId(isExpanded ? null : exc.id)}
                            >
                              <Bot className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                              Copilot
                              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                            </Button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            className="ml-12 rounded-2xl border px-4 py-4"
                            style={{
                              background: "linear-gradient(180deg, hsl(var(--gold-soft) / 0.18) 0%, hsl(var(--card)) 100%)",
                              borderColor: "hsl(var(--gold) / 0.18)",
                            }}
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="h-8 w-8 rounded-xl flex items-center justify-center bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))]">
                                    <ActionIcon className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[hsl(var(--gold-deep))]"
                                        style={{ fontFamily: "var(--font-display)" }}
                                      >
                                        Next Best Action
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="border-[hsl(var(--gold)/0.22)] bg-[hsl(var(--gold-soft)/0.35)] text-[hsl(var(--gold-deep))]"
                                      >
                                        {Math.round(recommendedAction?.confidence ?? suggestion.confidence)}% confidence
                                      </Badge>
                                    </div>
                                    <h3 className="text-sm font-semibold text-foreground mt-0.5">
                                      {recommendedAction?.title ?? suggestion.title}
                                    </h3>
                                  </div>
                                </div>

                                <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                                  {recommendedAction?.description ?? suggestion.description}
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <span className="chiplet">
                                    {String((recommendedAction?.impact?.summary as string | undefined) ?? suggestion.impact.summary ?? "Directe operationele opvolging")}
                                  </span>
                                  <span className="chiplet">
                                    {recommendedAction?.requiresApproval ?? suggestion.requiresApproval ? "Planner approval nodig" : "Mag autonoom"}
                                  </span>
                                  {recommendedAction ? (
                                    <span className="chiplet">{recommendedAction.status}</span>
                                  ) : (
                                    <span className="chiplet chiplet--warn">Preview voorstel</span>
                                  )}
                                </div>
                              </div>

                              <div className="lg:w-[280px] shrink-0">
                                <div className="rounded-xl border border-white/40 bg-white/60 dark:bg-white/5 p-3 space-y-3">
                                  <div>
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                                      Verwachte impact
                                    </p>
                                    <p className="text-sm text-foreground mt-1">
                                      {String((recommendedAction?.impact?.summary as string | undefined) ?? suggestion.impact.summary ?? "Snellere exception-afhandeling")}
                                    </p>
                                  </div>

                                  <div className="flex flex-col gap-2">
                                    {recommendedAction ? (
                                      <>
                                        {recommendedAction.status === "PENDING" && (
                                          <>
                                            <Button
                                              size="sm"
                                              className="w-full gap-1.5"
                                              onClick={() => updateExceptionActionStatus.mutate({
                                                id: recommendedAction.id,
                                                status: "APPROVED",
                                              })}
                                              disabled={updateExceptionActionStatus.isPending}
                                            >
                                              <CheckCircle2 className="h-3.5 w-3.5" />
                                              Goedkeuren
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              className="w-full gap-1.5 text-muted-foreground"
                                              onClick={() => updateExceptionActionStatus.mutate({
                                                id: recommendedAction.id,
                                                status: "REJECTED",
                                              })}
                                              disabled={updateExceptionActionStatus.isPending}
                                            >
                                              Afwijzen
                                            </Button>
                                          </>
                                        )}
                                        <Button
                                          size="sm"
                                          variant={recommendedAction.status === "PENDING" ? "outline" : "default"}
                                          className="w-full gap-1.5"
                                          onClick={() => executeExceptionAction.mutate({
                                            actionId: recommendedAction.id,
                                            actionType: recommendedAction.actionType,
                                            payload: {
                                              ...recommendedAction.payload,
                                              requiresApproval: recommendedAction.requiresApproval,
                                              currentStatus: recommendedAction.status,
                                            },
                                          })}
                                          disabled={
                                            executeExceptionAction.isPending ||
                                            (recommendedAction.requiresApproval && recommendedAction.status !== "APPROVED")
                                          }
                                        >
                                          <Play className="h-3.5 w-3.5" />
                                          Nu uitvoeren
                                        </Button>
                                        <CopilotHistory actionId={recommendedAction.id} />
                                      </>
                                    ) : (
                                      <Button
                                        size="sm"
                                        className="w-full gap-1.5"
                                        onClick={() => handleSaveSuggestion(exc, suggestion)}
                                        disabled={createExceptionAction.isPending}
                                      >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        Opslaan als voorstel
                                      </Button>
                                    )}

                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      asChild
                                      className="w-full gap-1.5"
                                    >
                                      <Link to={exc.actionTo}>
                                        Open context
                                        <ArrowRight className="h-3.5 w-3.5" />
                                      </Link>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
