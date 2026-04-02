import { useState, useMemo } from "react";
import { Receipt, Search, Plus, Eye, Download, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useInvoices } from "@/hooks/useInvoices";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

interface Invoice {
  id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  btw_percentage: number;
  btw_amount: number;
  total: number;
  notes: string | null;
  pdf_url: string | null;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  concept: "bg-muted text-muted-foreground border-border",
  verzonden: "bg-blue-500/8 text-blue-700 border-blue-200/60",
  betaald: "bg-emerald-500/8 text-emerald-700 border-emerald-200/60",
  vervallen: "bg-red-500/8 text-red-700 border-red-200/60",
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const { data: invoices = [], isLoading, isError, refetch } = useInvoices();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Auto invoice suggestions: delivered orders without invoice
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
    return (invoices as Invoice[]).filter((inv) => {
      const matchesSearch =
        inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
        inv.client_name.toLowerCase().includes(search.toLowerCase());

      let effectiveStatus = inv.status;
      if (isOverdue(inv.due_date, inv.status)) {
        effectiveStatus = "vervallen";
      }

      const matchesStatus =
        statusFilter === "alle" || effectiveStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const stats = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totaalOpenstaand = 0;
    let dezeMaandGefactureerd = 0;
    let betaaldDezeMaand = 0;
    let vervallenCount = 0;

    (invoices as Invoice[]).forEach((inv) => {
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

      if (isThisMonth && (inv.status === "verzonden" || inv.status === "betaald")) {
        dezeMaandGefactureerd += inv.total;
      }

      if (inv.status === "betaald" && isThisMonth) {
        betaaldDezeMaand += inv.total;
      }
    });

    return { totaalOpenstaand, dezeMaandGefactureerd, betaaldDezeMaand, vervallenCount };
  }, [invoices]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-sm font-semibold text-foreground mb-1">Kan gegevens niet laden</p>
        <p className="text-xs text-muted-foreground mb-3">Controleer je verbinding</p>
        <button onClick={() => refetch()} className="text-xs text-primary hover:underline">Opnieuw proberen</button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground font-display">
            Facturatie
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {invoices.length} facturen in totaal
          </p>
        </div>
        <Button className="gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm h-10 px-5"
          onClick={() => toast({ title: "Nieuwe factuur", description: "Selecteer eerst een afgeleverde order om een factuur aan te maken." })}>
          <Plus className="h-4 w-4" /> Nieuwe factuur
        </Button>
      </div>

      {/* Auto invoice suggestions */}
      {uninvoicedOrders.length > 0 && (
        <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">{uninvoicedOrders.length} afgeleverde orders zonder factuur</p>
              <p className="text-xs text-green-600 mt-0.5">Deze orders zijn afgeleverd en kunnen gefactureerd worden.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                {uninvoicedOrders.slice(0, 5).map((order: any) => (
                  <Link key={order.id} to={`/orders/${order.id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-white border border-green-200 rounded-lg px-2.5 py-1.5 hover:border-green-400 transition-colors">
                    #{order.order_number} — {order.client_name}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Totaal openstaand",
            value: formatCurrency(stats.totaalOpenstaand),
            icon: Receipt,
            color: "text-blue-600",
            bg: "bg-blue-500/8",
          },
          {
            label: "Deze maand gefactureerd",
            value: formatCurrency(stats.dezeMaandGefactureerd),
            icon: Receipt,
            color: "text-primary",
            bg: "bg-primary/8",
          },
          {
            label: "Betaald deze maand",
            value: formatCurrency(stats.betaaldDezeMaand),
            icon: Receipt,
            color: "text-emerald-600",
            bg: "bg-emerald-500/8",
          },
          {
            label: "Vervallen",
            value: String(stats.vervallenCount),
            icon: Receipt,
            color: "text-red-600",
            bg: "bg-red-500/8",
          },
        ].map((stat) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card rounded-xl border border-border/40 p-4 flex items-center gap-3"
          >
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                stat.bg
              )}
            >
              <stat.icon className={cn("h-4.5 w-4.5", stat.color)} />
            </div>
            <div>
              <p className="text-xl font-semibold font-display tabular-nums">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            placeholder="Zoek op factuurnummer of klant..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-4 rounded-xl border border-border/50 bg-card text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40 transition-all"
          />
        </div>
        <div className="flex rounded-xl border border-border/50 bg-card p-1 gap-0.5 overflow-x-auto max-w-full">
          {filterOptions.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 whitespace-nowrap",
                statusFilter === s
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "alle" ? "Alle" : statusLabels[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table Card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-xl shadow-sm border border-border/40 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40 bg-muted/30">
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Factuurnummer
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Klant
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden md:table-cell">
                  Datum
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60 hidden md:table-cell">
                  Vervaldatum
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Bedrag
                </th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Status
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              <AnimatePresence mode="popLayout">
                {filtered.map((invoice, idx) => {
                  const overdue = isOverdue(invoice.due_date, invoice.status);
                  const effectiveStatus = overdue ? "vervallen" : invoice.status;

                  return (
                    <motion.tr
                      key={invoice.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => navigate(`/facturatie/${invoice.id}`)}
                      className="hover:bg-muted/20 transition-colors duration-100 group cursor-pointer"
                    >
                      <td className="px-4 py-2">
                        <span className="font-mono text-sm font-medium text-foreground flex items-center gap-1.5">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              statusDotColors[effectiveStatus]
                            )}
                          />
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
                          overdue
                            ? "text-red-600 font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {invoice.due_date ? formatDate(invoice.due_date) : "—"}
                      </td>
                      <td className="px-4 py-2 text-sm text-foreground/80 text-right tabular-nums font-medium">
                        {formatCurrency(invoice.total)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
                            statusStyles[effectiveStatus]
                          )}
                        >
                          <span
                            className={cn(
                              "h-1 w-1 rounded-full",
                              statusDotColors[effectiveStatus]
                            )}
                          />
                          {statusLabels[effectiveStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/facturatie/${invoice.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-md hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Link>
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
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center">
                    <Receipt className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      Geen facturen gevonden
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/30 bg-muted/20">
          <p className="text-xs text-muted-foreground">
            {filtered.length} van {invoices.length} facturen
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            Totaal: {formatCurrency(filtered.reduce((s, inv) => s + inv.total, 0))}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Facturatie;
