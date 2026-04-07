import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentPortalUser } from "@/hooks/useClientPortalUsers";

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total: number;
  btw_amount: number;
  invoice_date: string;
  due_date: string | null;
  pdf_url: string | null;
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Concept",
  SENT: "Verzonden",
  PAID: "Betaald",
  OVERDUE: "Te laat",
  CANCELLED: "Geannuleerd",
};

const INVOICE_STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-emerald-100 text-emerald-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function PortalInvoicing() {
  const { data: portalUser } = useCurrentPortalUser();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!portalUser?.client_id) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("invoices" as any)
        .select("*")
        .eq("client_id", portalUser.client_id)
        .order("invoice_date", { ascending: false });

      if (!error) setInvoices((data ?? []) as Invoice[]);
      setLoading(false);
    };

    load();
  }, [portalUser?.client_id]);

  const totalOutstanding = invoices
    .filter((i) => i.status === "SENT" || i.status === "OVERDUE")
    .reduce((sum, i) => sum + (i.total ?? 0), 0);

  const totalPaid = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + (i.total ?? 0), 0);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Facturatie</h1>
        <p className="text-gray-500 mt-1">Bekijk en download uw facturen</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Openstaand</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalOutstanding)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Betaald (totaal)</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-gray-500">Aantal facturen</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{invoices.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoices list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12">
              <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nog geen facturen</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-gray-900">
                        {invoice.invoice_number}
                      </span>
                      <Badge
                        className={cn(
                          "text-[11px] border-0 rounded-full",
                          INVOICE_STATUS_COLORS[invoice.status] ?? "bg-gray-100 text-gray-600"
                        )}
                      >
                        {INVOICE_STATUS_LABELS[invoice.status] ?? invoice.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500">
                      Datum: {new Date(invoice.invoice_date).toLocaleDateString("nl-NL")}
                      {invoice.due_date && ` | Vervaldatum: ${new Date(invoice.due_date).toLocaleDateString("nl-NL")}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(invoice.total)}
                    </p>
                    <p className="text-xs text-gray-400">
                      incl. {formatCurrency(invoice.btw_amount)} BTW
                    </p>
                  </div>
                  {invoice.pdf_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(invoice.pdf_url!, "_blank")}
                      className="gap-1.5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PDF
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
