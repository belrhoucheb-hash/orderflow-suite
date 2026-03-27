import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { type Client, useClientLocations, useClientRates, useClientOrders } from "@/hooks/useClients";
import { MapPin, Clock, Truck, Euro, FileText, Building2, Hash } from "lucide-react";

interface Props {
  client: Client;
}

export function ClientDetailPanel({ client }: Props) {
  const navigate = useNavigate();
  const { data: locations } = useClientLocations(client.id);
  const { data: rates } = useClientRates(client.id);
  const { data: orders } = useClientOrders(client.name);

  return (
    <Tabs defaultValue="overzicht" className="w-full">
      <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent px-6 h-auto py-0">
        {["Overzicht", "Locaties", "Tarieven", "Orders"].map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab.toLowerCase()}
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary px-4 py-3 text-sm"
          >
            {tab}
          </TabsTrigger>
        ))}
      </TabsList>

      {/* Overzicht */}
      <TabsContent value="overzicht" className="p-6 space-y-6 mt-0">
        <Section title="Bedrijfsgegevens">
          <Field icon={<Building2 className="h-4 w-4" />} label="Bedrijfsnaam" value={client.name} />
          <Field icon={<Hash className="h-4 w-4" />} label="KvK-nummer" value={client.kvk_number} />
          <Field icon={<Hash className="h-4 w-4" />} label="BTW-nummer" value={client.btw_number} />
          <Field icon={<Euro className="h-4 w-4" />} label="Betalingstermijn" value={client.payment_terms ? `${client.payment_terms} dagen` : null} />
        </Section>

        <Section title="Contactgegevens">
          <Field label="Contactpersoon" value={client.contact_person} />
          <Field label="Email" value={client.email} />
          <Field label="Telefoon" value={client.phone} />
        </Section>

        <Section title="Facturatieadres">
          <p className="text-sm text-foreground">
            {[client.address, client.zipcode, client.city, client.country].filter(Boolean).join(", ") || "—"}
          </p>
        </Section>
      </TabsContent>

      {/* Locaties */}
      <TabsContent value="locaties" className="p-6 space-y-4 mt-0">
        {!locations?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Geen locaties toegevoegd</p>
        ) : (
          locations.map((loc) => (
            <div key={loc.id} className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">{loc.label}</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {loc.location_type === "pickup" ? "Ophaal" : "Aflever"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{loc.address}{loc.city ? `, ${loc.city}` : ""}</p>
              {(loc.time_window_start || loc.time_window_end) && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{loc.time_window_start || "?"} – {loc.time_window_end || "?"}</span>
                </div>
              )}
              {loc.max_vehicle_length && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Truck className="h-3 w-3" />
                  <span>Max {loc.max_vehicle_length}</span>
                </div>
              )}
              {loc.notes && <p className="text-xs text-muted-foreground italic">{loc.notes}</p>}
            </div>
          ))
        )}
      </TabsContent>

      {/* Tarieven */}
      <TabsContent value="tarieven" className="p-6 mt-0">
        {!rates?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Geen tarieven ingesteld</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase px-4 py-2.5">Type</th>
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase px-4 py-2.5">Omschrijving</th>
                  <th className="text-right text-[11px] font-medium text-muted-foreground uppercase px-4 py-2.5">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {rateTypeLabel(rate.rate_type)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-muted-foreground">{rate.description || "—"}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-foreground text-right">
                      €{Number(rate.amount).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>

      {/* Orders */}
      <TabsContent value="orders" className="p-6 mt-0">
        {!orders?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Geen orders gevonden</p>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => (
              <div key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-muted/20 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">#{order.order_number}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.pickup_address || "—"} → {order.delivery_address || "—"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon && <span className="text-muted-foreground">{icon}</span>}
      <div>
        <span className="text-xs text-muted-foreground">{label}</span>
        <p className="text-sm text-foreground">{value || "—"}</p>
      </div>
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
