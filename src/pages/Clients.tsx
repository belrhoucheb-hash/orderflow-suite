import { lazy, Suspense, useMemo, useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
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
  Download,
  UserX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useClientsPageData,
  useBulkUpdateClientsActive,
  type Client,
  type ClientSortKey,
} from "@/hooks/useClients";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { toCsv, downloadCsv } from "@/lib/csv";

type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;
const ClientDetailPanel = lazy(() =>
  import("@/components/clients/ClientDetailPanel").then((module) => ({ default: module.ClientDetailPanel })),
);
const NewClientDialog = lazy(() =>
  import("@/components/clients/NewClientDialog").then((module) => ({ default: module.NewClientDialog })),
);

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkDeactivate, setPendingBulkDeactivate] = useState(false);
  const bulkUpdateActive = useBulkUpdateClientsActive();
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const isActive =
    statusFilter === "actief" ? true : statusFilter === "inactief" ? false : null;
  const country = countryFilter === "alle" ? null : countryFilter;

  const { data, isLoading, isError, refetch } = useClientsPageData({
    search: debouncedSearch,
    page,
    pageSize: PAGE_SIZE,
    isActive,
    country,
    sortKey,
    sortDir,
    dormantOnly: activityFilter === "slapend",
  });
  const countries = data?.countries ?? [];
  const stats = data?.stats;
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
  }, [debouncedSearch, statusFilter, countryFilter, openOrdersFilter, activityFilter, sortKey, sortDir]);

  // Selectie resetten bij filter- of paginawissel, anders blijft een id
  // geselecteerd van een rij die niet meer zichtbaar is.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [debouncedSearch, statusFilter, countryFilter, openOrdersFilter, activityFilter, page]);

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

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageRowIds = pageRows.map((c) => c.id);
  const selectedOnPage = pageRowIds.filter((id) => selectedIds.has(id)).length;
  const allPageSelected = pageRows.length > 0 && selectedOnPage === pageRows.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageRowIds.forEach((id) => next.delete(id));
      } else {
        pageRowIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  const selectedRows = useMemo(
    () => serverRows.filter((c) => selectedIds.has(c.id)),
    [serverRows, selectedIds],
  );

  function handleExportCsv() {
    if (selectedRows.length === 0) return;
    const headers = [
      "Naam",
      "KvK",
      "Contactpersoon",
      "Email",
      "Telefoon",
      "Stad",
      "Actieve orders",
      "Status",
    ];
    const rows = selectedRows.map((c) => [
      c.name,
      c.kvk_number ?? "",
      c.contact_person ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.city ?? "",
      c.active_order_count ?? 0,
      c.is_active ? "Actief" : "Inactief",
    ]);
    const csv = toCsv(headers, rows);
    const date = new Date().toISOString().split("T")[0];
    downloadCsv(`klanten-export-${date}.csv`, csv);
    toast.success(
      `${selectedRows.length} ${selectedRows.length === 1 ? "klant" : "klanten"} geëxporteerd`,
    );
  }

  const bulkActiveOrderCount = selectedRows.reduce(
    (sum, c) => sum + (c.active_order_count ?? 0),
    0,
  );
  const bulkActiveWithOrders = selectedRows.filter(
    (c) => (c.active_order_count ?? 0) > 0,
  ).length;

  async function confirmBulkDeactivate() {
    setPendingBulkDeactivate(false);
    const ids = Array.from(selectedIds);
    try {
      const res = await bulkUpdateActive.mutateAsync({ ids, isActive: false });
      toast.success(
        `${res.updated} ${res.updated === 1 ? "klant" : "klanten"} op inactief gezet`,
      );
      setSelectedIds(new Set());
    } catch (e) {
      toast.error("Kon klanten niet bijwerken");
    }
  }

  return (
    <div className="flex h-full">
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${selectedClient ? "lg:mr-[420px]" : ""}`}>
        <div className="p-6 space-y-4 max-w-[1800px] mx-auto w-full">
          <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.16)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.46),hsl(var(--card))_46%,hsl(var(--gold-soft)/0.18))] px-5 py-5 shadow-[0_22px_70px_-54px_hsl(32_45%_26%/0.45)]">
            <div
              aria-hidden
              className="absolute -top-6 -left-8 w-64 h-32 pointer-events-none"
              style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)" }}
            />
            <div className="relative flex items-end justify-between gap-5 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2" style={{ fontFamily: "var(--font-display)" }}>
                  <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
                  <span className="text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))] font-semibold">
                    Operations
                  </span>
                  <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold) / 0.5)" }} />
                  <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums font-medium">
                    {totalCount} {totalCount === 1 ? "klant" : "klanten"}
                  </span>
                </div>
                <h1
                  className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Klanten
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Beheer klantgegevens, activiteit en commerciële status vanuit één overzicht
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowNewDialog(true)}
                  className="btn-luxe btn-luxe--primary !h-9"
                >
                  <Plus className="h-4 w-4" />
                  Nieuwe klant
                </button>
              </div>
            </div>
          </div>

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

          {selectedIds.size > 0 && (
            <div
              className="card--luxe px-4 py-3 flex flex-wrap items-center gap-3"
              role="toolbar"
              aria-label="Bulk-acties"
            >
              <span className="text-sm text-foreground">
                <strong className="tabular-nums">{selectedIds.size}</strong>{" "}
                {selectedIds.size === 1 ? "klant geselecteerd" : "klanten geselecteerd"}
              </span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                className="h-8"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Exporteer CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingBulkDeactivate(true)}
                disabled={bulkUpdateActive.isPending}
                className="h-8"
              >
                <UserX className="h-3.5 w-3.5 mr-1.5" />
                Zet op inactief
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="h-8"
              >
                Selectie wissen
              </Button>
            </div>
          )}

          <div className="card--luxe overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full data-table">
                <thead>
                  <tr
                    className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[12px] [&>th]:!uppercase [&>th]:!tracking-[0.16em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold [&>th]:!py-3.5 [&>th]:!px-5"
                    style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
                  >
                    <th className="!w-10 !px-3">
                      <Checkbox
                        aria-label="Selecteer alle klanten op deze pagina"
                        checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
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
                    <tr><td colSpan={7}><LoadingState message="Klanten laden..." /></td></tr>
                  ) : isError ? (
                    <tr><td colSpan={7}>
                      <QueryError message="Kan klantgegevens niet laden." onRetry={() => refetch()} />
                    </td></tr>
                  ) : pageRows.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">Geen klanten gevonden</td></tr>
                  ) : (
                    pageRows.map((client) => {
                      const isSelected = selectedClient?.id === client.id;
                      const isChecked = selectedIds.has(client.id);
                      return (
                        <tr
                          key={client.id}
                          onClick={() => setSelectedClient(client)}
                          className={`border-b border-[hsl(var(--gold)/0.08)] cursor-pointer transition-colors hover:bg-[hsl(var(--gold-soft)/0.3)] ${
                            isSelected ? "bg-[hsl(var(--gold-soft)/0.5)]" : ""
                          } ${isChecked ? "bg-[hsl(var(--gold-soft)/0.35)]" : ""}`}
                        >
                          <td
                            className="px-3 py-3.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              aria-label={`Selecteer ${client.name}`}
                              checked={isChecked}
                              onCheckedChange={() => toggleRow(client.id)}
                            />
                          </td>
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
          <Suspense
            fallback={
              <div className="p-5">
                <LoadingState label="Klantdetail laden..." />
              </div>
            }
          >
            <ClientDetailPanel client={selectedClient} />
          </Suspense>
        </div>
      )}

      {(showNewDialog || editingClient !== null) && (
        <Suspense fallback={null}>
          <NewClientDialog open={showNewDialog} onOpenChange={setShowNewDialog} />
          <NewClientDialog
            open={editingClient !== null}
            onOpenChange={(v) => { if (!v) setEditingClient(null); }}
            client={editingClient ?? undefined}
          />
        </Suspense>
      )}

      <AlertDialog
        open={pendingBulkDeactivate}
        onOpenChange={(o) => !o && setPendingBulkDeactivate(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selectedIds.size} {selectedIds.size === 1 ? "klant" : "klanten"} op inactief zetten?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkActiveWithOrders > 0 ? (
                <>
                  <strong>{bulkActiveWithOrders}</strong>{" "}
                  {bulkActiveWithOrders === 1
                    ? "geselecteerde klant heeft nog"
                    : "geselecteerde klanten hebben nog"}{" "}
                  <strong>{bulkActiveOrderCount}</strong>{" "}
                  {bulkActiveOrderCount === 1 ? "actieve order" : "actieve orders"}.
                  Inactief zetten betekent dat ze niet meer in nieuwe-order-dropdowns
                  verschijnen. Lopende orders blijven gewoon gekoppeld.
                </>
              ) : (
                "Inactieve klanten verschijnen niet meer in nieuwe-order-dropdowns. Dit is niet permanent; je kunt ze altijd weer activeren via het klant-detailpaneel."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkDeactivate}>
              Toch deactiveren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
