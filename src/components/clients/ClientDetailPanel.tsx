import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { formatDistanceToNow } from "date-fns";
import { nl } from "date-fns/locale";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { type Client, useClientLocations, useClientRates, useClientOrders, useUpdateClient } from "@/hooks/useClients";
import { useClientContacts } from "@/hooks/useClientContacts";
import { useClientAudit } from "@/hooks/useClientAudit";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { MapPin, Clock, Truck, FileText, Plus, Loader2 } from "lucide-react";
import { ClientPortalTab } from "./ClientPortalTab";
import { ClientEmballageTab } from "./ClientEmballageTab";
import { ClientContactsSection } from "./ClientContactsSection";
import { ClientHistoryTab } from "./ClientHistoryTab";
import { NewLocationDialog } from "./NewLocationDialog";

interface Props {
  client: Client;
}

const TABS = [
  { value: "overzicht", label: "Overzicht" },
  { value: "contacten", label: "Contacten" },
  { value: "locaties", label: "Locaties" },
  { value: "tarieven", label: "Tarieven" },
  { value: "orders", label: "Orders" },
  { value: "historie", label: "Historie" },
  { value: "portaal", label: "Portaal" },
  { value: "emballage", label: "Emballage" },
];

export function ClientDetailPanel({ client }: Props) {
  const navigate = useNavigate();
  const { data: locations } = useClientLocations(client.id);
  const { data: rates } = useClientRates(client.id);
  const { data: orders } = useClientOrders(client.name);
  const [newLocationOpen, setNewLocationOpen] = useState(false);

  return (
    <Tabs defaultValue="overzicht" className="w-full">
      <TabsList className="w-full justify-start rounded-none border-b border-[hsl(var(--gold)/0.2)] bg-transparent px-3 h-auto py-0 gap-0 overflow-x-auto">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="rounded-none border-b-2 border-transparent bg-transparent shadow-none data-[state=active]:border-[hsl(var(--gold-deep))] data-[state=active]:bg-transparent data-[state=active]:text-[hsl(var(--gold-deep))] data-[state=active]:shadow-none px-2.5 py-2.5 text-[12px] font-medium tracking-tight text-muted-foreground hover:text-[hsl(var(--gold-deep))] transition-colors whitespace-nowrap"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overzicht" className="p-4 space-y-4 mt-0">
        <StatsStrip client={client} orders={orders} />
        <LastAuditLine clientId={client.id} />

        <BedrijfSection client={client} />

        <ContactSection client={client} />

        <Section title="Adressen">
          <Row
            label="Hoofd"
            value={formatAddress(client.address, client.zipcode, client.city, client.country)}
          />
          <Row
            label="Factuur"
            value={
              client.billing_same_as_main
                ? "Gelijk aan hoofdadres"
                : formatAddress(client.billing_address, client.billing_zipcode, client.billing_city, client.billing_country)
            }
            muted={client.billing_same_as_main}
          />
          <Row
            label="Post"
            value={
              client.shipping_same_as_main
                ? "Gelijk aan hoofdadres"
                : formatAddress(client.shipping_address, client.shipping_zipcode, client.shipping_city, client.shipping_country)
            }
            muted={client.shipping_same_as_main}
          />
          <Row label="Factuur e-mail" value={client.billing_email || client.email} />
        </Section>

        <MiniMapSection client={client} />

        <NotesSection client={client} />
      </TabsContent>

      <TabsContent value="contacten" className="p-4 mt-0">
        <ClientContactsSection clientId={client.id} />
      </TabsContent>

      <TabsContent value="locaties" className="p-4 space-y-2 mt-0">
        <div className="flex justify-end mb-2">
          <button
            type="button"
            onClick={() => setNewLocationOpen(true)}
            className="btn-luxe btn-luxe--primary !h-8 !text-xs inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Nieuwe locatie
          </button>
        </div>
        {!locations?.length ? (
          <EmptyState text="Geen locaties toegevoegd" />
        ) : (
          locations.map((loc) => (
            <div
              key={loc.id}
              className="rounded-lg border border-[hsl(var(--gold)/0.2)] p-3 space-y-1.5"
              style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin className="h-3.5 w-3.5 text-[hsl(var(--gold-deep))] shrink-0" strokeWidth={1.5} />
                  <span className="text-sm font-medium text-foreground truncate">{loc.label}</span>
                </div>
                <span className="callout--luxe__tag !py-0.5 !px-2 !text-[10px] shrink-0">
                  {loc.location_type === "pickup" ? "Ophaal" : "Aflever"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{loc.address}{loc.city ? `, ${loc.city}` : ""}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                {(loc.time_window_start || loc.time_window_end) && (
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock className="h-3 w-3" strokeWidth={1.5} />
                    {loc.time_window_start || "?"} – {loc.time_window_end || "?"}
                  </span>
                )}
                {loc.max_vehicle_length && (
                  <span className="flex items-center gap-1">
                    <Truck className="h-3 w-3" strokeWidth={1.5} />
                    Max {loc.max_vehicle_length}
                  </span>
                )}
              </div>
              {loc.notes && <p className="text-[11px] text-muted-foreground italic">{loc.notes}</p>}
            </div>
          ))
        )}
      </TabsContent>

      <TabsContent value="tarieven" className="p-4 mt-0">
        {!rates?.length ? (
          <EmptyState text="Geen tarieven ingesteld" />
        ) : (
          <div className="card--luxe overflow-hidden">
            <table className="w-full">
              <thead>
                <tr
                  className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[10px] [&>th]:!uppercase [&>th]:!tracking-[0.12em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold"
                  style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
                >
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Omschrijving</th>
                  <th className="text-right px-3 py-2">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id} className="border-b border-[hsl(var(--gold)/0.08)] last:border-0">
                    <td className="px-3 py-2">
                      <span className="callout--luxe__tag !py-0.5 !px-2 !text-[10px]">
                        {rateTypeLabel(rate.rate_type)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{rate.description || "—"}</td>
                    <td className="px-3 py-2 text-xs font-medium text-foreground text-right tabular-nums">
                      €{Number(rate.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="historie" className="p-4 mt-0">
        <ClientHistoryTab clientId={client.id} />
      </TabsContent>

      <TabsContent value="portaal" className="p-4 mt-0">
        <ClientPortalTab clientId={client.id} clientName={client.name} />
      </TabsContent>

      <TabsContent value="orders" className="p-4 mt-0">
        {!orders?.length ? (
          <EmptyState text="Geen orders gevonden" />
        ) : (
          <div className="space-y-1.5">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => navigate(`/orders/${order.id}`)}
                className="flex items-center justify-between rounded-lg border border-[hsl(var(--gold)/0.2)] px-3 py-2 cursor-pointer transition-colors hover:border-[hsl(var(--gold)/0.4)] hover:bg-[hsl(var(--gold-soft)/0.25)] gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3 w-3 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                    <span className="text-xs font-medium text-foreground tabular-nums">#{order.order_number}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {order.pickup_address || "—"} → {order.delivery_address || "—"}
                  </p>
                </div>
                <span className="callout--luxe__tag !py-0.5 !px-2 !text-[10px] shrink-0">{order.status}</span>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="emballage" className="mt-0 p-0">
        <ClientEmballageTab clientId={client.id} />
      </TabsContent>

      <NewLocationDialog
        clientId={client.id}
        open={newLocationOpen}
        onOpenChange={setNewLocationOpen}
      />
    </Tabs>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em]">
        {title}
      </h3>
      <div
        className="rounded-lg border border-[hsl(var(--gold)/0.2)] divide-y divide-[hsl(var(--gold)/0.08)]"
        style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.15) 100%)" }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string | null | undefined; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">{label}</span>
      <span className={`text-xs text-right truncate ${muted ? "italic text-muted-foreground" : "text-foreground"}`} title={value ?? ""}>
        {value || "—"}
      </span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{text}</p>;
}

type SaveState = "idle" | "saving" | "saved";

function NotesSection({ client }: { client: Client }) {
  const [value, setValue] = useState<string>(client.notes ?? "");
  const [state, setState] = useState<SaveState>("idle");
  const updateClient = useUpdateClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>(client.notes ?? "");

  useEffect(() => {
    setValue(client.notes ?? "");
    lastSaved.current = client.notes ?? "";
    setState("idle");
  }, [client.id, client.notes]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setValue(next);
    if (next === lastSaved.current) return;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        await updateClient.mutateAsync({ id: client.id, notes: next || null });
        lastSaved.current = next;
        setState("saved");
        setTimeout(() => setState("idle"), 1500);
      } catch {
        setState("idle");
      }
    }, 800);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em]">
          Notities
        </h3>
        <span className="text-[10px] text-muted-foreground tabular-nums min-h-[14px]">
          {state === "saving" ? "Opslaan..." : state === "saved" ? "Opgeslagen" : ""}
        </span>
      </div>
      <Textarea
        value={value}
        onChange={onChange}
        placeholder="Vrije notitie over deze klant, afspraken, aandachtspunten..."
        className="field-luxe min-h-[120px] text-xs"
      />
    </div>
  );
}

function formatAddress(
  street: string | null | undefined,
  zipcode: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
) {
  const parts = [street, [zipcode, city].filter(Boolean).join(" "), country]
    .map((p) => (typeof p === "string" ? p.trim() : p))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

const ACTIVE_ORDER_STATUSES = new Set([
  "CREATED",
  "PLANNED",
  "IN_TRANSIT",
  "DRAFT",
  "PENDING",
  "OPEN",
  "WAITING",
  "CONFIRMED",
]);

function StatsStrip({ client, orders }: { client: Client; orders: any[] | undefined }) {
  // Actieve orders: gebruik active_order_count uit useClients (reeds geaggregeerd)
  // als fallback op orders-lijst wanneer count ontbreekt (bv. detail-route).
  const activeOrders = useMemo(() => {
    if (typeof client.active_order_count === "number") return client.active_order_count;
    if (!orders?.length) return 0;
    return orders.filter((o) => ACTIVE_ORDER_STATUSES.has(o.status)).length;
  }, [client.active_order_count, orders]);

  // Laatste rit: max(created_at) van orders
  const lastOrder = useMemo(() => {
    if (!orders?.length) return null;
    const dates = orders
      .map((o) => (o.created_at ? new Date(o.created_at) : null))
      .filter((d): d is Date => !!d);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map((d) => d.getTime())));
  }, [orders]);

  const lastOrderLabel = lastOrder
    ? formatDistanceToNow(lastOrder, { locale: nl, addSuffix: true })
    : "Nog geen ritten";

  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCard label="Actieve orders" value={String(activeOrders)} />
      {/*
        Omzet YTD: orders-tabel heeft geen eenduidig prijsveld (calculated_price
        zit alleen in test-types, niet in de database). Prijzen komen via
        order_charges / shipments / invoices, niet direct op orders. Daarom
        tonen we hier "—" zodat we geen verkeerd cijfer laten zien.
      */}
      <StatCard
        label="Omzet YTD"
        value="—"
        caption="niet beschikbaar"
      />
      <StatCard label="Laatste rit" value={lastOrderLabel} small />
    </div>
  );
}

