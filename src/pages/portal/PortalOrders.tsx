import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, Plus, Search, Filter, Send, Loader2,
  MapPin, Weight, Hash, MessageSquare, ExternalLink, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useCurrentPortalUser } from "@/hooks/useClientPortalUsers";
import { IntakeSourceBadge } from "@/components/intake/IntakeSourceBadge";

interface PortalOrder {
  id: string;
  order_number: number;
  status: string;
  source: string;
  pickup_address: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  quantity: number | null;
  reference: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Ontvangen",
  PENDING: "In behandeling",
  PLANNED: "Gepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-blue-100 text-blue-700",
  PENDING: "bg-amber-100 text-amber-700",
  PLANNED: "bg-purple-100 text-purple-700",
  IN_TRANSIT: "bg-red-100 text-red-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function PortalOrders() {
  const { data: portalUser } = useCurrentPortalUser();
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("alle");
  const [search, setSearch] = useState("");
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newOrder, setNewOrder] = useState({
    pickup_address: "",
    delivery_address: "",
    weight_kg: "",
    quantity: "",
    notes: "",
    reference: "",
  });

  const canCreateOrders = portalUser?.portal_role === "editor" || portalUser?.portal_role === "admin";

  useEffect(() => {
    if (!portalUser?.client_id) return;
    loadOrders();
  }, [portalUser?.client_id, statusFilter]);

  const loadOrders = async () => {
    if (!portalUser?.client_id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("orders")
        .select("id, order_number, status, source, pickup_address, delivery_address, weight_kg, quantity, reference, created_at")
        .eq("client_id", portalUser.client_id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter && statusFilter !== "alle") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders((data ?? []) as PortalOrder[]);
    } catch (err) {
      console.error("Failed to load orders:", err);
      toast.error("Kon orders niet laden");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalUser) return;

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.from("orders").insert({
        client_id: portalUser.client_id,
        tenant_id: portalUser.tenant_id,
        pickup_address: newOrder.pickup_address,
        delivery_address: newOrder.delivery_address,
        weight_kg: newOrder.weight_kg ? parseFloat(newOrder.weight_kg) : null,
        quantity: newOrder.quantity ? parseInt(newOrder.quantity, 10) : null,
        notes: newOrder.notes || null,
        reference: newOrder.reference || null,
        status: "DRAFT",
        source: "PORTAL",
        portal_submitted_by: user?.id ?? null,
        portal_submitted_at: new Date().toISOString(),
      });

      if (error) throw error;

      toast.success("Order aanvraag ingediend", {
        description: "Uw aanvraag verschijnt in het overzicht als 'Ontvangen'.",
      });

      setNewOrder({ pickup_address: "", delivery_address: "", weight_kg: "", quantity: "", notes: "", reference: "" });
      setShowNewOrder(false);
      await loadOrders();
    } catch (err: any) {
      console.error("Failed to create order:", err);
      toast.error("Order aanmaken mislukt", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredOrders = search
    ? orders.filter(
        (o) =>
          o.order_number.toString().includes(search) ||
          o.pickup_address?.toLowerCase().includes(search.toLowerCase()) ||
          o.delivery_address?.toLowerCase().includes(search.toLowerCase()) ||
          o.reference?.toLowerCase().includes(search.toLowerCase())
      )
    : orders;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 mt-1">Bekijk uw orders of vraag een nieuw transport aan</p>
        </div>
        {canCreateOrders && (
          <Button
            onClick={() => setShowNewOrder(!showNewOrder)}
            className="gap-2 h-10 px-5 rounded-xl"
          >
            <Plus className="h-4 w-4" />
            Nieuwe order
          </Button>
        )}
      </div>

      {/* New Order Form */}
      {showNewOrder && canCreateOrders && (
        <Card className="animate-in fade-in slide-in-from-top-2 duration-200">
          <CardHeader>
            <CardTitle className="text-base">Nieuwe order aanvragen</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmitOrder} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    <MapPin className="h-3.5 w-3.5 inline mr-1 text-blue-600" />
                    Ophaaladres *
                  </label>
                  <Input
                    value={newOrder.pickup_address}
                    onChange={(e) => setNewOrder({ ...newOrder, pickup_address: e.target.value })}
                    placeholder="Straat, Postcode, Stad"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    <MapPin className="h-3.5 w-3.5 inline mr-1 text-emerald-600" />
                    Afleveradres *
                  </label>
                  <Input
                    value={newOrder.delivery_address}
                    onChange={(e) => setNewOrder({ ...newOrder, delivery_address: e.target.value })}
                    placeholder="Straat, Postcode, Stad"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    <Weight className="h-3.5 w-3.5 inline mr-1 text-gray-500" />
                    Gewicht (kg)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={newOrder.weight_kg}
                    onChange={(e) => setNewOrder({ ...newOrder, weight_kg: e.target.value })}
                    placeholder="bijv. 500"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                    <Hash className="h-3.5 w-3.5 inline mr-1 text-gray-500" />
                    Aantal (pallets/colli)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={newOrder.quantity}
                    onChange={(e) => setNewOrder({ ...newOrder, quantity: e.target.value })}
                    placeholder="bijv. 4"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Uw referentie
                </label>
                <Input
                  value={newOrder.reference}
                  onChange={(e) => setNewOrder({ ...newOrder, reference: e.target.value })}
                  placeholder="PO-nummer, referentie, etc."
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  <MessageSquare className="h-3.5 w-3.5 inline mr-1 text-gray-500" />
                  Opmerkingen
                </label>
                <textarea
                  value={newOrder.notes}
                  onChange={(e) => setNewOrder({ ...newOrder, notes: e.target.value })}
                  placeholder="Bijzondere instructies, referentienummers, etc."
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setShowNewOrder(false)}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={submitting} className="gap-2">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Indienen
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op ordernummer, adres, referentie..."
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Orders list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Geen orders gevonden</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filteredOrders.map((order) => (
                <div
                  key={order.id}
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900 text-sm">
                        #{order.order_number}
                      </span>
                      <Badge
                        className={cn(
                          "text-[11px] font-medium px-2 py-0.5 rounded-full border-0",
                          STATUS_COLORS[order.status] || "bg-gray-100 text-gray-600"
                        )}
                      >
                        {STATUS_LABELS[order.status] || order.status}
                      </Badge>
                      <IntakeSourceBadge source={order.source} className="border-0" />
                    </div>
                    <div className="text-sm text-gray-500 space-y-0.5">
                      {order.pickup_address && (
                        <p className="truncate">
                          <span className="text-blue-600 font-medium">Van:</span> {order.pickup_address}
                        </p>
                      )}
                      {order.delivery_address && (
                        <p className="truncate">
                          <span className="text-emerald-600 font-medium">Naar:</span> {order.delivery_address}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(order.created_at).toLocaleDateString("nl-NL", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                      })}
                      {order.weight_kg != null && ` | ${order.weight_kg} kg`}
                      {order.quantity != null && ` | ${order.quantity} stuks`}
                      {order.reference && ` | Ref: ${order.reference}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/track?q=${order.order_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Track & Trace
                    </a>
                    {canCreateOrders && order.status === "DELIVERED" && (
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
                        <ArrowLeftRight className="h-3 w-3" />
                        Retour
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
