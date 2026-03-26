import { useParams, Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, MapPin, Package, Truck, User, Clock, FileText, MessageSquare, AlertTriangle, XCircle, Edit, CheckCircle2, Undo2, Send, Loader2 } from "lucide-react";
import { ClickableAddress } from "@/components/ClickableAddress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "Nieuw", color: "bg-muted text-muted-foreground" },
  OPEN: { label: "In behandeling", color: "bg-blue-100 text-blue-700 border-blue-200" },
  PLANNED: { label: "Ingepland", color: "bg-violet-100 text-violet-700 border-violet-200" },
  DELIVERED: { label: "Afgeleverd", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  CANCELLED: { label: "Geannuleerd", color: "bg-destructive/10 text-destructive border-destructive/20" },
};

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showModifyMode, setShowModifyMode] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["order-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

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
      toast({ title: "Order geannuleerd", description: `Order #${order?.order_number} is geannuleerd` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      setShowCancelDialog(false);
    },
    onError: (e: Error) => {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    },
  });

  // Reopen (undo cancel) mutation
  const reopenMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.from("orders").update({
        status: "OPEN",
        internal_note: order?.internal_note?.replace("[GEANNULEERD]", "[HEROPEND]") || "[HEROPEND]",
      }).eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Order heropend", description: `Order #${order?.order_number} is terug in behandeling` });
      queryClient.invalidateQueries({ queryKey: ["order-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
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
        toast({ title: "✉️ Bevestiging verzonden", description: data.message });
      } else if (data?.skipped) {
        toast({ title: "Overgeslagen", description: "Geen geldig e-mailadres", variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Verzenden mislukt", description: e.message, variant: "destructive" });
    } finally {
      setIsSendingConfirmation(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground">Order niet gevonden</p>
        <Link to="/orders"><Button variant="outline">Terug naar orders</Button></Link>
      </div>
    );
  }

  const statusInfo = STATUS_MAP[order.status] || STATUS_MAP.DRAFT;
  const isCancelled = order.status === "CANCELLED";
  const isActive = order.status === "OPEN" || order.status === "PLANNED";
  const requirements = (order.requirements || []) as string[];

  // Build audit trail from order timestamps
  const auditTrail: { time: string; label: string; icon: any; color?: string }[] = [];
  if (order.received_at) auditTrail.push({ time: new Date(order.received_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "E-mail ontvangen", icon: FileText });
  if (order.created_at) auditTrail.push({ time: new Date(order.created_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: order.confidence_score ? `AI extractie (${order.confidence_score}% zekerheid)` : "Order aangemaakt", icon: Package });
  if (order.follow_up_sent_at) auditTrail.push({ time: new Date(order.follow_up_sent_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Follow-up verstuurd", icon: Send });
  if (order.status === "OPEN") auditTrail.push({ time: new Date(order.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Goedgekeurd door planner", icon: CheckCircle2 });
  if (order.vehicle_id) auditTrail.push({ time: new Date(order.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: `Voertuig toegewezen`, icon: Truck });
  if (isCancelled) auditTrail.push({ time: new Date(order.updated_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }), label: "Geannuleerd", icon: XCircle, color: "text-destructive" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="font-display text-2xl font-bold">Order #{order.order_number}</h1>
          <p className="text-sm text-muted-foreground">{order.client_name || "Onbekende klant"}</p>
        </div>
        <Badge variant="outline" className={cn("text-sm px-3 py-1", statusInfo.color)}>
          {statusInfo.label}
        </Badge>
      </div>

      {/* Cancellation banner */}
      {isCancelled && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 flex items-center gap-3">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">Deze order is geannuleerd</p>
            {order.internal_note?.includes("[GEANNULEERD]") && (
              <p className="text-xs text-destructive/70 mt-0.5">
                {order.internal_note.replace("[GEANNULEERD] ", "").replace("[GEANNULEERD]", "")}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" className="shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
            onClick={() => reopenMutation.mutate(order.id)}
            disabled={reopenMutation.isPending}
          >
            {reopenMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
            Heropen Order
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Route */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Route & Lading
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Ophaaladres</p>
                  <p className="font-medium flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                    {order.pickup_address || <span className="text-destructive italic">Ontbreekt</span>}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Afleveradres</p>
                  <p className="font-medium flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    {order.delivery_address || <span className="text-destructive italic">Ontbreekt</span>}
                  </p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Aantal</p>
                  <p className="font-semibold">{order.quantity || "—"} {order.unit || ""}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Gewicht</p>
                  <p className="font-semibold">
                    {order.weight_kg ? `${order.weight_kg} kg${order.is_weight_per_unit ? " /stuk" : ""}` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Afmetingen</p>
                  <p className="font-semibold">{order.dimensions || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-1">Type</p>
                  <p className="font-semibold">
                    {order.transport_type === "WAREHOUSE_AIR" || order.transport_type === "warehouse-air"
                      ? "Warehouse → Air" : "Direct"}
                  </p>
                </div>
              </div>
              {requirements.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-muted-foreground text-xs mb-2">Vereisten</p>
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
              )}
            </CardContent>
          </Card>

          {/* Source email */}
          {order.source_email_body && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Bron E-mail
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>{order.source_email_from || "Onbekend"}</span>
                </div>
                <p className="font-medium">{order.source_email_subject}</p>
                <div className="mt-2 rounded-lg bg-muted/30 border border-border/20 p-3">
                  <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{order.source_email_body}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Internal note */}
          {order.internal_note && !order.internal_note.startsWith("[") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />Notities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{order.internal_note}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Audit Trail */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-display">Tijdlijn</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {auditTrail.map((event, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="flex flex-col items-center">
                      <div className={cn(
                        "h-7 w-7 rounded-full flex items-center justify-center",
                        event.color ? "bg-destructive/10" : "bg-primary/10"
                      )}>
                        <event.icon className={cn("h-3.5 w-3.5", event.color || "text-primary")} />
                      </div>
                      {i < auditTrail.length - 1 && <div className="w-px h-full bg-border flex-1 mt-1" />}
                    </div>
                    <div className="pb-4">
                      <p className={cn("font-medium", event.color)}>{event.label}</p>
                      <p className="text-xs text-muted-foreground">{event.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {isActive && (
              <>
                <Button className="w-full gap-2" onClick={handleSendConfirmation} disabled={isSendingConfirmation}>
                  {isSendingConfirmation ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Bevestiging versturen
                </Button>
                <Button variant="outline" className="w-full gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                  onClick={() => setShowCancelDialog(true)}>
                  <XCircle className="h-4 w-4" />
                  Order annuleren
                </Button>
              </>
            )}
            {isCancelled && (
              <Button variant="outline" className="w-full gap-2"
                onClick={() => reopenMutation.mutate(order.id)}
                disabled={reopenMutation.isPending}>
                {reopenMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                Heropen Order
              </Button>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default OrderDetail;
