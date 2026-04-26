import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useFleetVehicles, useVehicleUtilization } from "@/hooks/useFleet";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "sonner";
import { useEffect, useMemo as useReactMemo, useState } from "react";
import { useLoadSettings } from "@/hooks/useSettings";
import { normalizeSlaSettings } from "@/lib/slaSettings";
import {
  anomalyPassesSeverity,
  isDeliverySeverityEnabled,
  isDeliveryTypeEnabled,
  normalizeExceptionSettings,
} from "@/lib/exceptionSettings";
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
  const [focus, setFocus] = useState<ExceptionFocus>("all");
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const { data: orderData, isLoading: ordersLoading } = useExceptionOrders();
  const { data: vehicles = [], isLoading: vehiclesLoading } = useFleetVehicles();
  const { data: utilization = {} } = useVehicleUtilization();
  const { data: deliveryExceptions = [], isLoading: dexLoading } = useDeliveryExceptions();
  const { data: anomalies = [], isLoading: anomaliesLoading } = useAnomalies({ unresolvedOnly: true });
  const { data: exceptionActions = [] } = useExceptionActions({ status: "ALL" });
  const { data: rawSlaSettings } = useLoadSettings("sla");
  const { data: rawExceptionSettings } = useLoadSettings("exceptions");
  const createExceptionAction = useCreateExceptionAction();
  const updateExceptionActionStatus = useUpdateExceptionActionStatus();
  const executeExceptionAction = useExecuteExceptionAction();
  const resolveException = useResolveException();
  const resolveAnomaly = useResolveAnomaly();

  const isLoading = ordersLoading || vehiclesLoading || dexLoading || anomaliesLoading;
  const slaSettings = normalizeSlaSettings(rawSlaSettings as Record<string, unknown>);
  const exceptionSettings = normalizeExceptionSettings(rawExceptionSettings as Record<string, unknown>);

  const getUtilization = (vehicleId: string) => {
    return (utilization as Record<string, number>)[vehicleId] ?? 0;
  };

  const { exceptions: rawExceptions } = useMemo(() => {
    if (!orderData) return { exceptions: [] as ExceptionItem[], counts: { delays: 0, missingData: 0, capacity: 0, sla: 0, delivery: 0 } };

    const items: ExceptionItem[] = [];
    const now = Date.now();
    const slaDeadlineMs = slaSettings.deadlineHours * 60 * 60 * 1000;
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
      return slaSettings.enabled && receivedAt && now - new Date(receivedAt).getTime() > slaDeadlineMs;
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
  }, [anomalies, deliveryExceptions, orderData, slaSettings.deadlineHours, slaSettings.enabled, vehicles]);

  const { exceptions, counts } = useMemo(() => {
    if (!orderData) {
      return {
        exceptions: [] as ExceptionItem[],
        counts: { delays: 0, missingData: 0, capacity: 0, sla: 0, delivery: 0, anomalies: 0 },
      };
    }

    const now = Date.now();
    const slaDeadlineMs = slaSettings.deadlineHours * 60 * 60 * 1000;
    const delayThresholdMs = exceptionSettings.delayThresholdHours * 60 * 60 * 1000;
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

    const filteredDelivery = deliveryExceptions
      .filter(
        (dex) =>
          exceptionSettings.deliveryExceptionsEnabled &&
          isDeliveryTypeEnabled(exceptionSettings, dex.exception_type) &&
          isDeliverySeverityEnabled(exceptionSettings, dex.severity),
      )
      .map((dex) => {
        const isPredicted = dex.exception_type === "PREDICTED_DELAY";
        const tripId = dex.trip_id;
        return {
          id: dex.id,
          type: dexTypeMap[dex.exception_type] || "Vertraging",
          urgency: isPredicted ? "info" : (severityToUrgency[dex.severity] || "warning"),
          orderNumber: dex.order_id ? "Order" : "-",
          clientName: "",
          description: dex.description,
          detectedAt: new Date(dex.created_at),
          actionLabel: isPredicted ? "Bekijk rit" : dex.order_id ? "Bekijk order" : "Details",
          actionTo: isPredicted
            ? (tripId ? `/dispatch?trip=${tripId}` : "/dispatch")
            : dex.order_id
              ? `/orders/${dex.order_id}`
              : "/exceptions",
          source: "db" as const,
        };
      });

    const missingItems = (exceptionSettings.missingDataEnabled
      ? orderData.drafts.filter(
          (o: any) => o.missing_fields && Array.isArray(o.missing_fields) && o.missing_fields.length > 0,
        )
      : []
    ).map((o: any) => ({
      id: `missing-${o.id}`,
      type: "Data mist" as ExceptionType,
      urgency: "warning" as Urgency,
      orderNumber: `#${o.order_number}`,
      clientName: o.client_name || "Onbekend",
      description: `Ontbrekende velden: ${(o.missing_fields as string[]).join(", ")}`,
      detectedAt: new Date(o.received_at || o.created_at),
      actionLabel: "Ga naar inbox",
      actionTo: "/inbox",
      source: "adhoc" as const,
    }));

    const slaItems = orderData.drafts
      .filter((o: any) => {
        const receivedAt = o.received_at || o.created_at;
        return exceptionSettings.slaEnabled && slaSettings.enabled && receivedAt && now - new Date(receivedAt).getTime() > slaDeadlineMs;
      })
      .map((o: any) => ({
        id: `sla-${o.id}`,
        type: "SLA" as ExceptionType,
        urgency: "critical" as Urgency,
        orderNumber: `#${o.order_number}`,
        clientName: o.client_name || "Onbekend",
        description: `Order al ${timeAgo(new Date(o.received_at || o.created_at))} in DRAFT - SLA risico`,
        detectedAt: new Date(o.received_at || o.created_at),
        actionLabel: "Ga naar inbox",
        actionTo: "/inbox",
        source: "adhoc" as const,
      }));

    const delayItems = (exceptionSettings.delayEnabled
      ? orderData.inTransit.filter(
          (o: any) => now - new Date(o.created_at).getTime() > delayThresholdMs,
        )
      : []
    ).map((o: any) => ({
      id: `delay-${o.id}`,
      type: "Vertraging" as ExceptionType,
      urgency: "critical" as Urgency,
      orderNumber: `#${o.order_number}`,
      clientName: o.client_name || "Onbekend",
      description: `Order al meer dan ${exceptionSettings.delayThresholdHours}u onderweg`,
      detectedAt: new Date(o.created_at),
      actionLabel: "Bekijk order",
      actionTo: `/orders/${o.id}`,
      source: "adhoc" as const,
    }));

    const capacityItems = (exceptionSettings.capacityEnabled
      ? vehicles.filter((v) => getUtilization(v.id) >= exceptionSettings.capacityUtilizationThreshold)
      : []
    ).map((v) => ({
      id: `cap-${v.id}`,
      type: "Capaciteit" as ExceptionType,
      urgency: "warning" as Urgency,
      orderNumber: v.code,
      clientName: v.name,
      description: `Voertuig ${v.plate} op ${getUtilization(v.id)}% benutting`,
      detectedAt: new Date(),
      actionLabel: "Bekijk voertuig",
      actionTo: `/vloot/${v.id}`,
      source: "adhoc" as const,
    }));

    const anomalyItems = anomalies
      .filter((a) => exceptionSettings.anomaliesEnabled && anomalyPassesSeverity(exceptionSettings, a.severity))
      .map((a) => {
        const exc = anomalyToException(a);
        return {
          id: exc.id,
          type: (exc.type === "Prijs" || exc.type === "Timing" || exc.type === "Compliance" || exc.type === "Patroon")
            ? "Data mist" as ExceptionType
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
          source: "db" as const,
        };
      });

    const items = [...filteredDelivery, ...missingItems, ...slaItems, ...delayItems, ...capacityItems, ...anomalyItems];
    const urgencyOrder: Record<Urgency, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const uo = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      if (uo !== 0) return uo;
      return a.detectedAt.getTime() - b.detectedAt.getTime();
    });

    return {
      exceptions: items,
      counts: {
        delays: delayItems.length,
        missingData: missingItems.length,
        capacity: capacityItems.length,
        sla: slaItems.length,
        delivery: filteredDelivery.length,
        anomalies: anomalyItems.length,
      },
    };
  }, [
    anomalies,
    deliveryExceptions,
    exceptionSettings,
    orderData,
    rawExceptions,
    slaSettings.deadlineHours,
    slaSettings.enabled,
    utilization,
    vehicles,
  ]);

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

  useEffect(() => {
    if (filteredExceptions.length === 0) {
      setSelectedExceptionId(null);
      return;
    }

    if (!selectedExceptionId || !filteredExceptions.some((exc) => exc.id === selectedExceptionId)) {
      setSelectedExceptionId(filteredExceptions[0].id);
    }
  }, [filteredExceptions, selectedExceptionId]);

  const totalCount = counts.delays + counts.missingData + counts.capacity + counts.sla + counts.delivery + (counts.anomalies ?? 0);

  if (isLoading) {
    return <LoadingState message="Uitzonderingen laden..." />;
  }

  const focusOptions: Array<{ key: ExceptionFocus; label: string }> = [
    { key: "all", label: "Alles" },
    { key: "critical", label: "Kritiek" },
    { key: "today", label: "Vandaag" },
    { key: "copilot", label: "Met voorstel" },
    { key: "open", label: "Open werk" },
  ];

  const formatFocusCount = (value: number) => {
    if (value <= 0) return null;
    if (value > 999) return "999+";
    if (value > 99) return "99+";
    return String(value);
  };

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

  const selectedException =
    filteredExceptions.find((exc) => exc.id === selectedExceptionId) ??
    filteredExceptions[0] ??
    null;

  const selectedExceptionSourceType = selectedException ? mapExceptionToSourceType(selectedException) : null;
  const selectedExceptionSourceKey = selectedException && selectedExceptionSourceType
    ? `${selectedExceptionSourceType}:${selectedException.id}`
    : null;
  const selectedActions = selectedExceptionSourceKey ? actionsBySource.get(selectedExceptionSourceKey) ?? [] : [];
  const selectedRecommendedAction = selectedActions.find((action) => action.recommended && action.status === "PENDING") ?? selectedActions[0] ?? null;
  const selectedSuggestion = selectedException ? buildSuggestedAction(selectedException) : null;
  const SelectedActionIcon = selectedRecommendedAction || selectedSuggestion
    ? copilotIconByAction[(selectedRecommendedAction?.actionType ?? selectedSuggestion?.actionType ?? "")] ?? Wand2
    : Wand2;

  const summaryCards = [
    {
      label: "Directe aandacht",
      value: focusCounts.critical,
      hint: "kritieke uitzonderingen",
      icon: AlertTriangle,
      tone: "text-red-600",
      surface: "bg-red-50/80 dark:bg-red-950/30",
      ring: "border-red-200/80 dark:border-red-900/80",
      target: "critical" as const,
    },
    {
      label: "Actueel",
      value: focusCounts.today,
      hint: "vandaag gedetecteerd",
      icon: Clock,
      tone: "text-amber-600",
      surface: "bg-amber-50/80 dark:bg-amber-950/30",
      ring: "border-amber-200/80 dark:border-amber-900/80",
      target: "today" as const,
    },
    {
      label: "Voorstel beschikbaar",
      value: focusCounts.copilot,
      hint: "met aanbevolen vervolgstap",
      icon: Bot,
      tone: "text-[hsl(var(--gold-deep))]",
      surface: "bg-[hsl(var(--gold-soft)/0.3)]",
      ring: "border-[hsl(var(--gold)/0.2)]",
      target: "copilot" as const,
    },
  ];

  return (
    <div className="page-container space-y-5">
      <div className="relative pb-2 pt-2">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-6 -top-5 h-24 w-56"
          style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.5), transparent 72%)" }}
        />
        <div className="relative flex items-end justify-between gap-5 flex-wrap">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
              <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))]">
                Triage
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums">
                {totalCount} {totalCount === 1 ? "uitzondering" : "uitzonderingen"}
              </span>
            </div>
            <h1
              className="text-[2rem] font-semibold leading-[1.05] tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Uitzonderingen
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Beoordeel uitzonderingen op basis van prioriteit, context en aanbevolen vervolgstappen.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),hsl(var(--background))_30%)] p-4 shadow-[0_24px_60px_-40px_hsl(var(--gold-deep)/0.28)]">
        <div className="flex flex-wrap gap-2 rounded-[1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-1">
          {focusOptions.map((option) => {
            const countLabel = formatFocusCount(focusCounts[option.key]);

            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setFocus(option.key)}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-[0.85rem] px-3.5 py-2 text-xs font-medium transition-all whitespace-nowrap",
                  focus === option.key
                    ? "bg-[linear-gradient(90deg,hsl(var(--gold-soft)/0.7),hsl(var(--gold-soft)/0.3))] text-[hsl(var(--gold-deep))] shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.12)]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{option.label}</span>
                {countLabel && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                      focus === option.key
                        ? "bg-[hsl(var(--gold)/0.18)] text-[hsl(var(--gold-deep))]"
                        : "bg-[hsl(var(--background)/0.85)] text-foreground/80 shadow-[inset_0_0_0_1px_hsl(var(--gold)/0.12)]",
                    )}
                  >
                    {countLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
        <section className="rounded-[1.5rem] border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),hsl(var(--background))_30%)] p-4 shadow-[0_24px_60px_-40px_hsl(var(--gold-deep)/0.28)] xl:sticky xl:top-4 xl:self-start">
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              Prioriteiten
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">Aandachtspunten</h2>
          </div>

          <div className="space-y-3">
            {summaryCards.map((card) => (
              <button
                key={card.label}
                type="button"
                onClick={() => setFocus(card.target)}
                className={cn(
                  "w-full rounded-[1.15rem] border p-3 text-left transition-all",
                  card.ring,
                  card.surface,
                  focus === card.target && "shadow-[0_18px_36px_-30px_hsl(var(--gold-deep)/0.3)] ring-1 ring-[hsl(var(--gold)/0.16)]",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{card.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
                  </div>
                  <div className={cn("rounded-[0.9rem] p-2.5", card.surface)}>
                    <card.icon className={cn("h-4 w-4", card.tone)} />
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-[1.15rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-3">
            <p className="text-xs font-medium text-foreground">Bronoverzicht</p>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Delivery exceptions</span>
                <span className="font-medium text-foreground">{counts.delivery}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Brain className="h-3.5 w-3.5" /> Anomalies</span>
                <span className="font-medium text-foreground">{counts.anomalies ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Package className="h-3.5 w-3.5" /> Intake en gegevens</span>
                <span className="font-medium text-foreground">{counts.missingData + counts.sla}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Truck className="h-3.5 w-3.5" /> Capaciteit</span>
                <span className="font-medium text-foreground">{counts.capacity}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),hsl(var(--background))_30%)] shadow-[0_24px_60px_-40px_hsl(var(--gold-deep)/0.28)]">
          <div className="border-b border-[hsl(var(--gold)/0.12)] px-5 py-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                  Werkvoorraad
                </p>
                <h2 className="mt-1 text-sm font-semibold text-foreground">Uitzonderingenoverzicht</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {filteredExceptions.length} getoond van {exceptions.length}
              </span>
            </div>
          </div>

          {filteredExceptions.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title={exceptions.length === 0 ? "Geen uitzonderingen" : "Geen uitzonderingen in deze focus"}
              description={exceptions.length === 0 ? "Er zijn momenteel geen uitzonderingen die opvolging vereisen." : "Kies een andere focus om aanvullende uitzonderingen te tonen."}
            />
          ) : (
            <div className="divide-y divide-[hsl(var(--gold)/0.08)]">
              {filteredExceptions.map((exc, i) => {
                const uc = urgencyConfig[exc.urgency];
                const sourceType = mapExceptionToSourceType(exc);
                const sourceKey = `${sourceType}:${exc.id}`;
                const actions = actionsBySource.get(sourceKey) ?? [];
                const recommendedAction = actions.find((action) => action.recommended && action.status === "PENDING") ?? actions[0] ?? null;
                const suggestion = buildSuggestedAction(exc);
                const isSelected = selectedException?.id === exc.id;

                return (
                  <motion.button
                    key={exc.id}
                    type="button"
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setSelectedExceptionId(exc.id)}
                    className={cn(
                      "w-full px-5 py-4 text-left transition-colors",
                      isSelected ? "bg-[hsl(var(--gold-soft)/0.12)]" : "hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-start gap-4">
                      <div className={cn("rounded-full p-1.5 ring-1", uc.bg, uc.ring)}>
                        <AlertTriangle className={cn("h-4 w-4", uc.color)} strokeWidth={2} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn("text-xs font-medium shrink-0", typeBadgeColor[exc.type])}
                          >
                            {exc.type}
                          </Badge>
                          <span className="text-sm font-medium text-foreground">{exc.orderNumber}</span>
                          {exc.clientName && (
                            <span className="text-xs text-muted-foreground">{exc.clientName}</span>
                          )}
                          <span className="rounded-full border border-[hsl(var(--gold)/0.12)] px-2 py-0.5 text-[10px] text-muted-foreground">
                            {getUrgencyLabel(exc.urgency)}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-foreground">{exc.description}</p>

                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="chiplet">
                            {recommendedAction ? recommendedAction.title : suggestion.title}
                          </span>
                          <span className="chiplet">
                            {Math.round(recommendedAction?.confidence ?? suggestion.confidence)}% confidence
                          </span>
                          {recommendedAction && <span className="chiplet">{recommendedAction.status}</span>}
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">{timeAgo(exc.detectedAt)}</p>
                        <p className="mt-2 text-[11px] font-medium text-[hsl(var(--gold-deep))]">
                          {recommendedAction ? "Copilot klaar" : "Voorstel beschikbaar"}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[1.5rem] border border-[hsl(var(--gold)/0.14)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),hsl(var(--background))_30%)] p-4 shadow-[0_24px_60px_-40px_hsl(var(--gold-deep)/0.28)] xl:sticky xl:top-4 xl:self-start">
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              Detail
            </p>
            <h2 className="mt-1 text-sm font-semibold text-foreground">
              {selectedException ? selectedException.orderNumber : "Geen uitzondering geselecteerd"}
            </h2>
          </div>

          {!selectedException || !selectedSuggestion ? (
            <div className="rounded-[1.2rem] border border-[hsl(var(--gold)/0.1)] bg-[hsl(var(--gold-soft)/0.08)] px-4 py-12 text-center">
              <p className="text-sm font-medium text-foreground">Selecteer een uitzondering</p>
              <p className="mt-1 text-xs text-muted-foreground">Dan verschijnen context en aanbevolen actie hier.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Type</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge variant="outline" className={cn("text-xs font-medium", typeBadgeColor[selectedException.type])}>
                      {selectedException.type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{timeAgo(selectedException.detectedAt)}</span>
                  </div>
                </div>

                <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.08)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Urgentie</p>
                  <p className="mt-2 text-sm font-medium text-foreground">{getUrgencyLabel(selectedException.urgency)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{selectedException.clientName || "Zonder klantlabel"}</p>
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--background))] p-4">
                <h3 className="text-sm font-semibold text-foreground">Context</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{selectedException.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chiplet">{selectedException.actionLabel}</span>
                  <span className="chiplet">{selectedException.source === "db" ? "Live bron" : "Ad-hoc detectie"}</span>
                </div>
              </div>

              <div className="rounded-[1.1rem] border border-[hsl(var(--gold)/0.12)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.18),hsl(var(--background)))] p-4">
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[1rem] bg-[hsl(var(--gold-soft)/0.55)] text-[hsl(var(--gold-deep))]">
                    <SelectedActionIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                      Next Best Action
                    </p>
                    <h3 className="mt-0.5 text-sm font-semibold text-foreground">
                      {selectedRecommendedAction?.title ?? selectedSuggestion.title}
                    </h3>
                  </div>
                </div>

                <p className="text-sm leading-relaxed text-muted-foreground">
                  {selectedRecommendedAction?.description ?? selectedSuggestion.description}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="chiplet">
                    {String((selectedRecommendedAction?.impact?.summary as string | undefined) ?? selectedSuggestion.impact.summary ?? "Snellere exception-afhandeling")}
                  </span>
                  <span className="chiplet">
                    {selectedRecommendedAction?.requiresApproval ?? selectedSuggestion.requiresApproval ? "Planner approval nodig" : "Mag autonoom"}
                  </span>
                  <span className="chiplet">
                    {Math.round(selectedRecommendedAction?.confidence ?? selectedSuggestion.confidence)}% confidence
                  </span>
                </div>

                <div className="mt-4 rounded-[1rem] border border-white/40 bg-white/60 p-3 dark:bg-white/5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Verwachte impact
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {String((selectedRecommendedAction?.impact?.summary as string | undefined) ?? selectedSuggestion.impact.summary ?? "Snellere exception-afhandeling")}
                  </p>

                  <div className="mt-3 flex flex-col gap-2">
                    {selectedRecommendedAction ? (
                      <>
                        {selectedRecommendedAction.status === "PENDING" && (
                          <>
                            <Button
                              size="sm"
                              className="w-full gap-1.5"
                              onClick={() => updateExceptionActionStatus.mutate({
                                id: selectedRecommendedAction.id,
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
                                id: selectedRecommendedAction.id,
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
                          variant={selectedRecommendedAction.status === "PENDING" ? "outline" : "default"}
                          className="w-full gap-1.5"
                          onClick={() => executeExceptionAction.mutate({
                            actionId: selectedRecommendedAction.id,
                            actionType: selectedRecommendedAction.actionType,
                            payload: {
                              ...selectedRecommendedAction.payload,
                              requiresApproval: selectedRecommendedAction.requiresApproval,
                              currentStatus: selectedRecommendedAction.status,
                            },
                          })}
                          disabled={
                            executeExceptionAction.isPending ||
                            (selectedRecommendedAction.requiresApproval && selectedRecommendedAction.status !== "APPROVED")
                          }
                        >
                          <Play className="h-3.5 w-3.5" />
                          Nu uitvoeren
                        </Button>
                        <CopilotHistory actionId={selectedRecommendedAction.id} />
                      </>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => handleSaveSuggestion(selectedException, selectedSuggestion)}
                        disabled={createExceptionAction.isPending}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Opslaan als voorstel
                      </Button>
                    )}

                    {selectedException.source === "db" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-1.5 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40"
                        disabled={resolveException.isPending || resolveAnomaly.isPending}
                        onClick={() => {
                          if (selectedException.id.startsWith("anomaly-")) {
                            resolveAnomaly.mutate({ id: selectedException.id.replace("anomaly-", "") });
                          } else {
                            resolveException.mutate(selectedException.id);
                          }
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Markeer als opgelost
                      </Button>
                    )}

                    <Button variant="ghost" size="sm" asChild className="w-full gap-1.5">
                      <Link to={selectedException.actionTo}>
                        Open context
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Exceptions;
