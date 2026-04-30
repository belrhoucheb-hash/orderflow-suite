import { useState, useMemo, useCallback } from "react";
import { Receipt, Search, Plus, Eye, Download, Loader2, ArrowRight, Check, FileDown, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileCode, Wallet, AlertTriangle, CheckCircle2, FileClock, SendHorizonal } from "lucide-react";
import { SortableHeader, type SortConfig } from "@/components/ui/SortableHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useInvoices, useCreateInvoice, useUpdateInvoiceStatus, type InvoiceLine } from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useClients } from "@/hooks/useClients";
import { downloadInvoicesCSV, downloadUBL } from "@/lib/invoiceUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "react-i18next";

const statusStyles: Record<string, string> = {
  concept: "bg-muted text-muted-foreground border-border",
  verzonden: "bg-blue-500/8 text-blue-700 dark:text-blue-400 border-blue-200/60 dark:border-blue-800/60",
  betaald: "bg-emerald-500/8 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60",
  vervallen: "bg-red-500/8 text-red-700 dark:text-red-400 border-red-200/60 dark:border-red-800/60",
};

const statusDotColors: Record<string, string> = {
  concept: "bg-muted-foreground/40",
  verzonden: "bg-blue-500",
  betaald: "bg-emerald-500",
  vervallen: "bg-red-500",
};

const statusLabels: Record<string, string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  betaald: "Betaald",
  vervallen: "Vervallen",
};

const filterOptions = ["alle", "concept", "verzonden", "betaald", "vervallen"] as const;
const tableHeaderLabelClass = "text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status !== "verzonden") return false;
  return new Date(dueDate) < new Date();
}

