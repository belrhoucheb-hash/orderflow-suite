import { useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Building2,
  X,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Pencil,
  Maximize2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useClientsList,
  useClientCountries,
  useClientStats,
  type Client,
  type ClientSortKey,
} from "@/hooks/useClients";
import { ClientDetailPanel } from "@/components/clients/ClientDetailPanel";
import { NewClientDialog } from "@/components/clients/NewClientDialog";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { PageHeader } from "@/components/ui/PageHeader";

type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

export default function Clients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"alle" | "actief" | "inactief">("alle");
  const [countryFilter, setCountryFilter] = useState<string>("alle");
  const [openOrdersFilter, setOpenOrdersFilter] = useState<"alle" | "met" | "zonder">("alle");
  const [activityFilter, setActivityFilter] = useState<"alle" | "slapend">("alle");
  const [sortKey, setSortKey] = useState<ClientSortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const isActive =
    statusFilter === "actief" ? true : statusFilter === "inactief" ? false : null;
  const country = countryFilter === "alle" ? null : countryFilter;

  const { data, isLoading, isError, refetch } = useClientsList({
    search,
    page,
    pageSize: PAGE_SIZE,
    isActive,
    country,
    sortKey,
    sortDir,
    dormantOnly: activityFilter === "slapend",
  });
  const { data: countries = [] } = useClientCountries();
  const { data: stats } = useClientStats();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedClient) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedClient(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [selectedClient]);

  // Reset pagina als filters of sort wijzigen, zodat dispatchers niet op een
  // lege pagina 3 blijven staan wanneer de dataset krimpt.
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, countryFilter, openOrdersFilter, activityFilter, sortKey, sortDir]);

  const serverRows = data?.clients ?? [];
  const totalCount = data?.totalCount ?? 0;

  // Open-orders-filter blijft client-side op de huidige pagina: die count
  // wordt in de hook zelf aangevuld, niet in de server-query. Bewuste
  // afweging: filter op count server-side zou een view/rpc vereisen.
  const pageRows = useMemo(() => {
    if (openOrdersFilter === "alle") return serverRows;
    return serverRows.filter((c) => {
      const orders = c.active_order_count ?? 0;
      return openOrdersFilter === "met" ? orders > 0 : orders === 0;
    });
  }, [serverRows, openOrdersFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);

  function toggleSort(key: ClientSortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: ClientSortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 inline-block ml-1 text-[hsl(var(--gold-deep))]" strokeWidth={2} />
    ) : (
      <ArrowDown className="h-3 w-3 inline-block ml-1 text-[hsl(var(--gold-deep))]" strokeWidth={2} />
    );
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedClient ? "lg:mr-[420px]" : ""}`}>
        <div className="p-6 space-y-4 max-w-[1800px] mx-auto w-full">
          <PageHeader
            title="Klanten"
            subtitle={`${totalCount} ${totalCount === 1 ? "klant" : "klanten"} in het systeem`}
            actions={
              <button
                type="button"
                onClick={() => setShowNewDialog(true)}
                className="btn-luxe btn-luxe--primary !h-9"
              >
                <Plus className="h-4 w-4" />
                Nieuwe klant
              </button>
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCard label="Totaal" value={stats?.total ?? null} />
            <StatCard label="Actief" value={stats?.active ?? null} />
            <StatCard label="Inactief" value={stats?.inactive ?? null} />
            <StatCard
              label="Slapend (> 90 dagen)"
              value={stats?.dormant ?? null}
              accent
            />
          </div>

          <div className="card--luxe p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[220px] max-w-md">
              <Search className="h-4 w-4 text-[hsl(var(--gold-deep))] shrink-0" />
              <Input
                placeholder="Zoek op naam of email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field-luxe flex-1"
              />
            </div>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger
                aria-label="Status"
                className="h-9 w-[140px] text-sm"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
              >
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                <SelectItem value="actief">Actief</SelectItem>
                <SelectItem value="inactief">Inactief</SelectItem>
              </SelectContent>
            </Select>

            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger
                aria-label="Land"
                className="h-9 w-[140px] text-sm"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
              >
                <SelectValue placeholder="Land" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle landen</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={openOrdersFilter} onValueChange={(v) => setOpenOrdersFilter(v as typeof openOrdersFilter)}>
              <SelectTrigger
                aria-label="Open orders"
                className="h-9 w-[180px] text-sm"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
              >
                <SelectValue placeholder="Open orders" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle open orders</SelectItem>
                <SelectItem value="met">Met open orders</SelectItem>
                <SelectItem value="zonder">Zonder open orders</SelectItem>
              </SelectContent>
            </Select>

            <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as typeof activityFilter)}>
              <SelectTrigger
                aria-label="Activiteit"
                className="h-9 w-[200px] text-sm"
                style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-small)" }}
              >
                <SelectValue placeholder="Activiteit" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle klanten</SelectItem>
                <SelectItem value="slapend">Alleen slapende klanten</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="card--luxe overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr
                    className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[12px] [&>th]:!uppercase [&>th]:!tracking-[0.16em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold [&>th]:!py-3.5 [&>th]:!px-5"
                    style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
                  >
                    <th
                      className="text-left cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort("name")}
                    >
                      Klantnaam<SortIcon col="name" />
                    </th>
                    <th
                      className="text-left cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort("contact_person")}
                    >
                      Contactpersoon<SortIcon col="contact_person" />
                    </th>
                    <th
                      className="text-left cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => toggleSort("email")}
                    >
                      Email<SortIcon col="email" />
                    </th>
                    <th className="text-left">Telefoon</th>
                    <th className="text-center select-none">Actieve orders</th>
                    <th className="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={6}><LoadingState message="Klanten laden..." /></td></tr>
                  ) : isError ? (
                    <tr><td colSpan={6}>
                      <QueryError message="Kan klantgegevens niet laden." onRetry={() => refetch()} />
                    </td></tr>
                  ) : pageRows.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-muted-foreground text-sm">Geen klanten gevonden</td></tr>
                  ) : (
                    pageRows.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      return (
                        <tr
                          key={client.id}
                          onClick={() => setSelectedClient(client)}
                          className={`border-b border-[hsl(var(--gold)/0.08)] cursor-pointer transition-colors hover:bg-[hsl(var(--gold-soft)/0.3)] ${
                            isSelected ? "bg-[hsl(var(--gold-soft)/0.5)]" : ""
                          }`}
                        >
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className="h-8 w-8 rounded-lg flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
                                style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.3))" }}
                              >
                                <Building2 className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                              </div>
                              <span className="text-sm font-medium text-foreground">{client.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">{client.contact_person || "—"}</td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">
                            {client.email ? (
                              <a
                                href={`mailto:${client.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[hsl(var(--gold-deep))] hover:underline"
                              >
                                {client.email}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-muted-foreground">
                            {client.phone ? (
                              <a
                                href={`tel:${client.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-[hsl(var(--gold-deep))] hover:underline"
                              >
                                {client.phone}
                              </a>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className="text-sm font-medium tabular-nums text-foreground">{client.active_order_count}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`badge-status badge-status--luxe ${client.is_active ? "badge-status--delivered" : "badge-status--cancelled"}`}>
                              <span className="badge-status__dot" />
                              {client.is_active ? "Actief" : "Inactief"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {!isLoading && !isError && totalCount > PAGE_SIZE && (
              <div className="flex items-center justify-between px-5 py-3 border-t border-[hsl(var(--gold)/0.15)] text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {currentPage * PAGE_SIZE + 1}
                  {" tot "}
                  {Math.min((currentPage + 1) * PAGE_SIZE, totalCount)}
                  {" van "}
                  {totalCount}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                  >
                    Vorige
                  </Button>
                  <span className="tabular-nums">
                    {currentPage + 1} / {totalPages}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={currentPage >= totalPages - 1}
                  >
                    Volgende
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedClient && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:bg-transparent"
          onClick={() => setSelectedClient(null)}
          aria-hidden
        />
      )}

      {selectedClient && (
        <div
          ref={panelRef}
          className="fixed top-14 bottom-0 right-0 w-full sm:w-96 lg:w-[420px] bg-card border-l border-[hsl(var(--gold)/0.25)] shadow-2xl z-40 overflow-y-auto"
          style={{ boxShadow: "-12px 0 32px -8px hsl(var(--gold-deep)/0.08)" }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--gold)/0.2)] sticky top-0 bg-card z-10"
            style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.2) 100%)" }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSelectedClient(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h2
                className="text-base font-semibold text-foreground truncate font-display tracking-tight"
                title={selectedClient.name}
              >
                {selectedClient.name}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/orders/nieuw?client_id=${selectedClient.id}`)}
                title="Nieuwe order voor deze klant"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(`/klanten/${selectedClient.id}`)}
                title="Open volledig detail"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingClient(selectedClient)}
                title="Klant bewerken"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setSelectedClient(null)} title="Sluiten">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ClientDetailPanel client={selectedClient} />
        </div>
      )}

      <NewClientDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
      <NewClientDialog
        open={editingClient !== null}
        onOpenChange={(v) => { if (!v) setEditingClient(null); }}
        client={editingClient ?? undefined}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | null;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-[hsl(var(--gold)/0.2)] px-4 py-3"
      style={{
        background: accent
          ? "linear-gradient(135deg, hsl(var(--gold-soft)/0.55) 0%, hsl(var(--gold-soft)/0.2) 100%)"
          : "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.18) 100%)",
      }}
    >
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-2xl font-display font-semibold tabular-nums text-foreground"
      >
        {value === null ? "…" : value}
      </div>
    </div>
  );
}