function StatCard({
  label,
  value,
  caption,
  small,
}: {
  label: string;
  value: string;
  caption?: string;
  small?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-[hsl(var(--gold)/0.2)] px-3 py-2.5"
      style={{ background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.2) 100%)" }}
    >
      <div
        className={`font-display font-semibold tabular-nums leading-tight text-foreground ${
          small ? "text-sm" : "text-lg"
        }`}
        title={value}
      >
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">
        {label}
      </div>
      {caption && (
        <div className="text-[10px] text-muted-foreground italic mt-0.5">{caption}</div>
      )}
    </div>
  );
}

function LastAuditLine({ clientId }: { clientId: string }) {
  const { data } = useClientAudit(clientId);
  const latest = data?.[0];
  if (!latest) return null;

  const when = (() => {
    try {
      return formatDistanceToNow(new Date(latest.created_at), { locale: nl, addSuffix: true });
    } catch {
      return latest.created_at;
    }
  })();

  return (
    <p className="text-[11px] text-muted-foreground">
      Laatst gewijzigd: {when}
      {latest.user_name ? ` door ${latest.user_name}` : ""}
    </p>
  );
}

function BedrijfSection({ client }: { client: Client }) {
  const updateClient = useUpdateClient();
  const [localActive, setLocalActive] = useState<boolean>(client.is_active);

  useEffect(() => {
    setLocalActive(client.is_active);
  }, [client.id, client.is_active]);

  const onToggleActive = async (v: boolean) => {
    setLocalActive(v);
    try {
      await updateClient.mutateAsync({ id: client.id, is_active: v });
      toast.success(v ? "Klant geactiveerd" : "Klant gedeactiveerd");
    } catch {
      setLocalActive(!v);
      toast.error("Kon status niet opslaan");
    }
  };

  return (
    <Section title="Bedrijf">
      <Row label="Naam" value={client.name} />
      <Row label="KvK" value={client.kvk_number} />
      <Row label="BTW" value={client.btw_number} />
      <Row
        label="Betalingstermijn"
        value={client.payment_terms ? `${client.payment_terms} dagen` : null}
      />
      <div className="px-3 py-2 space-y-1">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Status
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-foreground">
              {localActive ? "Actief" : "Inactief"}
            </span>
            <Switch
              checked={localActive}
              onCheckedChange={onToggleActive}
              aria-label="Klant actief"
            />
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground italic">
          Inactieve klanten verschijnen niet in nieuwe-order dropdowns
        </p>
      </div>
    </Section>
  );
}

