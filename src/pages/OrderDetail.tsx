import { useParams, Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import {
  ArrowLeft, MapPin, Package, Truck, User, Clock, FileText,
  MessageSquare, AlertTriangle, XCircle, Edit, CheckCircle2,
  Undo2, Send, Loader2, Printer, Warehouse, ScrollText, Image,
  Save, X, Bell, Route, ArrowRight, Barcode
} from "lucide-react";
import { useShipment } from "@/hooks/useShipments";
import { ClickableAddress } from "@/components/ClickableAddress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge, type OrderStatus } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import SmartLabel from "@/components/orders/SmartLabel";
import PodViewer from "@/components/orders/PodViewer";
import CMRDocument from "@/components/orders/CMRDocument";
import LabelWorkshop from "@/components/orders/LabelWorkshop";
import { RecipientFields } from "@/components/orders/RecipientFields";
import { ReturnOrdersList } from "@/components/orders/ReturnOrdersList";
import { NotificationLogPanel } from "@/components/orders/NotificationLogPanel";
import OrderTimeline from "@/components/orders/OrderTimeline";
import { OrderInfoRequestsCard } from "@/components/orders/OrderInfoRequestsCard";
import { OrderPricePreview } from "@/components/orders/OrderPricePreview";
import { InfoStatusBadge } from "@/components/orders/InfoStatusBadge";
import { FollowFromClientPopover } from "@/components/orders/FollowFromClientPopover";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useCreateInvoice, useCalculateOrderCost } from "@/hooks/useInvoices";
import { useUpdateOrder } from "@/hooks/useOrders";
import { useDepartments } from "@/hooks/useDepartments";
import { useOrderNotesRead } from "@/hooks/useOrderNotesRead";
import { LuxeDatePicker, LuxeTimeRange } from "@/components/ui/LuxePicker";
import { LuxeSelect } from "@/components/ui/LuxeSelect";
import { Receipt } from "lucide-react";
import { ReturnOrderDialog } from "@/components/orders/ReturnOrderDialog";
import { CreateReturnDialog } from "@/components/orders/CreateReturnDialog";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Nieuw", color: "bg-muted text-muted-foreground" },
  PENDING: { label: "In behandeling", color: "bg-amber-100 text-amber-700 border-amber-200" },
  OPEN: { label: "In behandeling", color: "bg-amber-100 text-amber-700 border-amber-200" }, // legacy
  PLANNED: { label: "Ingepland", color: "bg-violet-100 text-violet-700 border-violet-200" },
  IN_TRANSIT: { label: "Onderweg", color: "bg-primary/10 text-primary border-primary/20" },
  DELIVERED: { label: "Afgeleverd", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "Geannuleerd", color: "bg-destructive/10 text-destructive border-destructive/20" },
};

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant } = useTenantOptional();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [showModifyMode, setShowModifyMode] = useState(false);
  const [showCmr, setShowCmr] = useState(false);
  const [isGeneratingCmr, setIsGeneratingCmr] = useState(false);
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const createInvoiceMutation = useCreateInvoice();
  const { hasUnread: notesHasUnread, markAsRead: markNotesAsRead } = useOrderNotesRead(id);

  useEffect(() => {
    if (notesHasUnread) {
      markNotesAsRead();
    }
  }, [notesHasUnread, markNotesAsRead]);

  // ─── Inline Editing State ───
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [showEditWarning, setShowEditWarning] = useState(false);
  const updateOrderMutation = useUpdateOrder();
  const { data: departments = [] } = useDepartments();

  const startEditing = () => {
    if (!order) return;
    // If status is PLANNED or beyond, show warning first
    const plannedOrBeyond = ["PLANNED", "IN_TRANSIT", "DELIVERED"].includes(order.status);
    if (plannedOrBeyond) {
      setShowEditWarning(true);
      return;
    }
    enterEditMode();
  };

  const enterEditMode = () => {
    if (!order) return;
    setEditForm({
      client_name: order.client_name || "",
      pickup_address: order.pickup_address || "",
      delivery_address: order.delivery_address || "",
      quantity: order.quantity ?? "",
      unit: order.unit || "",
      weight_kg: order.weight_kg ?? "",
      dimensions: order.dimensions || "",
      requirements: (order.requirements || []).join(", "),
      transport_type: order.transport_type || "",
      reference: order.reference || "",
      notes: order.notes || "",
      internal_note: order.internal_note || "",
      priority: order.priority || "normaal",
      time_window_start: order.time_window_start || "",
      time_window_end: order.time_window_end || "",
      pickup_date: (order as any).pickup_date || "",
      delivery_date: (order as any).delivery_date || "",
      department_id: (order as any).department_id || "",
    });
    setIsEditing(true);
    setShowEditWarning(false);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    if (!order) return;
    // Parse requirements back to array
    const reqArray = editForm.requirements
      ? editForm.requirements.split(",").map((r: string) => r.trim()).filter(Boolean)
      : [];

    const updates: Record<string, any> = {
      client_name: editForm.client_name || null,
      pickup_address: editForm.pickup_address || null,
      delivery_address: editForm.delivery_address || null,
      quantity: editForm.quantity ? Number(editForm.quantity) : null,
      unit: editForm.unit || null,
      weight_kg: editForm.weight_kg ? Number(editForm.weight_kg) : null,
      dimensions: editForm.dimensions || null,
      requirements: reqArray,
      transport_type: editForm.transport_type || null,
      reference: editForm.reference || null,
      notes: editForm.notes || null,
      internal_note: editForm.internal_note || null,
      priority: editForm.priority || "normaal",
      time_window_start: editForm.time_window_start || null,
      time_window_end: editForm.time_window_end || null,
      pickup_date: editForm.pickup_date || null,
      delivery_date: editForm.delivery_date || null,
      department_id: editForm.department_id || null,
    };

    try {
      await updateOrderMutation.mutateAsync({ id: order.id, updates });
      toast.success("Order bijgewerkt", { description: `Order #${order.order_number} is opgeslagen` });
      setIsEditing(false);
      setEditForm({});
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
    } catch (e: any) {
      toast.error("Opslaan mislukt", { description: e.message });
    }
  };

  const updateEditField = (field: string, value: any) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    queryFn: async () => {
      // Check local storage first for test orders
      const local = localStorage.getItem('local_test_orders');
      if (local) {
        try {
          const orders = JSON.parse(local);
          const found = orders.find((o: any) => o.id === id);
          if (found) return found;
        } catch (e) {
          console.error("Local order check failed", e);
        }
      }

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  // Shipment voor notes-fallback (zie amber banner onderin) — tanstack-query
  // dedupeert de call van ShipmentBanner hieronder.
  const { data: shipmentForBanner } = useShipment(order?.shipment_id ?? null);

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async ({ orderId, reason }: { orderId: string; reason: string }) => {
      // Update order status to CANCELLED
      const { error } = await supabase.from("orders").update({
        status: "CANCELLED",
        internal_note: reason ? `[GEANNULEERD] ${reason}` : "[GEANNULEERD]",
      }).eq("id", orderId);
      if (error) throw error;

      // If the order was planned with a vehicle, unassign it
      if (order?.vehicle_id) {
        await supabase.from("orders").update({ vehicle_id: null }).eq("id", orderId);
      }
    },
    onSuccess: () => {
      toast.success("Order geannuleerd", { description: `Order #${order?.order_number} is geannuleerd` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setShowCancelDialog(false);
    },
    onError: (e: Error) => {
      toast.error("Fout", { description: e.message });
    },
  });

  // Reopen (undo cancel) mutation
  const reopenMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from("orders").update({
        status: "PENDING",
        internal_note: order?.internal_note?.replace("[GEANNULEERD]", "[HEROPEND]") || "[HEROPEND]",
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order heropend", { description: `Order #${order?.order_number} is terug in behandeling` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  // Mark as received in warehouse mutation (for Exports)
  const markAsReceivedMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (orderId.startsWith("local-")) {
        // Update local storage
        const local = localStorage.getItem('local_test_orders');
        if (local) {
          const orders = JSON.parse(local);
          const updated = orders.map((o: any) => 
            o.id === orderId ? { ...o, warehouse_received_at: new Date().toISOString() } : o
          );
          localStorage.setItem('local_test_orders', JSON.stringify(updated));
        }
        return;
      }

      const { error } = await (supabase.from("orders") as any).update({
        warehouse_received_at: new Date().toISOString(),
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Export binnen gemeld", { description: `Zending #${order?.order_number} is nu gemarkeerd als ontvangen in het warehouse.` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
    },
  });

  // Send confirmation email
  const [isSendingConfirmation, setIsSendingConfirmation] = useState(false);
  const handleSendConfirmation = async () => {
    if (!order) return;
    setIsSendingConfirmation(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-confirmation", {
        body: { orderId: order.id },
      });
      if (error) throw error;
      if (data?.error && !data?.skipped) throw new Error(data.error);
      if (data?.success) {
        toast.success("Bevestiging verzonden", { description: data.message });
      } else if (data?.skipped) {
        toast.error("Overgeslagen", { description: "Geen geldig e-mailadres" });
      }
    } catch (e: any) {
      toast.error("Verzenden mislukt", { description: e.message });
    } finally {
      setIsSendingConfirmation(false);
    }
  };

  const handlePrintLabel = () => {
    // If it's an Export order and not yet received, mark it as received automatically
    const isExport = order?.transport_type?.toUpperCase().includes("AIR") || 
                   order?.transport_type?.toLowerCase().includes("warehouse");
    
    if (isExport && !order.warehouse_received_at) {
      markAsReceivedMutation.mutate(order.id);
    }
    
    window.print();
  };

  // Generate CMR number and save
  const handleGenerateCmr = async () => {
    if (!order) return;
    if (order.cmr_number) {
      // Already generated, just show it
      setShowCmr(true);
      return;
    }
    
    setIsGeneratingCmr(true);
    try {
      const year = new Date().getFullYear();
      const cmrNumber = `RC-CMR-${year}-${String(order.order_number).padStart(4, "0")}`;
      
      const { error } = await (supabase
        .from("orders") as any)
        .update({
          cmr_number: cmrNumber,
          cmr_generated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      
      if (error) throw error;
      
      toast.success("CMR Vrachtbrief gegenereerd", { description: `Nummer: ${cmrNumber}` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      setShowCmr(true);
    } catch (e: any) {
      toast.error("Fout", { description: e.message });
    } finally {
      setIsGeneratingCmr(false);
    }
  };

  const handlePrintCmr = () => {
    setShowCmr(true);
    setTimeout(() => window.print(), 300);
  };

  const handleCreateInvoice = async () => {
    if (!order) return;
    setIsCreatingInvoice(true);
    try {
      // Find or create client
      let clientId: string;
      const { data: existingClients } = await supabase.from("clients").select("id").ilike("name", `%${order.client_name || ""}%`).limit(1);

      if (existingClients && existingClients.length > 0) {
        clientId = existingClients[0].id;
      } else {
        // Auto-create client
        const { data: newClient, error: clientErr } = await supabase.from("clients").insert({
          name: order.client_name || "Onbekende klant",
          email: order.source_email_from || null,
          is_active: true,
        }).select("id").single();
        if (clientErr) throw new Error("Klant kon niet worden aangemaakt: " + clientErr.message);
        clientId = newClient.id;
        toast.success("Klant aangemaakt", { description: order.client_name || "Onbekende klant" });
      }

      // Build invoice lines
      const route = `${order.pickup_address?.split(",")[0] || "Ophaal"} → ${order.delivery_address?.split(",")[0] || "Lever"}`;
      const lines: any[] = [];

      // Check for client rates
      const { data: rates } = await supabase.from("client_rates").select("*").eq("client_id", clientId).eq("is_active", true);

      if (rates && rates.length > 0) {
        rates.forEach((rate: any, i: number) => {
          let qty = 1, unit = "stuk", desc = rate.description || rate.rate_type;
          if (rate.rate_type === "per_pallet") { qty = order.quantity || 1; unit = "pallet"; desc = desc || "Palletvervoer"; }
          else if (rate.rate_type === "per_km") { qty = order.weight_kg || 1; unit = "km"; desc = desc || "Kilometertarief"; }
          else if (rate.rate_type === "per_rit") { qty = 1; unit = "rit"; desc = desc || "Rittarief"; }
          else { desc = desc || "Toeslag"; }
          lines.push({ order_id: order.id, description: `${desc} — ${route}`, quantity: qty, unit, unit_price: rate.amount, total: qty * rate.amount, sort_order: i });
        });
      } else {
        // No rates — create a standard transport line
        const estimatedPrice = Math.round((order.weight_kg || 100) * 0.15 + (order.quantity || 1) * 25);
        lines.push({
          order_id: order.id,
          description: `Transport #${order.order_number} — ${route}`,
          quantity: 1,
          unit: "rit",
          unit_price: estimatedPrice,
          total: estimatedPrice,
          sort_order: 0,
        });
        if (order.quantity && order.quantity > 1) {
          lines.push({
            order_id: order.id,
            description: `Handling ${order.quantity} ${order.unit || "pallets"}`,
            quantity: order.quantity,
            unit: order.unit?.toLowerCase() || "pallet",
            unit_price: 15,
            total: order.quantity * 15,
            sort_order: 1,
          });
        }
      }

      await createInvoiceMutation.mutateAsync({ client_id: clientId, lines });

      // Link invoice to order
      toast.success("Factuur aangemaakt", { description: `Factuur voor order #${order.order_number} — ${lines.length} regel(s)` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      console.error("Invoice creation error:", e);
      toast.error("Factuur aanmaken mislukt", { description: e.message || "Onbekende fout" });
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Order laden..." />;
  }

  if (!order) {
    return (
      <EmptyState
        icon={Package}
        title="Order niet gevonden"
        description="De gevraagde order bestaat niet of is verwijderd."
        action={<Link to="/orders"><Button variant="outline">Terug naar orders</Button></Link>}
      />
    );
  }

  const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.DRAFT;
  const isCancelled = order.status === "CANCELLED";
  const isPrintable = order.status !== "CANCELLED"; // Printable for DRAFT, OPEN, PLANNED, DELIVERED
  const isActive = order.status === "PENDING" || order.status === "OPEN" || order.status === "PLANNED";
  const requirements = (order.requirements || []) as string[];

  // Build audit trail from order timestamps
  const auditTrail: { time: string; label: string; icon: any; color?: string }[] = [];
  if (order.received_at) auditTrail.push({ time: new Date(order.received_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "E-mail ontvangen", icon: FileText });
  if (order.created_at) auditTrail.push({ time: new Date(order.created_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: order.confidence_score ? `AI extractie (${order.confidence_score}% zekerheid)` : "Order aangemaakt", icon: Package });
  if (order.follow_up_sent_at) auditTrail.push({ time: new Date(order.follow_up_sent_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Follow-up verstuurd", icon: Send });
  if (order.status === "PENDING" || order.status === "OPEN") auditTrail.push({ time: new Date(order.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Goedgekeurd door planner", icon: CheckCircle2 });
  if (order.warehouse_received_at) auditTrail.push({ time: new Date(order.warehouse_received_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Zending ontvangen (Magazijn)", icon: Warehouse });
  if (order.cmr_generated_at) auditTrail.push({ time: new Date(order.cmr_generated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: `CMR vrachtbrief: ${order.cmr_number}`, icon: ScrollText });
  if (order.vehicle_id) auditTrail.push({ time: new Date(order.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: `Voertuig toegewezen`, icon: Truck });
  if (order.pod_signed_at) auditTrail.push({ time: new Date(order.pod_signed_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: `PoD ontvangen${order.pod_signed_by ? ` (${order.pod_signed_by})` : ""}`, icon: Image });
  if (isCancelled) auditTrail.push({ time: new Date(order.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Geannuleerd", icon: XCircle, color: "text-destructive" });

  return (
    <div className="space-y-6">
      {/* Luxe order-header — premium 2026 editorial stijl */}
      <div className="relative pb-3 pt-2">
        {/* Radial gold glow top-left — subtiele atmosferische gloed */}
        <div
          aria-hidden
          className="absolute -top-6 -left-8 w-64 h-32 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)",
          }}
        />

        <div className="relative flex items-start gap-5">
          {/* Back arrow — luxe pill */}
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Terug"
            className="shrink-0 mt-1 h-9 w-9 rounded-full border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] hover:border-[hsl(var(--gold)/0.5)] hover:bg-[hsl(var(--gold-soft)/0.6)] transition-all flex items-center justify-center"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Titelblok */}
          <div className="flex-1 min-w-0">
            {/* Eyebrow: label + formele order-code */}
            <div className="flex items-center gap-2 mb-2" style={{ fontFamily: "var(--font-display)" }}>
              <span
                aria-hidden
                className="inline-block h-[1px] w-6"
                style={{ background: "hsl(var(--gold) / 0.5)" }}
              />
              <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
                Orderdossier
              </span>
              <span
                aria-hidden
                className="inline-block h-[3px] w-[3px] rounded-full"
                style={{ background: "hsl(var(--gold) / 0.5)" }}
              />
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums font-medium">
                {`RCS-${new Date(order.created_at).getFullYear()}-${String(order.order_number).padStart(4, "0")}`}
              </span>
            </div>

            {/* Klantnaam — editorial hoofdtitel */}
            <h1
              className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-foreground truncate"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {order.client_name || "Onbekende klant"}
            </h1>

            {/* Subtle under-line: nr + datum */}
            <div
              className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70"
              style={{ fontFamily: "var(--font-display)" }}
            >
              <span className="tabular-nums">
                Nr. <span className="text-foreground/80 font-medium">{String(order.order_number).padStart(4, "0")}</span>
              </span>
              <span aria-hidden className="h-3 w-px" style={{ background: "hsl(var(--gold) / 0.25)" }} />
              <span className="tabular-nums">
                {new Date(order.created_at).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            </div>
          </div>

          {/* Status-badges + acties-menu */}
          <div className="flex items-center gap-2 shrink-0 mt-2">
            <StatusBadge status={order.status as OrderStatus} variant="luxe" />
            <InfoStatusBadge status={order.info_status} />

            {/* Acties icon-button → opent alle acties */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Acties"
                  className="btn-luxe h-9 w-9 p-0 justify-center ml-1"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={6}
                className="min-w-[240px] py-1.5 border-[hsl(var(--gold)/0.3)] shadow-[0_4px_12px_-2px_hsl(var(--ink)/0.08),0_24px_48px_-12px_hsl(var(--ink)/0.2),0_0_0_1px_hsl(var(--gold)/0.08)] [&_[role=menuitem]]:font-display [&_[role=menuitem]]:text-[13px] [&_[role=menuitem]]:px-3 [&_[role=menuitem]]:py-2 [&_[role=menuitem]]:gap-3 [&_[role=menuitem]_svg]:h-4 [&_[role=menuitem]_svg]:w-4 [&_[role=menuitem]_svg]:shrink-0 [&_[role=menuitem]_svg]:text-[hsl(var(--gold-deep))] [&_[role=menuitem]:hover]:bg-[hsl(var(--gold-soft)/0.6)] [&_[role=menuitem]:hover]:text-[hsl(var(--gold-deep))] [&_[role=menuitem]:focus]:bg-[hsl(var(--gold-soft)/0.6)] [&_[role=menuitem]:focus]:text-[hsl(var(--gold-deep))]"
              >
                {!isCancelled && !isEditing && (
                  <DropdownMenuItem onClick={startEditing}>
                    <Edit />
                    <span>Bewerken</span>
                  </DropdownMenuItem>
                )}
                {isEditing && (
                  <>
                    <DropdownMenuItem onClick={handleSaveEdit} disabled={updateOrderMutation.isPending}>
                      {updateOrderMutation.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                      <span>Opslaan</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={cancelEditing}>
                      <X />
                      <span>Bewerken annuleren</span>
                    </DropdownMenuItem>
                  </>
                )}
                {isActive && !isEditing && (
                  <DropdownMenuItem onClick={handleSendConfirmation} disabled={isSendingConfirmation}>
                    {isSendingConfirmation ? <Loader2 className="animate-spin" /> : <Send />}
                    <span>Bevestiging versturen</span>
                  </DropdownMenuItem>
                )}
                {!isEditing && isPrintable && (
                  <DropdownMenuItem onClick={handleGenerateCmr} disabled={isGeneratingCmr}>
                    {isGeneratingCmr ? <Loader2 className="animate-spin" /> : <ScrollText />}
                    <span>{order.cmr_number ? `CMR bekijken (${order.cmr_number})` : "CMR genereren"}</span>
                  </DropdownMenuItem>
                )}
                {!isEditing && order.cmr_number && (
                  <DropdownMenuItem onClick={handlePrintCmr}>
                    <Printer />
                    <span>Print CMR</span>
                  </DropdownMenuItem>
                )}
                {!isEditing && (order.status === "DELIVERED" || order.status === "PENDING" || order.status === "IN_TRANSIT") && !order.invoice_id && (
                  <DropdownMenuItem onClick={handleCreateInvoice} disabled={isCreatingInvoice}>
                    {isCreatingInvoice ? <Loader2 className="animate-spin" /> : <Receipt />}
                    <span>Factuur aanmaken</span>
                  </DropdownMenuItem>
                )}
                {!isEditing && order.invoice_id && (
                  <DropdownMenuItem asChild>
                    <Link to={`/facturatie`} className="flex items-center gap-3 w-full">
                      <Receipt />
                      <span>Factuur bekijken</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                {!isEditing && !isCancelled && (order as any).order_type !== "RETOUR" && (
                  <DropdownMenuItem onClick={() => setShowReturnDialog(true)}>
                    <Undo2 />
                    <span>Retour aanmaken</span>
                  </DropdownMenuItem>
                )}
                {/* Label workshop — opent eigen Dialog, gestyled als DropdownMenuItem */}
                {!isEditing && isPrintable && (
                  <LabelWorkshop
                    order={order}
                    triggerClassName="font-display text-[13px] px-3 py-2 gap-3 w-full flex items-center rounded-sm cursor-pointer outline-none transition-colors hover:bg-[hsl(var(--gold-soft)/0.6)] hover:text-[hsl(var(--gold-deep))] focus:bg-[hsl(var(--gold-soft)/0.6)] focus:text-[hsl(var(--gold-deep))]"
                    triggerChildren={
                      <>
                        <Barcode className="h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
                        <span>Label workshop</span>
                      </>
                    }
                  />
                )}
                {!isEditing && isCancelled && (
                  <DropdownMenuItem onClick={() => reopenMutation.mutate(order.id)} disabled={reopenMutation.isPending}>
                    {reopenMutation.isPending ? <Loader2 className="animate-spin" /> : <Undo2 />}
                    <span>Order heropenen</span>
                  </DropdownMenuItem>
                )}
                {isActive && !isEditing && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setShowCancelDialog(true)}
                      className="!text-destructive hover:!bg-destructive/10 hover:!text-destructive focus:!bg-destructive/10 focus:!text-destructive [&>svg]:!text-destructive"
                    >
                      <XCircle />
                      <span>Order annuleren</span>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Shipment context banner (toont andere legs uit dezelfde shipment) */}
      <ShipmentBanner shipmentId={order.shipment_id ?? null} currentOrderId={order.id} />

      {/* Cancellation banner — luxe gold-soft */}
      {isCancelled && (
        <div className="rounded-xl border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.4)] p-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-[hsl(var(--gold-deep))] shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              Deze order is geannuleerd
            </p>
            {order.internal_note?.includes("[GEANNULEERD]") && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {order.internal_note.replace("[GEANNULEERD] ", "").replace("[GEANNULEERD]", "")}
              </p>
            )}
          </div>
          <button
            className="btn-luxe shrink-0"
            onClick={() => reopenMutation.mutate(order.id)}
            disabled={reopenMutation.isPending}
          >
            {reopenMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Heropen
          </button>
        </div>
      )}

      {/* Referentie & Opmerkingen — subtiele banner, zichtbaar maar niet schreeuwerig.
          Toont order-specifieke notitie en (separaat) de shipment-breed notitie als die er is. */}
      {(order.notes?.trim() || order.reference?.trim() || shipmentForBanner?.notes?.trim()) && (
        <div className="rounded-lg border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.4)] px-4 py-3 flex items-start gap-3">
          <MessageSquare className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold tracking-wide text-[hsl(var(--gold-deep))] uppercase" style={{ fontFamily: "var(--font-display)" }}>
                Referentie & Opmerkingen
              </p>
              {tenant?.id && (
                <FollowFromClientPopover
                  orderId={order.id}
                  tenantId={tenant.id}
                  pickupAtIso={order.time_window_start ?? null}
                />
              )}
            </div>
            {order.reference?.trim() && (
              <p className="text-sm text-foreground/90">
                <span className="text-muted-foreground">Ref: </span>{order.reference}
              </p>
            )}
            {shipmentForBanner?.notes?.trim() && (
              <div className="text-sm text-foreground/90">
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block mb-0.5">
                  Notitie shipment
                </span>
                <p className="whitespace-pre-wrap">{shipmentForBanner.notes}</p>
              </div>
            )}
            {order.notes?.trim() && (
              <div className="text-sm text-foreground/90">
                {shipmentForBanner?.notes?.trim() && (
                  <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase block mb-0.5">
                    Notitie deze leg
                  </span>
                )}
                <p className="whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* §22 Info-tracking — altijd zichtbaar zodat planner kan toevoegen */}
          <OrderInfoRequestsCard
            orderId={order.id}
            pickupAtIso={order.time_window_start ?? null}
          />

          {/* Route & Lading — luxe card, matches new-order-redesign */}
          <section className="card--luxe relative p-6 sm:p-7">
            <span className="card-chapter">I</span>
            <div className="mb-5">
              <div className="section-label flex items-center gap-2">
                <MapPin className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                Vrachtdossier
              </div>
              <h3 className="section-title">Route & Lading</h3>
            </div>
            <div className="space-y-4">
              {/* Client name — editable */}
              {isEditing && (
                <div>
                  <label className="label-luxe">Klantnaam</label>
                  <input
                    className="field-luxe"
                    value={editForm.client_name ?? ""}
                    onChange={(e) => updateEditField("client_name", e.target.value)}
                    placeholder="Klantnaam"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4 text-sm">
                <div>
                  <label className="label-luxe">Ophaaladres</label>
                  {isEditing ? (
                    <input
                      className="field-luxe"
                      value={editForm.pickup_address ?? ""}
                      onChange={(e) => updateEditField("pickup_address", e.target.value)}
                      placeholder="Ophaaladres"
                    />
                  ) : (
                    <p className="font-medium">
                      <ClickableAddress address={order.pickup_address} iconClassName="text-[hsl(var(--gold-deep))]" />
                    </p>
                  )}
                </div>
                <div>
                  <label className="label-luxe">Afleveradres</label>
                  {isEditing ? (
                    <input
                      className="field-luxe"
                      value={editForm.delivery_address ?? ""}
                      onChange={(e) => updateEditField("delivery_address", e.target.value)}
                      placeholder="Afleveradres"
                    />
                  ) : (
                    <p className="font-medium">
                      <ClickableAddress address={order.delivery_address} iconClassName="text-[hsl(var(--gold))]" />
                    </p>
                  )}
                </div>
              </div>
              <div className="hairline" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 gap-y-4 text-sm">
                <div>
                  <label className="label-luxe">Aantal</label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        className="field-luxe"
                        value={editForm.quantity ?? ""}
                        onChange={(e) => updateEditField("quantity", e.target.value)}
                        placeholder="0"
                      />
                      <input
                        className="field-luxe"
                        value={editForm.unit ?? ""}
                        onChange={(e) => updateEditField("unit", e.target.value)}
                        placeholder="pallets"
                      />
                    </div>
                  ) : (
                    <p className="font-semibold">{order.quantity || "—"} {order.unit || ""}</p>
                  )}
                </div>
                <div>
                  <label className="label-luxe">Gewicht</label>
                  {isEditing ? (
                    <input
                      type="number"
                      className="field-luxe"
                      value={editForm.weight_kg ?? ""}
                      onChange={(e) => updateEditField("weight_kg", e.target.value)}
                      placeholder="kg"
                    />
                  ) : (
                    <p className="font-semibold">
                      {order.weight_kg ? `${order.weight_kg} kg${order.is_weight_per_unit ? " /stuk" : ""}` : "—"}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label-luxe">Afmetingen</label>
                  {isEditing ? (
                    <input
                      className="field-luxe"
                      value={editForm.dimensions ?? ""}
                      onChange={(e) => updateEditField("dimensions", e.target.value)}
                      placeholder="120x80x150"
                    />
                  ) : (
                    <p className="font-semibold">{order.dimensions || "—"}</p>
                  )}
                </div>
                <div>
                  <label className="label-luxe">Type</label>
                  {isEditing ? (
                    <LuxeSelect
                      value={editForm.transport_type || ""}
                      onChange={(v) => updateEditField("transport_type", v)}
                      placeholder="Selecteer..."
                      options={[
                        { value: "FTL", label: "FTL" },
                        { value: "LTL", label: "LTL" },
                        { value: "koel", label: "Koel" },
                        { value: "retour", label: "Retour" },
                        { value: "express", label: "Express" },
                        { value: "WAREHOUSE_AIR", label: "Warehouse → Air" },
                      ]}
                    />
                  ) : (
                    <p className="font-semibold">
                      {order.transport_type === "WAREHOUSE_AIR" || order.transport_type === "warehouse-air"
                        ? "Warehouse → Air" : order.transport_type || "Direct"}
                    </p>
                  )}
                </div>
              </div>
              {/* Requirements */}
              {isEditing ? (
                <>
                  <div className="hairline" />
                  <div>
                    <label className="label-luxe">Vereisten <span className="text-muted-foreground/60 font-normal">(komma-gescheiden)</span></label>
                    <input
                      className="field-luxe"
                      value={editForm.requirements ?? ""}
                      onChange={(e) => updateEditField("requirements", e.target.value)}
                      placeholder="ADR, koelwagen, laadklep"
                    />
                  </div>
                </>
              ) : requirements.length > 0 ? (
                <>
                  <Separator />
                  <div>
                    <label className="label-luxe">Vereisten</label>
                    <div className="flex gap-2">
                      {requirements.map((req) => (
                        <Badge key={req} variant="outline" className="text-xs">
                          {req === "ADR" && <AlertTriangle className="h-3 w-3 mr-1 text-amber-500" />}
                          {req}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}

              {/* Uitgebreide edit-velden — luxe styling, identiek aan new-order-redesign */}
              {isEditing && (
                <>
                  <div className="hairline" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
                    <div>
                      <label className="label-luxe">Referentie</label>
                      <input
                        className="field-luxe"
                        value={editForm.reference ?? ""}
                        onChange={(e) => updateEditField("reference", e.target.value)}
                        placeholder="Bestelreferentie"
                      />
                    </div>
                    <div>
                      <label className="label-luxe">Prioriteit</label>
                      <LuxeSelect
                        value={editForm.priority || "normaal"}
                        onChange={(v) => updateEditField("priority", v)}
                        options={[
                          { value: "laag", label: "Laag" },
                          { value: "normaal", label: "Normaal" },
                          { value: "hoog", label: "Hoog" },
                          { value: "spoed", label: "Spoed" },
                        ]}
                      />
                    </div>
                    <div>
                      <label className="label-luxe">Ophaaldatum</label>
                      <LuxeDatePicker
                        value={editForm.pickup_date ?? ""}
                        onChange={(v) => updateEditField("pickup_date", v)}
                        ariaLabel="Kies ophaaldatum"
                      />
                    </div>
                    <div>
                      <label className="label-luxe">Afleverdatum</label>
                      <LuxeDatePicker
                        value={editForm.delivery_date ?? ""}
                        onChange={(v) => updateEditField("delivery_date", v)}
                        ariaLabel="Kies afleverdatum"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label-luxe">Tijdvenster (van — tot)</label>
                      <LuxeTimeRange
                        from={editForm.time_window_start ?? ""}
                        to={editForm.time_window_end ?? ""}
                        onFromChange={(v) => updateEditField("time_window_start", v)}
                        onToChange={(v) => updateEditField("time_window_end", v)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="label-luxe">Afdeling</label>
                      <LuxeSelect
                        value={editForm.department_id || ""}
                        onChange={(v) => updateEditField("department_id", v)}
                        placeholder="Selecteer afdeling"
                        options={departments.map((d) => ({
                          value: d.id,
                          label: `${d.name} (${d.code})`,
                        }))}
                      />
                    </div>
                  </div>
                  <div className="hairline" />
                  <div>
                    <label className="label-luxe">Opmerkingen <span className="text-muted-foreground/60 font-normal">(zichtbaar voor klant)</span></label>
                    <textarea
                      className="field-luxe"
                      rows={3}
                      value={editForm.notes ?? ""}
                      onChange={(e) => updateEditField("notes", e.target.value)}
                      placeholder="Optioneel — deze opmerking kan met de klant gedeeld worden"
                    />
                  </div>
                  <div>
                    <label className="label-luxe">Interne notitie <span className="text-muted-foreground/60 font-normal">(alleen planning)</span></label>
                    <textarea
                      className="field-luxe"
                      rows={3}
                      value={editForm.internal_note ?? ""}
                      onChange={(e) => updateEditField("internal_note", e.target.value)}
                      placeholder="Alleen intern zichtbaar"
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Source email — luxe */}
          {order.source_email_body && (
            <section className="card--luxe relative p-6 sm:p-7">
              <span className="card-chapter">II</span>
              <div className="mb-5">
                <div className="section-label flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                  Bron
                </div>
                <h3 className="section-title">E-mail origineel</h3>
              </div>
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>{order.source_email_from || "Onbekend"}</span>
                </div>
                <p className="font-medium">{order.source_email_subject}</p>
                <div className="mt-2 rounded-lg bg-[hsl(var(--gold-soft)/0.25)] border border-[hsl(var(--gold)/0.2)] p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{order.source_email_body}</p>
                </div>
              </div>
            </section>
          )}

          {/* Internal note — luxe */}
          {order.internal_note && !order.internal_note.startsWith("[") && (
            <section className="card--luxe relative p-6 sm:p-7">
              <span className="card-chapter">III</span>
              <div className="mb-5">
                <div className="section-label flex items-center gap-2">
                  <MessageSquare className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                  Notities
                </div>
                <h3 className="section-title">Interne aantekeningen</h3>
              </div>
              <p className="text-sm text-muted-foreground">{order.internal_note}</p>
            </section>
          )}

          {/* Recipient & Notifications — luxe */}
          <section className="card--luxe relative p-6 sm:p-7">
            <span className="card-chapter">IV</span>
            <div className="mb-5">
              <div className="section-label flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                Ontvanger
              </div>
              <h3 className="section-title">Contact &amp; notificaties</h3>
            </div>
            {isEditing ? (
              <RecipientFields
                recipientName={editForm.recipient_name ?? order.recipient_name ?? null}
                recipientEmail={editForm.recipient_email ?? order.recipient_email ?? null}
                recipientPhone={editForm.recipient_phone ?? order.recipient_phone ?? null}
                notificationPreferences={
                  editForm.notification_preferences ?? order.notification_preferences ?? { email: true, sms: false }
                }
                onChange={updateEditField}
              />
            ) : (
              <RecipientFields
                recipientName={order.recipient_name ?? null}
                recipientEmail={order.recipient_email ?? null}
                recipientPhone={order.recipient_phone ?? null}
                notificationPreferences={order.notification_preferences ?? { email: true, sms: false }}
                onChange={updateEditField}
                readOnly
              />
            )}
          </section>

          {/* Proof of Delivery */}
          {order.status === "DELIVERED" && (order.pod_signature_url || order.pod_signed_by) && (
            <PodViewer order={order} />
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Tariefberekening, toont per-order pricing uit rate-card + toeslagen */}
          <OrderPricePreview
            clientId={order.client_id ?? null}
            order={{
              id: order.id,
              order_number: order.order_number,
              client_name: order.client_name,
              pickup_address: order.pickup_address,
              delivery_address: order.delivery_address,
              transport_type: order.transport_type,
              weight_kg: order.weight_kg,
              quantity: order.quantity,
              requirements: order.requirements ?? [],
            }}
          />

          {/* Facturatie & documenten, statusoverzicht van CMR, factuur en PoD */}
          <section className="card--luxe relative p-6 sm:p-7">
            <div className="mb-5">
              <div className="section-label flex items-center gap-2">
                <ScrollText className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                Dossier
              </div>
              <h3 className="section-title">Facturatie &amp; documenten</h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3 rounded-md border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.15)] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-display text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold">
                    CMR Vrachtbrief
                  </div>
                  <div className="text-[13px] text-foreground/80 tabular-nums truncate">
                    {order.cmr_number
                      ? `Nummer ${order.cmr_number}`
                      : "Nog niet gegenereerd"}
                  </div>
                </div>
                {order.cmr_number ? (
                  <button
                    type="button"
                    onClick={handlePrintCmr}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))] hover:underline"
                  >
                    <Printer className="h-3 w-3" /> Print
                  </button>
                ) : (
                  isPrintable && (
                    <button
                      type="button"
                      onClick={handleGenerateCmr}
                      disabled={isGeneratingCmr}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))] hover:underline disabled:opacity-50"
                    >
                      {isGeneratingCmr ? <Loader2 className="h-3 w-3 animate-spin" /> : <ScrollText className="h-3 w-3" />}
                      Genereer
                    </button>
                  )
                )}
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.15)] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-display text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold">
                    Factuur
                  </div>
                  <div className="text-[13px] text-foreground/80 truncate">
                    {order.invoice_id ? "Gefactureerd" : "Nog niet gefactureerd"}
                  </div>
                </div>
                {order.invoice_id ? (
                  <Link
                    to="/facturatie"
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))] hover:underline"
                  >
                    <Receipt className="h-3 w-3" /> Bekijk
                  </Link>
                ) : (
                  (order.status === "DELIVERED" || order.status === "PENDING" || order.status === "IN_TRANSIT") && (
                    <button
                      type="button"
                      onClick={handleCreateInvoice}
                      disabled={isCreatingInvoice}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-[hsl(var(--gold-deep))] hover:underline disabled:opacity-50"
                    >
                      {isCreatingInvoice ? <Loader2 className="h-3 w-3 animate-spin" /> : <Receipt className="h-3 w-3" />}
                      Aanmaken
                    </button>
                  )
                )}
              </div>

              <div className="flex items-start justify-between gap-3 rounded-md border border-[hsl(var(--gold)/0.12)] bg-[hsl(var(--gold-soft)/0.15)] px-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-display text-[11px] uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] font-semibold">
                    Proof of Delivery
                  </div>
                  <div className="text-[13px] text-foreground/80 truncate">
                    {order.pod_signed_at
                      ? `Ontvangen${order.pod_signed_by ? `, ${order.pod_signed_by}` : ""}`
                      : "Nog niet ontvangen"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Audit Trail — luxe */}
          <section className="card--luxe relative p-6 sm:p-7">
            <span className="card-chapter">V</span>
            <div className="mb-5">
              <div className="section-label">Historie</div>
              <h3 className="section-title">Tijdlijn</h3>
            </div>
            <div className="space-y-4">
              {auditTrail.map((event, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center">
                    <div className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center",
                      event.color ? "bg-destructive/10" : "bg-[hsl(var(--gold-soft)/0.6)]"
                    )}>
                      <event.icon className={cn("h-3.5 w-3.5", event.color || "text-[hsl(var(--gold-deep))]")} />
                    </div>
                    {i < auditTrail.length - 1 && <div className="w-px h-full bg-[hsl(var(--gold)/0.2)] flex-1 mt-1" />}
                  </div>
                  <div className="pb-4">
                    <p className={cn("font-medium", event.color)}>{event.label}</p>
                    <p className="text-xs text-muted-foreground">{event.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Event Pipeline Timeline — luxe */}
          <section className="card--luxe relative p-6 sm:p-7">
            <span className="card-chapter">VI</span>
            <div className="mb-5">
              <div className="section-label">Automatisering</div>
              <h3 className="section-title">Event pipeline</h3>
            </div>
            <OrderTimeline orderId={order.id} />
          </section>

          {/* Notification Log — luxe */}
          <section className="card--luxe relative p-6 sm:p-7">
            <span className="card-chapter">VII</span>
            <div className="mb-5">
              <div className="section-label flex items-center gap-2">
                <Bell className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))]" />
                Communicatie
              </div>
              <h3 className="section-title">Notificatielogboek</h3>
            </div>
            <NotificationLogPanel orderId={order.id} />
          </section>

          {/* Actions moved to luxe toolbar bovenaan de pagina */}
        </div>
      </div>

      {/* Return orders section */}
      {order.order_type === "ZENDING" && (
        <ReturnOrdersList parentOrderId={order.id} />
      )}
      {order.order_type === "RETOUR" && order.parent_order_id && (
        <p className="text-sm text-muted-foreground">
          Retour van order{" "}
          <Link to={`/orders/${order.parent_order_id}`} className="text-primary hover:underline">
            origineel bekijken
          </Link>
        </p>
      )}

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Order #{order.order_number} annuleren
            </DialogTitle>
            <DialogDescription>
              {order.vehicle_id
                ? "Let op: deze order is al aan een voertuig toegewezen. Bij annulering wordt de toewijzing verwijderd en komt het voertuig vrij voor herplanning."
                : "Weet je zeker dat je deze order wilt annuleren? De klant ontvangt geen automatische notificatie."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p><strong>Klant:</strong> {order.client_name || "Onbekend"}</p>
              <p><strong>Route:</strong> {order.pickup_address || "?"} → {order.delivery_address || "?"}</p>
              {order.vehicle_id && (
                <p className="text-amber-600 font-medium flex items-center gap-1.5 mt-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Voertuig is al toegewezen — wordt automatisch vrijgemaakt
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Reden (optioneel)</label>
              <Textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Bijv. klant heeft gebeld om te annuleren..."
                className="resize-none text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)}>
              Terug
            </Button>
            <Button
              variant="destructive"
              className="gap-1.5"
              onClick={() => cancelMutation.mutate({ orderId: order.id, reason: cancelReason })}
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Annuleer Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Warning Dialog — shown for PLANNED+ orders */}
      <Dialog open={showEditWarning} onOpenChange={setShowEditWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Order is al ingepland
            </DialogTitle>
            <DialogDescription>
              Deze order heeft status <strong>{statusInfo.label}</strong>. Wijzigingen kunnen gevolgen hebben voor de planning en het transport. Weet je zeker dat je wilt bewerken?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditWarning(false)}>
              Annuleren
            </Button>
            <Button className="gap-1.5" onClick={enterEditMode}>
              <Edit className="h-4 w-4" />
              Toch bewerken
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden printable CMR document */}
      {showCmr && <CMRDocument order={order} />}

      {/* Retour order dialog */}
      {showReturnDialog && (
        <ReturnOrderDialog
          open={showReturnDialog}
          onOpenChange={setShowReturnDialog}
          parentOrder={{
            id: order.id,
            order_number: order.order_number,
            client_name: order.client_name,
            tenant_id: order.tenant_id,
            pickup_address: order.pickup_address,
            delivery_address: order.delivery_address,
            weight_kg: order.weight_kg,
            quantity: order.quantity,
            unit: order.unit,
          }}
        />
      )}
    </div>
  );
};

// ─── ShipmentBanner ────────────────────────────────────────────────────────
// Toont bovenaan OrderDetail de shipment-context: welke legs zijn er, welke
// is de huidige, klik om naar een andere leg te navigeren. Alleen zichtbaar
// wanneer de order tot een shipment met ≥1 leg behoort.

const ShipmentBanner = ({
  shipmentId,
  currentOrderId,
}: {
  shipmentId: string | null;
  currentOrderId: string;
}) => {
  const { data: shipment } = useShipment(shipmentId);
  const navigate = useNavigate();

  if (!shipmentId || !shipment || !shipment.legs?.length) return null;
  // Bij 1-leg shipments is de context triviaal; niet tonen.
  if (shipment.legs.length <= 1) return null;

  const shipNumber = shipment.shipment_number
    ? `SHP-${new Date(shipment.created_at).getFullYear()}-${String(shipment.shipment_number).padStart(4, "0")}`
    : shipment.id.slice(0, 8);

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <Route className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-amber-900">
              Shipment {shipNumber} · {shipment.legs.length} legs
            </p>
            <span className="text-xs text-amber-700">
              {shipment.origin_address} → {shipment.destination_address}
            </span>
          </div>
          <ul className="space-y-1">
            {shipment.legs.map((leg) => {
              const isCurrent = leg.id === currentOrderId;
              return (
                <li key={leg.id}>
                  <button
                    type="button"
                    onClick={() => !isCurrent && navigate(`/orders/${leg.id}`)}
                    disabled={isCurrent}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs text-left transition",
                      isCurrent
                        ? "border-amber-400 bg-amber-100 text-amber-900 cursor-default font-semibold"
                        : "border-amber-200 bg-white/60 text-amber-900 hover:bg-white",
                    )}
                  >
                    <span className="font-mono text-[10px] w-6">#{leg.legNumber ?? "?"}</span>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 uppercase tracking-wider">
                      {leg.departmentCode ?? "—"}
                    </Badge>
                    <span className="truncate flex-1">
                      {leg.pickupAddress} <ArrowRight className="inline h-3 w-3" /> {leg.deliveryAddress}
                    </span>
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                      {leg.status}
                    </Badge>
                    {isCurrent && <CheckCircle2 className="h-3 w-3 text-amber-700" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OrderDetail;
