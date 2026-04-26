import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Euro,
  ExternalLink,
  FileClock,
  Receipt,
  SendHorizonal,
  Sparkles,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { KPIStrip } from "@/components/ui/KPIStrip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/LoadingState";
import { QueryError } from "@/components/QueryError";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  client_name: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  status: "concept" | "verzonden" | "betaald" | "vervallen";
};

type OrderRow = {
  id: string;
  order_number: string | null;
  client_name: string | null;
  status: string | null;
  billing_status: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  updated_at: string;
};

type FinancePayload = {
  invoices: InvoiceRow[];
  unbilledOrders: OrderRow[];
};

type MonthSlice = {
  key: string;
  label: string;
  invoiced: number;
  collected: number;
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string | null) {
  if (!date) return "Geen datum";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isInvoiceOverdue(invoice: InvoiceRow, now: Date) {
  if (invoice.status !== "verzonden" || !invoice.due_date) return false;
  return new Date(invoice.due_date) < now;
}

const statusLabel: Record<InvoiceRow["status"] | "overdue", string> = {
  concept: "Concept",
  verzonden: "Verzonden",
  betaald: "Betaald",
  vervallen: "Vervallen",
  overdue: "Vervallen",
};

const statusTone: Record<InvoiceRow["status"] | "overdue", string> = {
  concept: "bg-white/6 text-white/70 border-white/10",
  verzonden: "bg-sky-500/10 text-sky-300 border-sky-400/20",
  betaald: "bg-emerald-500/10 text-emerald-300 border-emerald-400/20",
  vervallen: "bg-red-500/10 text-red-300 border-red-400/20",
  overdue: "bg-red-500/10 text-red-300 border-red-400/20",
};

const bucketLabels = ["0-30", "31-60", "61-90", "90+"] as const;

const Finance = () => {
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery<FinancePayload>({
    queryKey: ["finance-overview"],
    staleTime: 30_000,
    queryFn: async () => {
      const [invoicesResult, unbilledResult] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, invoice_number, client_name, invoice_date, due_date, total, status")
          .order("invoice_date", { ascending: false })
          .range(0, 199),
        supabase
          .from("orders")
          .select("id, order_number, client_name, status, billing_status, pickup_address, delivery_address, updated_at")
          .eq("status", "DELIVERED")
          .is("invoice_id", null)
          .order("updated_at", { ascending: false })
          .limit(25),
      ]);

      if (invoicesResult.error) throw invoicesResult.error;
      if (unbilledResult.error) throw unbilledResult.error;

      return {
        invoices: (invoicesResult.data ?? []) as InvoiceRow[],
        unbilledOrders: (unbilledResult.data ?? []) as OrderRow[],
      };
    },
  });

  const finance = useMemo(() => {
    const invoices = data?.invoices ?? [];
    const unbilledOrders = data?.unbilledOrders ?? [];
    const now = new Date();
    const thisMonthStart = startOfMonth(now);
    const thisMonthEnd = endOfMonth(now);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthStart = startOfMonth(previousMonth);
    const previousMonthEnd = endOfMonth(previousMonth);

    let openAmount = 0;
    let overdueAmount = 0;
    let conceptAmount = 0;
    let conceptCount = 0;
    let currentMonthRevenue = 0;
    let previousMonthRevenue = 0;
    let paidThisQuarter = 0;
    let collectibleThisQuarter = 0;

    const overdueInvoices: InvoiceRow[] = [];
    const receivables = {
      "0-30": 0,
      "31-60": 0,
      "61-90": 0,
      "90+": 0,
    };

    const clientTotals = new Map<string, { revenue: number; invoices: number }>();
    const monthlySeries = new Map<string, MonthSlice>();

    for (let offset = 5; offset >= 0; offset -= 1) {
      const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const key = getMonthKey(cursor);
      monthlySeries.set(key, {
        key,
        label: cursor.toLocaleDateString("nl-NL", { month: "short" }),
        invoiced: 0,
        collected: 0,
      });
    }

    for (const invoice of invoices) {
      const invoiceDate = new Date(invoice.invoice_date);
      const isOverdue = isInvoiceOverdue(invoice, now);
      const invoiceMonth = getMonthKey(invoiceDate);
      const monthlyEntry = monthlySeries.get(invoiceMonth);
      const effectiveStatus = isOverdue ? "overdue" : invoice.status;

      if (monthlyEntry) {
        monthlyEntry.invoiced += invoice.total;
        if (invoice.status === "betaald") {
          monthlyEntry.collected += invoice.total;
        }
      }

      const clientKey = invoice.client_name || "Onbekende klant";
      const existingClient = clientTotals.get(clientKey) ?? { revenue: 0, invoices: 0 };
      existingClient.revenue += invoice.total;
      existingClient.invoices += 1;
      clientTotals.set(clientKey, existingClient);

      if (invoiceDate >= thisMonthStart && invoiceDate <= thisMonthEnd) {
        currentMonthRevenue += invoice.total;
      }

      if (invoiceDate >= previousMonthStart && invoiceDate <= previousMonthEnd) {
        previousMonthRevenue += invoice.total;
      }

      const quarterAgo = new Date(now);
      quarterAgo.setMonth(now.getMonth() - 3);
      if (invoiceDate >= quarterAgo) {
        collectibleThisQuarter += invoice.total;
        if (invoice.status === "betaald") {
          paidThisQuarter += invoice.total;
        }
      }

      if (invoice.status === "concept") {
        conceptAmount += invoice.total;
        conceptCount += 1;
      }

      if (invoice.status === "verzonden" || effectiveStatus === "overdue" || invoice.status === "vervallen") {
        openAmount += invoice.total;
      }

      if (effectiveStatus === "overdue" || invoice.status === "vervallen") {
        overdueAmount += invoice.total;
        overdueInvoices.push(invoice);

        if (invoice.due_date) {
          const daysLate = Math.max(
            0,
            Math.floor((now.getTime() - new Date(invoice.due_date).getTime()) / 86_400_000),
          );

          if (daysLate <= 30) receivables["0-30"] += invoice.total;
          else if (daysLate <= 60) receivables["31-60"] += invoice.total;
          else if (daysLate <= 90) receivables["61-90"] += invoice.total;
          else receivables["90+"] += invoice.total;
        }
      }
    }

    const collectionRate = collectibleThisQuarter > 0
      ? Math.round((paidThisQuarter / collectibleThisQuarter) * 100)
      : 100;

    const revenueDelta = previousMonthRevenue > 0
      ? `${Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)}%`
      : currentMonthRevenue > 0
        ? "nieuw"
        : "0%";

    const topClients = Array.from(clientTotals.entries())
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([name, value]) => ({ name, ...value }));

    const largestMonthValue = Math.max(
      1,
      ...Array.from(monthlySeries.values()).flatMap((item) => [item.invoiced, item.collected]),
    );

    const unbilledByClient = unbilledOrders.reduce<Record<string, number>>((acc, order) => {
      const key = order.client_name || "Onbekende klant";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    const unbilledHotspots = Object.entries(unbilledByClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    const alerts = [
      unbilledOrders.length > 0 ? {
        title: `${unbilledOrders.length} leveringen wachten op facturatie`,
        body: "Zet deze orders direct door naar conceptfacturen om cash sneller vrij te maken.",
        tone: "gold",
      } : null,
      overdueAmount > 0 ? {
        title: `${formatCurrency(overdueAmount)} is vervallen`,
        body: "Deze openstaande post verdient een herinnering of opvolging vanuit finance.",
        tone: "red",
      } : null,
      conceptCount > 0 ? {
        title: `${conceptCount} conceptfacturen staan nog open`,
        body: "Controleer of deze ritten klaar zijn om verzonden te worden.",
        tone: "sky",
      } : null,
    ].filter(Boolean) as Array<{ title: string; body: string; tone: "gold" | "red" | "sky" }>;

    return {
      invoices,
      unbilledOrders,
      currentMonthRevenue,
      openAmount,
      overdueAmount,
      conceptAmount,
      conceptCount,
      collectionRate,
      revenueDelta,
      topClients,
      overdueInvoices: overdueInvoices.slice(0, 8),
      monthlySeries: Array.from(monthlySeries.values()),
      largestMonthValue,
      receivables,
      alerts,
      unbilledHotspots,
    };
  }, [data]);

  if (isLoading) {
    return <LoadingState message="Finance cockpit laden..." />;
  }

  if (isError || !finance) {
    return <QueryError message="Kan finance-overzicht niet laden. Probeer het opnieuw." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Finance"
        subtitle="Omzet, openstaand en facturatie in een cockpit die past bij je operatie."
        actions={(
          <>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/8 hover:text-white"
              onClick={() => navigate("/rapportage")}
            >
              Rapportage
            </Button>
            <Button
              type="button"
              className="h-10 rounded-xl px-4"
              onClick={() => navigate("/facturatie")}
            >
              Open facturatie
            </Button>
          </>
        )}
      />

      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card--luxe relative overflow-hidden p-5"
      >
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-70"
          style={{
            background:
              "radial-gradient(circle at top right, hsl(var(--gold) / 0.18), transparent 55%)",
          }}
        />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]"
              style={{ borderColor: "hsl(var(--gold) / 0.18)", background: "hsl(var(--gold-soft) / 0.18)" }}>
              <Sparkles className="h-3.5 w-3.5" />
              Finance cockpit
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Van rit naar cash, zonder dat je door losse schermen hoeft te jagen.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Deze laag zet je openstaand, concepten en nog te factureren leveringen direct in dezelfde luxe operationele flow als de rest van je app.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {[
              {
                label: "Cash discipline",
                value: `${finance.collectionRate}%`,
                icon: CheckCircle2,
              },
              {
                label: "Wacht op factuur",
                value: `${finance.unbilledOrders.length}`,
                icon: FileClock,
              },
              {
                label: "Vervallen post",
                value: formatCurrency(finance.overdueAmount),
                icon: AlertTriangle,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border p-3"
                style={{
                  borderColor: "hsl(var(--gold) / 0.14)",
                  background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.14) 100%)",
                }}
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: "hsl(var(--gold-soft) / 0.36)" }}>
                  <item.icon className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                </div>
                <p className="text-lg font-semibold tabular-nums" style={{ fontFamily: "var(--font-display)" }}>{item.value}</p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      <KPIStrip
        columns={6}
        items={[
          {
            label: "Omzet deze maand",
            value: formatCurrency(finance.currentMonthRevenue),
            icon: Euro,
            trend: {
              value: finance.revenueDelta,
              direction: finance.revenueDelta.startsWith("-") ? "down" : "up",
            },
          },
          {
            label: "Openstaand",
            value: formatCurrency(finance.openAmount),
            icon: Wallet,
          },
          {
            label: "Nog te factureren",
            value: finance.unbilledOrders.length,
            icon: FileClock,
          },
          {
            label: "Vervallen",
            value: formatCurrency(finance.overdueAmount),
            icon: AlertTriangle,
          },
          {
            label: "Conceptfacturen",
            value: finance.conceptCount,
            icon: Receipt,
          },
          {
            label: "Betaalratio",
            value: `${finance.collectionRate}%`,
            icon: CheckCircle2,
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card--luxe p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Financiele trend
              </p>
              <h3 className="mt-1 text-sm font-semibold text-foreground">Gefactureerd versus opgehaald</h3>
            </div>
            <span className="rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground"
              style={{ borderColor: "hsl(var(--gold) / 0.14)", background: "hsl(var(--gold-soft) / 0.12)" }}>
              laatste 6 maanden
            </span>
          </div>

          <div className="space-y-3">
            {finance.monthlySeries.map((month) => (
              <div key={month.key} className="grid gap-2 sm:grid-cols-[56px_1fr_auto] sm:items-center">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">{month.label}</p>
                <div className="space-y-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Gefactureerd</span>
                      <span className="tabular-nums text-foreground">{formatCurrency(month.invoiced)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/6">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          width: `${Math.max(6, (month.invoiced / finance.largestMonthValue) * 100)}%`,
                          background: "linear-gradient(90deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Opgehaald</span>
                      <span className="tabular-nums text-foreground">{formatCurrency(month.collected)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/6">
                      <div
                        className="h-2 rounded-full bg-emerald-400/80"
                        style={{
                          width: `${Math.max(6, (month.collected / finance.largestMonthValue) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">ratio</p>
                  <p className="text-sm font-semibold tabular-nums text-foreground">
                    {month.invoiced > 0 ? `${Math.round((month.collected / month.invoiced) * 100)}%` : "0%"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="card--luxe p-5"
        >
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl"
              style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)) 0%, hsl(var(--gold) / 0.3) 100%)" }}>
              <Sparkles className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Alerts & acties
              </p>
              <h3 className="text-sm font-semibold text-foreground">Waar finance nu op lekt</h3>
            </div>
          </div>

          <div className="space-y-3">
            {finance.alerts.map((alert) => (
              <div
                key={alert.title}
                className={cn(
                  "rounded-2xl border p-3",
                  alert.tone === "red" && "border-red-400/20 bg-red-500/6",
                  alert.tone === "sky" && "border-sky-400/20 bg-sky-500/6",
                  alert.tone === "gold" && "border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.12)]",
                )}
              >
                <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{alert.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid gap-2">
            <Button type="button" className="justify-between rounded-xl" onClick={() => navigate("/facturatie")}>
              Open facturatie
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="justify-between rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/8 hover:text-white"
              onClick={() => navigate("/orders")}
            >
              Bekijk orders klaar voor factuur
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>

          {finance.unbilledHotspots.length > 0 && (
            <div className="mt-5 rounded-2xl border p-3"
              style={{ borderColor: "hsl(var(--gold) / 0.14)", background: "hsl(var(--gold-soft) / 0.08)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                Hotspots
              </p>
              <div className="mt-3 space-y-2">
                {finance.unbilledHotspots.map(([client, count]) => (
                  <div key={client} className="flex items-center justify-between gap-3 rounded-xl bg-white/4 px-3 py-2">
                    <span className="truncate text-sm text-foreground">{client}</span>
                    <span className="text-xs font-semibold text-muted-foreground">{count} wachtend</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList
          className="h-auto w-full justify-start gap-1 rounded-2xl border bg-[hsl(222_24%_12%)] p-1 text-white/56"
          style={{ borderColor: "hsl(var(--gold) / 0.12)" }}
        >
          {[
            ["overview", "Overzicht"],
            ["invoices", "Facturen"],
            ["unbilled", "Nog te factureren"],
            ["receivables", "Debiteuren"],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              className="rounded-xl px-4 py-2 text-sm data-[state=active]:bg-[hsl(var(--gold-soft)/0.16)] data-[state=active]:text-white data-[state=active]:shadow-none"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card--luxe p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: "hsl(var(--gold-soft) / 0.35)" }}>
                  <Building2 className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                    Klanten
                  </p>
                  <h3 className="text-sm font-semibold text-foreground">Top omzetdragers</h3>
                </div>
              </div>

              <div className="space-y-3">
                {finance.topClients.map((client, index) => (
                  <div key={client.name} className="flex items-center gap-3 rounded-2xl border px-3 py-3"
                    style={{ borderColor: "hsl(var(--gold) / 0.12)", background: "hsl(var(--gold-soft) / 0.08)" }}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-[hsl(var(--gold-deep))]"
                      style={{ background: "hsl(var(--gold-soft) / 0.32)" }}>
                      0{index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
                      <p className="text-xs text-muted-foreground">{client.invoices} facturen in beeld</p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(client.revenue)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="card--luxe p-5">
              <div className="mb-4 flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{ background: "hsl(var(--gold-soft) / 0.35)" }}>
                  <Clock3 className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                    Openstaand
                  </p>
                  <h3 className="text-sm font-semibold text-foreground">Aging en opvolging</h3>
                </div>
              </div>

              <div className="space-y-3">
                {bucketLabels.map((bucket) => (
                  <div key={bucket} className="rounded-2xl border px-3 py-3"
                    style={{ borderColor: "hsl(var(--gold) / 0.12)", background: "hsl(var(--gold-soft) / 0.08)" }}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{bucket} dagen</span>
                      <span className="text-sm font-semibold tabular-nums text-foreground">{formatCurrency(finance.receivables[bucket])}</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/6">
                      <div
                        className="h-2 rounded-full bg-[hsl(var(--gold-deep))]"
                        style={{
                          width: `${finance.overdueAmount > 0 ? Math.max(5, (finance.receivables[bucket] / finance.overdueAmount) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          <section className="card--luxe overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "hsl(var(--gold) / 0.12)" }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                  Facturen
                </p>
                <h3 className="text-sm font-semibold text-foreground">Laatste factuurstroom</h3>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/facturatie")}>
                Volledige lijst
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead>Factuur</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                  <TableHead className="text-right">Bedrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finance.invoices.slice(0, 8).map((invoice) => {
                  const tone = isInvoiceOverdue(invoice, new Date()) ? "overdue" : invoice.status;
                  return (
                    <TableRow
                      key={invoice.id}
                      className="cursor-pointer border-white/6 hover:bg-white/4"
                      onClick={() => navigate(`/facturatie/${invoice.id}`)}
                    >
                      <TableCell className="font-mono text-sm text-foreground">{invoice.invoice_number}</TableCell>
                      <TableCell>{invoice.client_name}</TableCell>
                      <TableCell>{formatDate(invoice.invoice_date)}</TableCell>
                      <TableCell>{formatDate(invoice.due_date)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(invoice.total)}</TableCell>
                      <TableCell>
                        <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", statusTone[tone])}>
                          {statusLabel[tone]}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="unbilled" className="mt-0">
          <section className="card--luxe overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "hsl(var(--gold) / 0.12)" }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                  Nog te factureren
                </p>
                <h3 className="text-sm font-semibold text-foreground">Afgeleverde orders zonder factuur</h3>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/orders")}>
                Open orders
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead>Order</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Bijgewerkt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finance.unbilledOrders.length > 0 ? finance.unbilledOrders.slice(0, 10).map((order) => (
                  <TableRow
                    key={order.id}
                    className="cursor-pointer border-white/6 hover:bg-white/4"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <TableCell className="font-mono text-sm text-foreground">#{order.order_number ?? "?"}</TableCell>
                    <TableCell>{order.client_name ?? "Onbekend"}</TableCell>
                    <TableCell className="max-w-[340px] truncate text-muted-foreground">
                      {(order.pickup_address?.split(",")[0] ?? "?")} naar {(order.delivery_address?.split(",")[0] ?? "?")}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex rounded-full border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.12)] px-2.5 py-1 text-xs font-medium text-foreground">
                        {order.billing_status ?? order.status ?? "Afgeleverd"}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(order.updated_at)}</TableCell>
                  </TableRow>
                )) : (
                  <TableRow className="border-white/6 hover:bg-transparent">
                    <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                      Geen afgeleverde orders zonder factuur gevonden.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>

        <TabsContent value="receivables" className="mt-0">
          <section className="card--luxe overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "hsl(var(--gold) / 0.12)" }}>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
                  Debiteuren
                </p>
                <h3 className="text-sm font-semibold text-foreground">Facturen die opvolging vragen</h3>
              </div>
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => navigate("/facturatie")}>
                Naar finance werktafel
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-white/8 hover:bg-transparent">
                  <TableHead>Factuur</TableHead>
                  <TableHead>Klant</TableHead>
                  <TableHead>Vervaldatum</TableHead>
                  <TableHead className="text-right">Openstaand</TableHead>
                  <TableHead>Actie</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {finance.overdueInvoices.length > 0 ? finance.overdueInvoices.map((invoice) => (
                  <TableRow
                    key={invoice.id}
                    className="cursor-pointer border-white/6 hover:bg-white/4"
                    onClick={() => navigate(`/facturatie/${invoice.id}`)}
                  >
                    <TableCell className="font-mono text-sm text-foreground">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.client_name}</TableCell>
                    <TableCell>{formatDate(invoice.due_date)}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-red-300">{formatCurrency(invoice.total)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-400/20 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-300">
                        <SendHorizonal className="h-3.5 w-3.5" />
                        Herinnering klaarzetten
                      </span>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow className="border-white/6 hover:bg-transparent">
                    <TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                      Geen vervallen facturen. Je debiteuren staan er gezond voor.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Finance;