function ContactSection({ client }: { client: Client }) {
  const { data: contacts } = useClientContacts(client.id);
  const primary = client.primary_contact_id
    ? contacts?.find((c) => c.id === client.primary_contact_id)
    : null;

  const personLabel = primary?.name || client.contact_person;

  return (
    <Section title="Contact">
      <div className="flex items-baseline justify-between gap-3 px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide shrink-0">
          Persoon
        </span>
        <div className="flex items-center gap-2 min-w-0 justify-end">
          <span
            className="text-xs text-right truncate text-foreground"
            title={personLabel ?? ""}
          >
            {personLabel || "—"}
          </span>
          {primary && (
            <span
              className="text-[10px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 shrink-0"
              style={{
                background: "hsl(var(--gold-soft))",
                color: "hsl(var(--gold-deep))",
              }}
            >
              Primair
            </span>
          )}
        </div>
      </div>
      {!primary && client.primary_contact_id == null && (
        <div className="px-3 py-1.5">
          <p className="text-[10px] text-muted-foreground italic">
            Geen primair contact gekoppeld
          </p>
        </div>
      )}
      <Row label="E-mail" value={primary?.email || client.email} />
      <Row label="Telefoon" value={primary?.phone || client.phone} />
    </Section>
  );
}

const MINI_MAP_CONTAINER = { width: "100%", height: "180px" };

function MiniMapSection({ client }: { client: Client }) {
  const { isLoaded, missingKey, loadError } = useGoogleMaps();
  if (client.lat == null || client.lng == null) return null;
  if (missingKey || loadError) return null;

  const center = { lat: client.lat, lng: client.lng };

  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em]">
        Kaart
      </h3>
      {!isLoaded ? (
        <div className="flex items-center justify-center h-[180px] rounded-2xl border border-[hsl(var(--gold)/0.2)]">
          <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--gold-deep))]" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.2)]">
          <GoogleMap
            mapContainerStyle={MINI_MAP_CONTAINER}
            center={center}
            zoom={16}
            options={{
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: false,
              clickableIcons: false,
            }}
          >
            <Marker position={center} />
          </GoogleMap>
        </div>
      )}
    </div>
  );
}

function rateTypeLabel(type: string) {
  const map: Record<string, string> = {
    per_km: "Per km",
    per_pallet: "Per pallet",
    per_rit: "Per rit",
    toeslag_adr: "ADR toeslag",
    toeslag_koel: "Koel toeslag",
    toeslag_weekend: "Weekend toeslag",
    toeslag_spoed: "Spoed toeslag",
  };
  return map[type] || type;
}