const Facturatie = () => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(25);
  const { data, isLoading, isError, refetch } = useInvoices({
    page,
    pageSize,
    statusFilter: statusFilter !== "alle" ? statusFilter : undefined,
    search: search || undefined,
  });
  const invoices = data?.invoices ?? [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const { data: clients = [] } = useClients();
  const createInvoiceMutation = useCreateInvoice();
  const updateInvoiceStatusMutation = useUpdateInvoiceStatus();

  const { data: clientOrders = [], isLoading: isLoadingClientOrders } = useQuery({
    queryKey: ["client-uninvoiced-orders", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const client = clients.find((c) => c.id === selectedClientId);
      if (!client) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, client_name, weight_kg, quantity, unit, pickup_address, delivery_address, status, distance_km")
        .eq("status", "DELIVERED")
        .is("invoice_id", null)
        .or(`client_id.eq.${selectedClientId},client_name.ilike.%${client.name}%`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: clientRates = [] } = useQuery({
    queryKey: ["client-rates-for-invoice", selectedClientId],
    enabled: !!selectedClientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_rates")
        .select("*")
        .eq("client_id", selectedClientId)
        .eq("is_active", true)
        .order("rate_type");
      if (error) throw error;
      return data || [];
    },
  });

  const toggleOrderSelection = useCallback((orderId: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }, []);

  const handleCreateInvoice = useCallback(async () => {
    if (!selectedClientId || selectedOrderIds.size === 0) return;

    const lines: Omit<InvoiceLine, "id" | "invoice_id" | "created_at">[] = [];
    let sortOrder = 0;
    const selectedOrders = clientOrders.filter((o: any) => selectedOrderIds.has(o.id));

    for (const order of selectedOrders) {
      if (clientRates.length === 0) {
        lines.push({
          order_id: order.id,
          description: `Transport #${order.order_number} - ${order.pickup_address?.split(",")[0] || "?"} -> ${order.delivery_address?.split(",")[0] || "?"}`,
          quantity: 1,
          unit: "rit",
          unit_price: 0,
          total: 0,
          sort_order: sortOrder++,
        });
      } else {
        for (const rate of clientRates) {
          let qty = 1;
          let unitLabel = "stuk";
          let include = false;

          switch (rate.rate_type) {
            case "per_km": { qty = order.distance_km ?? 0; unitLabel = "km"; include = true; break; }
            case "per_pallet": {
              const pallets = order.quantity ?? 0;
              if (pallets > 0) { qty = pallets; unitLabel = "pallet"; include = true; }
              break;
            }
            case "per_rit": { qty = 1; unitLabel = "rit"; include = true; break; }
            case "toeslag":
            case "surcharge": { qty = 1; unitLabel = "stuk"; include = true; break; }
            default: { qty = 1; unitLabel = "stuk"; include = true; break; }
          }

          if (include) {
            const lineTotal = Math.round(qty * rate.amount * 100) / 100;
            lines.push({
              order_id: order.id,
              description: `Order #${order.order_number}: ${rate.description || rate.rate_type}`,
              quantity: qty,
              unit: unitLabel,
              unit_price: rate.amount,
              total: lineTotal,
              sort_order: sortOrder++,
            });
          }
        }
      }
    }

    try {
      const invoice = await createInvoiceMutation.mutateAsync({
        client_id: selectedClientId,
        lines,
      });

      for (const orderId of selectedOrderIds) {
        await supabase
          .from("orders")
          .update({ invoice_id: invoice.id, billing_status: "GEFACTUREERD" })
          .eq("id", orderId);
      }

      toast.success(`Factuur ${invoice.invoice_number} aangemaakt`, {
        description: `${selectedOrderIds.size} order(s) gekoppeld`,
      });
      setShowNewInvoice(false);
      setSelectedClientId("");
      setSelectedOrderIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["uninvoiced-orders"] });
      queryClient.invalidateQueries({ queryKey: ["client-uninvoiced-orders", selectedClientId] });
    } catch (e: any) {
      toast.error("Factuur aanmaken mislukt", { description: e.message });
    }
  }, [selectedClientId, selectedOrderIds, clientOrders, clientRates, createInvoiceMutation, queryClient]);

  const handleSort = (field: string) => {
    setSortConfig((prev) =>
      prev?.field === field
        ? { field, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { field, direction: "asc" }
    );
  };

  const handleInvoiceStatusAction = useCallback(async (
    invoiceId: string,
    nextStatus: "verzonden" | "betaald",
  ) => {
    try {
      await updateInvoiceStatusMutation.mutateAsync({ id: invoiceId, status: nextStatus });
      toast.success(
        nextStatus === "verzonden" ? "Factuur verzonden gemarkeerd" : "Factuur als betaald gemarkeerd",
      );
    } catch (error: any) {
      toast.error("Status bijwerken mislukt", { description: error?.message ?? "Onbekende fout" });
    }
  }, [updateInvoiceStatusMutation]);

  const { data: uninvoicedOrders = [] } = useQuery({
    queryKey: ["uninvoiced-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, order_number, client_name, weight_kg, quantity, unit, delivery_address, billing_status")
        .eq("status", "DELIVERED")
        .is("invoice_id", null)
        .or("billing_status.is.null,billing_status.eq.GEREED,billing_status.eq.NIET_GEREED")
        .order("updated_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (!sortConfig) return invoices;

    const { field, direction } = sortConfig;
    return [...invoices].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      switch (field) {
        case "invoice_number": aVal = a.invoice_number.toLowerCase(); bVal = b.invoice_number.toLowerCase(); break;
        case "client_name": aVal = a.client_name.toLowerCase(); bVal = b.client_name.toLowerCase(); break;
        case "total": aVal = a.total; bVal = b.total; break;
        case "status": {
          const aStatus = isOverdue(a.due_date, a.status) ? "vervallen" : a.status;
          const bStatus = isOverdue(b.due_date, b.status) ? "vervallen" : b.status;
          aVal = aStatus; bVal = bStatus; break;
        }
        default: return 0;
      }
      if (aVal < bVal) return direction === "asc" ? -1 : 1;
      if (aVal > bVal) return direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [invoices, sortConfig]);

  const handleExportCSV = useCallback(() => {
    if (filtered.length === 0) {
      toast.error("Geen facturen om te exporteren");
      return;
    }
    downloadInvoicesCSV(filtered as any);
    toast.success("CSV export gedownload", { description: `${filtered.length} facturen geexporteerd` });
  }, [filtered]);

  const handleExportUBL = useCallback(async () => {
    if (filtered.length === 0) {
      toast.error("Geen facturen om te exporteren");
      return;
    }
    let exportCount = 0;
    for (const inv of filtered) {
      const { data: fullInvoice, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", inv.id)
        .single();

      if (error || !fullInvoice) continue;

      if (fullInvoice.invoice_lines) {
        fullInvoice.invoice_lines.sort((a: any, b: any) => a.sort_order - b.sort_order);
      }

      downloadUBL(fullInvoice as any);
      exportCount++;
    }
    toast.success("UBL export gedownload", { description: `${exportCount} XML-bestanden geexporteerd` });
  }, [filtered]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totaalOpenstaand = 0;
    let dezeMaandGefactureerd = 0;
    let betaaldDezeMaand = 0;
    let vervallenCount = 0;
    let conceptCount = 0;
    let conceptAmount = 0;

    invoices.forEach((inv) => {
      const invDate = new Date(inv.invoice_date);
      const isThisMonth =
        invDate.getMonth() === currentMonth &&
        invDate.getFullYear() === currentYear;

      if (inv.status === "verzonden") {
        totaalOpenstaand += inv.total;
      }

      if (isOverdue(inv.due_date, inv.status)) {
        vervallenCount++;
      }

      if (inv.status === "concept") {
        conceptCount++;
        conceptAmount += inv.total;
      }

      if (isThisMonth && (inv.status === "verzonden" || inv.status === "betaald")) {
        dezeMaandGefactureerd += inv.total;
      }

      if (inv.status === "betaald" && isThisMonth) {
        betaaldDezeMaand += inv.total;
      }
    });

    const betaalRatio = dezeMaandGefactureerd > 0
      ? Math.round((betaaldDezeMaand / dezeMaandGefactureerd) * 100)
      : 100;

    return { totaalOpenstaand, dezeMaandGefactureerd, betaaldDezeMaand, vervallenCount, conceptCount, conceptAmount, betaalRatio };
  }, [invoices]);

  if (isLoading) {
    return <LoadingState message="Facturen laden..." />;
  }

  if (isError) {
    return <QueryError message="Kan facturen niet laden. Probeer het opnieuw." onRetry={() => refetch()} />;
  }

  return (
    <div className="page-container space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.16)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.46),hsl(var(--card))_46%,hsl(var(--gold-soft)/0.18))] px-5 py-5 shadow-[0_22px_70px_-54px_hsl(32_45%_26%/0.45)]">
        <div
          aria-hidden
          className="absolute -top-6 -left-8 h-32 w-64 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at top left, hsl(var(--gold-soft) / 0.6), transparent 70%)" }}
        />
        <div className="relative flex items-end justify-between gap-5 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="mb-2 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
              <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))]">
                Finance
              </span>
              <span aria-hidden className="inline-block h-[3px] w-[3px] rounded-full" style={{ background: "hsl(var(--gold) / 0.5)" }} />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground/70 tabular-nums">
                {totalCount} {totalCount === 1 ? "factuur" : "facturen"}
              </span>
            </div>
            <h1
              className="text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-foreground"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {t("pages.invoicing.title")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Facturen, openstaand en leveringen die nog door je werktafel moeten.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2 rounded-xl h-10 px-4">
                  <FileDown className="h-4 w-4" />
                  Exporteer
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleExportCSV} className="gap-2 cursor-pointer">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportUBL} className="gap-2 cursor-pointer">
                  <FileCode className="h-4 w-4 text-blue-600" />
                  Export UBL (XML)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" onClick={() => { setShowNewInvoice(true); setSelectedClientId(""); setSelectedOrderIds(new Set()); }} className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-10 px-5">
              <Plus className="h-4 w-4" /> {t("pages.invoicing.newInvoice")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <section className="card--luxe p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}
            >
              <FileClock className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Prioriteit
              </p>
              <h3 className="text-sm font-semibold text-foreground">Waar je facturatie nu aan moet trekken</h3>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border p-3" style={{ borderColor: "hsl(var(--gold) / 0.14)", background: "hsl(var(--gold-soft) / 0.12)" }}>
              <div className="mb-2 flex items-center gap-2">
                <FileClock className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                <p className="text-sm font-semibold text-foreground">Nog te factureren</p>
              </div>
              <p className="text-xl font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{uninvoicedOrders.length}</p>
              <p className="mt-1 text-xs text-muted-foreground">Afgeleverde orders die nog cash moeten worden.</p>
            </div>

            <div className="rounded-2xl border border-red-400/18 bg-red-500/6 p-3">
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-300" />
                <p className="text-sm font-semibold text-foreground">Vervallen</p>
              </div>
              <p className="text-xl font-semibold tabular-nums text-foreground" style={{ fontFamily: "var(--font-display)" }}>{stats.vervallenCount}</p>
              <p className="mt-1 text-xs text-muted-foreground">Facturen die opvolging of een herinnering vragen.</p>
            </div>

            <div className="rounded-2xl border border-sky-400/18 bg-sky-500/6 p-3">
              <div className="mb-2 flex items-center gap-2">
                <SendHorizonal className="h-4 w-4 text-sky-300" />
                <p className="text-sm font-semibold text-foreground">Conceptdruk</p>
              </div>
              <p className="text-xl font-semibold tabular-nums text-foreground" style={{ fontFamily: "var(--font-display)" }}>{formatCurrency(stats.conceptAmount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Waarde die nog niet verzonden is naar de klant.</p>
            </div>
          </div>
        </section>

        <section className="card--luxe p-5">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "hsl(var(--gold-soft) / 0.35)" }}>
              <Receipt className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Direct oppakken
              </p>
              <h3 className="text-sm font-semibold text-foreground">Snelle acties boven je lijst</h3>
            </div>
          </div>

          <div className="space-y-3">
            {uninvoicedOrders.length > 0 ? (
              <div className="rounded-2xl border border-emerald-400/18 bg-emerald-500/6 p-3">
                <p className="text-sm font-semibold text-foreground">{uninvoicedOrders.length} afgeleverde orders zonder factuur</p>
                <p className="mt-1 text-xs text-muted-foreground">Deze orders zijn klaar om doorgezet te worden naar concept of factuur.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {uninvoicedOrders.slice(0, 4).map((order: any) => (
                    <Link
                      key={order.id}
                      to={`/orders/${order.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/18 bg-white/8 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-white/12"
                    >
                      #{order.order_number} - {order.client_name}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.1)] p-3">
                <p className="text-sm font-semibold text-foreground">Geen wachtende leveringen</p>
                <p className="mt-1 text-xs text-muted-foreground">Je afgeleverde orders lijken al netjes door de facturatieflow te lopen.</p>
              </div>
            )}

            <div className="rounded-2xl border border-white/8 bg-white/4 p-3">
              <p className="text-sm font-semibold text-foreground">{filtered.length} facturen in huidige selectie</p>
              <p className="mt-1 text-xs text-muted-foreground">Met filters en zoeken stuur je hier direct op de actuele werkvoorraad.</p>
            </div>
          </div>
        </section>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div
          className="relative flex-1 overflow-hidden rounded-[1.35rem] border max-w-xl"
          style={{
            borderColor: "hsl(var(--gold) / 0.14)",
            background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.16) 0%, hsl(var(--background)) 58%)",
            boxShadow: "0 18px 45px -30px hsl(var(--gold-deep) / 0.28)",
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-16"
            style={{ background: "linear-gradient(90deg, hsl(var(--gold) / 0.12), transparent)" }}
          />
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--gold-deep))]" />
          <input
            placeholder="Zoek op factuurnummer of klant..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="h-12 w-full bg-transparent pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground/55 focus:outline-none"
          />
        </div>
        <div
          className="flex max-w-full items-center gap-1 overflow-x-auto rounded-[1.35rem] border p-1.5"
          style={{
            borderColor: "hsl(var(--gold) / 0.14)",
            background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.14) 0%, hsl(var(--background)) 62%)",
            boxShadow: "0 18px 45px -32px hsl(var(--gold-deep) / 0.24)",
          }}
        >
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(0); }}
              className={cn(
                "rounded-[1rem] px-4 py-2 text-xs font-semibold transition-all duration-150 whitespace-nowrap",
                statusFilter === s
                  ? "text-[hsl(var(--gold-deep))] shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={statusFilter === s ? {
                background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.34) 100%)",
                boxShadow: "inset 0 1px 0 hsl(var(--background) / 0.55), 0 10px 25px -18px hsl(var(--gold-deep) / 0.55)",
              } : undefined}
            >
              {s === "alle" ? "Alle" : statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[1.6rem] border"
        style={{
          borderColor: "hsl(var(--gold) / 0.14)",
          background: "linear-gradient(180deg, hsl(var(--gold-soft) / 0.12) 0%, hsl(var(--background)) 16%, hsl(var(--background)) 100%)",
          boxShadow: "0 28px 60px -38px hsl(var(--gold-deep) / 0.28)",
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr
                className="border-b"
                style={{
                  borderColor: "hsl(var(--gold) / 0.12)",
                  background: "linear-gradient(180deg, hsl(var(--gold-soft) / 0.22) 0%, hsl(var(--background)) 100%)",
                }}
              >
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader
                    label="Factuurnummer"
                    field="invoice_number"
                    currentSort={sortConfig}
                    onSort={handleSort}
                    className={tableHeaderLabelClass}
                  />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader
                    label="Klant"
                    field="client_name"
                    currentSort={sortConfig}
                    onSort={handleSort}
                    className={tableHeaderLabelClass}
                  />
                </th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">
                  <span className={tableHeaderLabelClass}>Datum</span>
                </th>
                <th className="px-4 py-2.5 text-left hidden md:table-cell">
                  <span className={tableHeaderLabelClass}>Vervaldatum</span>
                </th>
                <th className="px-4 py-2.5 text-right">
                  <SortableHeader
                    label="Bedrag"
                    field="total"
                    currentSort={sortConfig}
                    onSort={handleSort}
                    className={cn(tableHeaderLabelClass, "justify-end")}
                  />
                </th>
                <th className="px-4 py-2.5 text-left">
                  <SortableHeader
                    label="Status"
                    field="status"
                    currentSort={sortConfig}
                    onSort={handleSort}
                    className={tableHeaderLabelClass}
                  />
                </th>
                <th className="px-4 py-2.5 text-right">
                  <span className={tableHeaderLabelClass}>Acties</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "hsl(var(--gold) / 0.08)" }}>
              {filtered.map((invoice) => {
                const overdue = isOverdue(invoice.due_date, invoice.status);
                const effectiveStatus = overdue ? "vervallen" : invoice.status;

                return (
                  <tr
                    key={invoice.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/facturatie/${invoice.id}`)}
                    onKeyDown={(e) => { if (e.key === "Enter") navigate(`/facturatie/${invoice.id}`); }}
                    className="group cursor-pointer transition-colors duration-100"
                    style={{ background: "transparent" }}
                  >
                    <td className="px-4 py-2">
                      <span className="font-mono text-sm font-medium text-foreground flex items-center gap-1.5">
                        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDotColors[effectiveStatus])} />
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/80">
                      {invoice.client_name}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground hidden md:table-cell">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2 text-sm hidden md:table-cell",
                        overdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
                      )}
                    >
                      {invoice.due_date ? formatDate(invoice.due_date) : "-"}
                    </td>
                    <td className="px-4 py-2 text-sm text-foreground/80 text-right tabular-nums font-medium">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border", statusStyles[effectiveStatus])}>
                        <span className={cn("h-1 w-1 rounded-full", statusDotColors[effectiveStatus])} />
                        {statusLabels[effectiveStatus]}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {effectiveStatus === "concept" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInvoiceStatusAction(invoice.id, "verzonden");
                              }}
                              disabled={updateInvoiceStatusMutation.isPending}
                              className="rounded-md border border-blue-200/60 px-2 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-500/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800/60 dark:text-blue-300"
                            >
                              Verzend
                            </button>
                          )}
                          {(effectiveStatus === "verzonden" || effectiveStatus === "vervallen") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleInvoiceStatusAction(invoice.id, "betaald");
                              }}
                              disabled={updateInvoiceStatusMutation.isPending}
                              className="rounded-md border border-emerald-200/60 px-2 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/8 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800/60 dark:text-emerald-300"
                            >
                              Betaald
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/facturatie/${invoice.id}`); }}
                            className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                          >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {invoice.pdf_url && (
                          <a
                            href={invoice.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-20 text-center">
                    <div
                      className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border"
                      style={{
                        borderColor: "hsl(var(--gold) / 0.14)",
                        background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.35) 0%, hsl(var(--gold) / 0.18) 100%)",
                      }}
                    >
                      <Receipt className="h-6 w-6 text-[hsl(var(--gold-deep))]" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-foreground">
                      Geen facturen gevonden
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Zodra facturen binnenkomen, verschijnt je werkvoorraad hier.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div
          className="flex items-center justify-between border-t px-4 py-3"
          style={{
            borderColor: "hsl(var(--gold) / 0.12)",
            background: "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--gold-soft) / 0.18) 100%)",
          }}
        >
          <p className="text-xs text-muted-foreground">
            {filtered.length > 0
              ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, totalCount)} van ${totalCount} facturen`
              : "0 facturen"}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(
                "inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                page === 0 ? "cursor-not-allowed text-muted-foreground/40" : "text-foreground hover:bg-[hsl(var(--gold-soft)/0.3)]",
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Vorige
            </button>
            <span className="text-xs text-muted-foreground tabular-nums px-2">
              Pagina {page + 1} van {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className={cn(
                "inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                page >= totalPages - 1 ? "cursor-not-allowed text-muted-foreground/40" : "text-foreground hover:bg-[hsl(var(--gold-soft)/0.3)]",
              )}
            >
              Volgende
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            Totaal: {formatCurrency(filtered.reduce((s, inv) => s + inv.total, 0))}
          </p>
        </div>
      </div>

      <Dialog open={showNewInvoice} onOpenChange={setShowNewInvoice}>
        <DialogContent
          className="overflow-hidden border-0 bg-transparent p-0 shadow-none sm:max-w-2xl"
        >
          <div
            className="rounded-[1.75rem] border"
            style={{
              borderColor: "hsl(var(--gold) / 0.16)",
              background: "linear-gradient(180deg, hsl(var(--gold-soft) / 0.16) 0%, hsl(var(--background)) 18%, hsl(var(--background)) 100%)",
              boxShadow: "0 36px 80px -42px hsl(var(--gold-deep) / 0.38)",
            }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-32"
              style={{ background: "radial-gradient(circle at top, hsl(var(--gold-soft) / 0.6), transparent 72%)" }}
            />
            <DialogHeader className="relative border-b px-6 pb-5 pt-6" style={{ borderColor: "hsl(var(--gold) / 0.12)" }}>
              <div className="mb-3 flex items-center gap-2" style={{ fontFamily: "var(--font-display)" }}>
                <span aria-hidden className="inline-block h-[1px] w-6" style={{ background: "hsl(var(--gold) / 0.5)" }} />
                <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--gold-deep))]">
                  Facturatie
                </span>
              </div>
              <DialogTitle
                className="text-[1.7rem] leading-tight text-foreground"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Nieuwe factuur aanmaken
              </DialogTitle>
              <DialogDescription className="mt-2 max-w-xl text-sm text-muted-foreground">
                Selecteer een klant en zet afgeleverde orders direct door naar een nette factuurflow.
              </DialogDescription>
          </DialogHeader>

            <div className="relative space-y-5 px-6 py-6">
            <div
              className="rounded-[1.35rem] border p-4"
              style={{
                borderColor: "hsl(var(--gold) / 0.14)",
                background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.14) 0%, hsl(var(--background)) 72%)",
              }}
            >
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]">
                Klant
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => { setSelectedClientId(e.target.value); setSelectedOrderIds(new Set()); }}
                className="h-12 w-full rounded-[1rem] border bg-background/90 px-4 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                style={{ borderColor: "hsl(var(--gold) / 0.14)" }}
              >
                <option value="">Selecteer een klant...</option>
                {clients.filter((c) => c.is_active).map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            {selectedClientId && (
              <div
                className="rounded-[1.35rem] border p-4"
                style={{
                  borderColor: "hsl(var(--gold) / 0.14)",
                  background: "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--gold-soft) / 0.12) 100%)",
                }}
              >
                <div className="mb-3 flex items-end justify-between gap-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]">
                  Onverfactureerde orders
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {clientOrders.length} beschikbaar
                  </p>
                </div>
                {isLoadingClientOrders ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-[hsl(var(--gold-deep))]" />
                  </div>
                ) : clientOrders.length === 0 ? (
                  <div
                    className="rounded-[1.1rem] border px-4 py-8 text-center"
                    style={{
                      borderColor: "hsl(var(--gold) / 0.12)",
                      background: "hsl(var(--gold-soft) / 0.1)",
                    }}
                  >
                    <p className="text-sm font-medium text-foreground">Geen onverfactureerde orders voor deze klant</p>
                    <p className="mt-1 text-xs text-muted-foreground">Zodra er leveringen klaarstaan, kun je ze hier bundelen.</p>
                  </div>
                ) : (
                  <div
                    className="space-y-2 max-h-72 overflow-y-auto rounded-[1.1rem] border p-2"
                    style={{ borderColor: "hsl(var(--gold) / 0.12)", background: "hsl(var(--background) / 0.76)" }}
                  >
                    {clientOrders.map((order: any) => (
                      <label
                        key={order.id}
                        className={cn(
                          "flex items-start gap-3 rounded-[1rem] border p-3 cursor-pointer transition-all",
                          selectedOrderIds.has(order.id)
                            ? "shadow-sm"
                            : "hover:bg-[hsl(var(--gold-soft)/0.12)]"
                        )}
                        style={selectedOrderIds.has(order.id)
                          ? {
                              borderColor: "hsl(var(--gold) / 0.22)",
                              background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.32) 0%, hsl(var(--background)) 100%)",
                            }
                          : {
                              borderColor: "hsl(var(--gold) / 0.08)",
                              background: "hsl(var(--background) / 0.82)",
                            }}
                      >
                        <div className="pt-0.5">
                          <Checkbox
                            checked={selectedOrderIds.has(order.id)}
                            onCheckedChange={() => toggleOrderSelection(order.id)}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
                              #{order.order_number}
                            </span>
                            {order.quantity > 0 && (
                              <span
                                className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--gold-deep))]"
                                style={{ background: "hsl(var(--gold-soft) / 0.5)" }}
                              >
                                {order.quantity} {order.unit || "stuks"}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground truncate">
                            {order.client_name}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground truncate">
                            {order.pickup_address?.split(",")[0] || "?"} {"->"} {order.delivery_address?.split(",")[0] || "?"}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedOrderIds.size > 0 && (
              <div
                className="rounded-[1.2rem] border px-4 py-3"
                style={{
                  borderColor: "hsl(var(--gold) / 0.16)",
                  background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.22) 0%, hsl(var(--background)) 100%)",
                }}
              >
                <p className="text-sm text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedOrderIds.size}</span> order(s) geselecteerd
                  {clientRates.length === 0 && (
                    <span className="ml-2 text-amber-600">- geen tarieven geconfigureerd, lege regels worden aangemaakt</span>
                  )}
                </p>
              </div>
            )}

            <div
              className="flex justify-end gap-2 border-t pt-5"
              style={{ borderColor: "hsl(var(--gold) / 0.12)" }}
            >
              <Button
                variant="outline"
                onClick={() => setShowNewInvoice(false)}
                className="h-11 rounded-[1rem] border px-4"
                style={{ borderColor: "hsl(var(--gold) / 0.14)", background: "hsl(var(--background) / 0.85)" }}
              >
                Annuleren
              </Button>
              <Button
                onClick={handleCreateInvoice}
                disabled={!selectedClientId || selectedOrderIds.size === 0 || createInvoiceMutation.isPending}
                className="h-11 gap-2 rounded-[1rem] px-5 text-[hsl(var(--gold-deep))] shadow-sm hover:opacity-95"
                style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.4) 100%)" }}
              >
                {createInvoiceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Factuur aanmaken
              </Button>
            </div>
          </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Facturatie;
