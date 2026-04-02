import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  Truck, LogIn, LogOut, Package, Plus, ExternalLink, Loader2,
  MapPin, ClipboardList, Send, Weight, MessageSquare, Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Session, User } from "@supabase/supabase-js";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

// ─── Types ──────────────────────────────────────────────────────────

interface ClientOrder {
  id: string;
  order_number: number;
  status: string;
  pickup_address: string | null;
  delivery_address: string | null;
  weight_kg: number | null;
  quantity: number | null;
  created_at: string;
}

interface ClientProfile {
  client_id: string;
  client_name: string;
}

// ─── Status helpers ─────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────

export default function ClientPortal() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Client data
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [orders, setOrders] = useState<ClientOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // New order form
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState({
    pickup_address: "",
    delivery_address: "",
    weight_kg: "",
    quantity: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);

  // ─── Auth listener ────────────────────────────────────────────────

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setAuthLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ─── Load client profile & orders ─────────────────────────────────

  useEffect(() => {
    if (!user) {
      setClientProfile(null);
      setOrders([]);
      return;
    }

    const loadClientData = async () => {
      setOrdersLoading(true);
      try {
        // Look up client_id from user metadata or from a client_users mapping
        // We check user_metadata.client_id first, then fall back to matching by email
        let clientId = user.user_metadata?.client_id as string | undefined;
        let clientName = user.user_metadata?.client_name as string | undefined;

        if (!clientId) {
          // Try matching by email in clients table (contact_email field)
          const { data: clientMatch } = await supabase
            .from("clients")
            .select("id, name")
            .eq("contact_email", user.email ?? "")
            .maybeSingle();

          if (clientMatch) {
            clientId = clientMatch.id;
            clientName = clientMatch.name;
          }
        }

        if (!clientId) {
          setClientProfile(null);
          setOrders([]);
          setOrdersLoading(false);
          return;
        }

        setClientProfile({ client_id: clientId, client_name: clientName ?? "Klant" });

        // Fetch orders for this client
        const { data: orderData, error: orderErr } = await supabase
          .from("orders")
          .select("id, order_number, status, pickup_address, delivery_address, weight_kg, quantity, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (orderErr) throw orderErr;
        setOrders((orderData ?? []) as ClientOrder[]);
      } catch (err) {
        console.error("Failed to load client data:", err);
        toast.error("Kon klantgegevens niet laden");
      } finally {
        setOrdersLoading(false);
      }
    };

    loadClientData();
  }, [user]);

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setLoginError("Ongeldige inloggegevens. Controleer uw email en wachtwoord.");
    }

    setLoginLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setClientProfile(null);
    setOrders([]);
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientProfile) return;

    setSubmitting(true);
    try {
      // Get the tenant_id from the client record
      const { data: clientData } = await supabase
        .from("clients")
        .select("tenant_id")
        .eq("id", clientProfile.client_id)
        .single();

      const { error } = await supabase.from("orders").insert({
        client_id: clientProfile.client_id,
        client_name: clientProfile.client_name,
        pickup_address: newOrder.pickup_address,
        delivery_address: newOrder.delivery_address,
        weight_kg: newOrder.weight_kg ? parseFloat(newOrder.weight_kg) : null,
        quantity: newOrder.quantity ? parseInt(newOrder.quantity, 10) : null,
        notes: newOrder.notes || null,
        status: "DRAFT",
        tenant_id: clientData?.tenant_id ?? null,
      });

      if (error) throw error;

      toast.success("Order aanvraag ingediend", {
        description: "Uw aanvraag wordt zo snel mogelijk verwerkt.",
      });

      setNewOrder({ pickup_address: "", delivery_address: "", weight_kg: "", quantity: "", notes: "" });
      setShowNewOrder(false);

      // Refresh orders list
      const { data: refreshed } = await supabase
        .from("orders")
        .select("id, order_number, status, pickup_address, delivery_address, weight_kg, quantity, created_at")
        .eq("client_id", clientProfile.client_id)
        .order("created_at", { ascending: false })
        .limit(50);

      setOrders((refreshed ?? []) as ClientOrder[]);
    } catch (err: any) {
      console.error("Failed to create order:", err);
      toast.error("Order aanmaken mislukt", { description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading state ────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#dc2626]" />
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header bar */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#dc2626] flex items-center justify-center">
              <Truck className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight text-gray-900">
                {DEFAULT_COMPANY.name}
              </span>
              <span className="hidden sm:inline text-sm text-gray-400 ml-2">Klantportaal</span>
            </div>
          </div>
          {user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 hidden sm:inline">
                {clientProfile?.client_name ?? user.email}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-gray-500 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Uitloggen</span>
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {!user ? (
          /* ─── Login Form ──────────────────────────────────────── */
          <div className="flex flex-col items-center pt-12">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Welkom bij het klantportaal</h1>
              <p className="text-gray-500 mt-2">Log in om uw orders te bekijken en nieuwe aan te vragen</p>
            </div>

            <form
              onSubmit={handleLogin}
              className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-8 space-y-4"
            >
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">E-mailadres</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="u@bedrijf.nl"
                  required
                  className="h-11"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Wachtwoord</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Uw wachtwoord"
                  required
                  className="h-11"
                />
              </div>

              {loginError && (
                <p className="text-sm text-red-600 text-center">{loginError}</p>
              )}

              <Button
                type="submit"
                disabled={loginLoading}
                className="w-full h-11 bg-[#dc2626] hover:bg-[#b91c1c] text-white"
              >
                {loginLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Inloggen...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Inloggen
                  </span>
                )}
              </Button>
            </form>
          </div>
        ) : (
          /* ─── Dashboard (logged in) ───────────────────────────── */
          <div className="space-y-6">
            {/* Welcome + New Order button */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Welkom{clientProfile ? `, ${clientProfile.client_name}` : ""}
                </h1>
                <p className="text-gray-500 mt-1">Bekijk uw orders of vraag een nieuw transport aan</p>
              </div>
              <Button
                onClick={() => setShowNewOrder(!showNewOrder)}
                className="gap-2 bg-[#dc2626] hover:bg-[#b91c1c] text-white h-10 px-5 rounded-xl"
              >
                <Plus className="h-4 w-4" />
                Nieuwe order aanvragen
              </Button>
            </div>

            {/* New Order Form */}
            {showNewOrder && (
              <form
                onSubmit={handleSubmitOrder}
                className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-[#dc2626]" />
                  Nieuwe order aanvragen
                </h2>

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
                      className="h-10"
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
                      className="h-10"
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
                      className="h-10"
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
                      className="h-10"
                    />
                  </div>
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
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setShowNewOrder(false)}
                    className="h-10"
                  >
                    Annuleren
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="gap-2 bg-[#dc2626] hover:bg-[#b91c1c] text-white h-10 px-5"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Indienen
                  </Button>
                </div>
              </form>
            )}

            {/* Orders list */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Package className="h-5 w-5 text-gray-400" />
                  Mijn orders
                  {orders.length > 0 && (
                    <span className="text-sm font-normal text-gray-400">({orders.length})</span>
                  )}
                </h2>
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : !clientProfile ? (
                <div className="text-center py-12 px-6">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Geen klantprofiel gekoppeld</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Neem contact op met {DEFAULT_COMPANY.name} om uw account te koppelen.
                  </p>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <Package className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">Nog geen orders</p>
                  <p className="text-gray-400 text-sm mt-1">
                    Vraag uw eerste transport aan via de knop hierboven.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {orders.map((order) => (
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
                        </div>
                        <div className="text-sm text-gray-500 space-y-0.5">
                          {order.pickup_address && (
                            <p className="truncate">
                              <span className="text-blue-600 font-medium">Van:</span>{" "}
                              {order.pickup_address}
                            </p>
                          )}
                          {order.delivery_address && (
                            <p className="truncate">
                              <span className="text-emerald-600 font-medium">Naar:</span>{" "}
                              {order.delivery_address}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          Aangemaakt: {new Date(order.created_at).toLocaleDateString("nl-NL", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                          })}
                          {order.weight_kg != null && ` | ${order.weight_kg} kg`}
                          {order.quantity != null && ` | ${order.quantity} stuks`}
                        </p>
                      </div>

                      <a
                        href={`/track?q=${order.order_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#dc2626] hover:text-[#b91c1c] transition-colors shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Track & Trace
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-12">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-xs text-gray-400 text-center">
            &copy; {new Date().getFullYear()} {DEFAULT_COMPANY.name}. Alle rechten voorbehouden.
          </p>
        </div>
      </footer>
    </div>
  );
}
