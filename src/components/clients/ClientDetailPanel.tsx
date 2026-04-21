import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Client, useClientLocations, useClientRates, useClientOrders } from "@/hooks/useClients";
import { MapPin, Clock, Truck, FileText } from "lucide-react";
import { ClientPortalTab } from "./ClientPortalTab";
import { ClientEmballageTab } from "./ClientEmballageTab";
import { ClientContactsSection } from "./ClientContactsSection";

interface Props {
  client: Client;
}

const TABS = [
  { value: "overzicht", label: "Overzicht" },
  { value: "contacten", label: "Contacten" },
  { value: "locaties", label: "Locaties" },
  { value: "tarieven", label: "Tarieven" },
  { value: "orders", label: "Orders" },
  { value: "portaal", label: "Portaal" },
  { value: "emballage", label: "Emballage" },
];

export function ClientDetailPanel({ client }: Props) {
  const navigate = useNavigate();
  const { data: locations } = useClientLocations(client.id);
  const { data: rates } = useClientRates(client.id);
  const { data: orders } = useClientOrders(client.name);

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
        <Section title="Bedrijf">
          <Row label="Naam" value={client.name} />
          <Row label="KvK" value={client.kvk_number} />
          <Row label="BTW" value={client.btw_number} />
          <Row
            label="Betalingstermijn"
            value={client.payment_terms ? `${client.payment_terms} dagen` : null}
          />
        </Section>

        <Section title="Contact">
          <Row label="Persoon" value={client.contact_person} />
          <Row label="E-mail" value={client.email} />
          <Row label="Telefoon" value={client.phone} />
        </Section>

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
      </TabsContent>

      <TabsContent value="contacten" className="p-4 mt-0">
        <ClientContactsSection clientId={client.id} />
      </TabsContent>

      <TabsContent value="locaties" className="p-4 space-y-2 mt-0">
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
