import { useParams, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { ArrowLeft, FileDown, Send, CheckCircle, AlertTriangle, Receipt, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useInvoiceById, useUpdateInvoiceStatus } from "@/hooks/useInvoices";
import { downloadInvoicePDF } from "@/lib/invoiceUtils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
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

const statusStyles: Record<string, { bg: string; text: string; label: string }> = {
  concept: { bg: "bg-muted", text: "text-muted-foreground", label: "Concept" },
  verzonden: { bg: "bg-blue-100", text: "text-blue-700", label: "Verzonden" },
  betaald: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Betaald" },
  vervallen: { bg: "bg-red-100", text: "text-red-700", label: "Vervallen" },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function FacturatieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: invoice, isLoading, isError } = useInvoiceById(id ?? null);
  const updateStatus = useUpdateInvoiceStatus();
  const [confirmAction, setConfirmAction] = useState<{ status: string; label: string } | null>(null);

  const isOverdue = useMemo(() => {
    if (!invoice?.due_date || invoice.status !== "verzonden") return false;
    return new Date(invoice.due_date) < new Date();
  }, [invoice]);

  const effectiveStatus = isOverdue ? "vervallen" : (invoice?.status ?? "concept");
  const style = statusStyles[effectiveStatus] || statusStyles.concept;

  const handleStatusChange = async (newStatus: string) => {
    if (!invoice) return;
    try {
      await updateStatus.mutateAsync({ id: invoice.id, status: newStatus });
      toast.success(`Factuur ${statusStyles[newStatus]?.label || newStatus}`);
      setConfirmAction(null);
    } catch (e: any) {
      toast.error("Status wijzigen mislukt", { description: e.message });
    }
  };

  const handleDownloadPDF = () => {
    if (!invoice) return;
    try {
      downloadInvoicePDF(invoice);
      toast.success("PDF wordt gedownload");
    } catch (e: any) {
      toast.error("PDF generatie mislukt", { description: e.message });
    }
  };

  if (isLoading) return <LoadingState message="Factuur laden..." />;
  if (isError || !invoice) {
    return (
      <EmptyState
        icon={Receipt}
        title="Factuur niet gevonden"
        description="Deze factuur bestaat niet of je hebt geen toegang."
        action={<Button variant="outline" onClick={() => navigate("/facturatie")}>Terug naar overzicht</Button>}
      />
    );
  }

  const lines = invoice.invoice_lines ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title={`Factuur ${invoice.invoice_number}`}
        subtitle={`${invoice.client_name} — ${formatDate(invoice.invoice_date)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/facturatie")} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Terug
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF} className="gap-1.5">
              <FileDown className="h-4 w-4" /> PDF
            </Button>
          </div>
        }
      />

      {/* Status + Acties */}
      <div className="bg-card rounded-xl border border-border/40 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className={cn("px-3 py-1 rounded-lg text-sm font-medium", style.bg, style.text)}>
              {style.label}
            </span>
            {isOverdue && (
              <span className="flex items-center gap-1 text-sm text-red-600 font-medium">
                <AlertTriangle className="h-4 w-4" /> Vervallen
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {effectiveStatus === "concept" && (
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                onClick={() => setConfirmAction({ status: "verzonden", label: "verzonden" })}>
                <Send className="h-3.5 w-3.5" /> Markeer als verzonden
              </Button>
            )}
            {(effectiveStatus === "verzonden" || effectiveStatus === "vervallen") && (
              <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleStatusChange("betaald")}>
                <CheckCircle className="h-3.5 w-3.5" /> Markeer als betaald
              </Button>
            )}
            {effectiveStatus === "verzonden" && (
              <Button size="sm" variant="destructive" className="gap-1.5"
                onClick={() => handleStatusChange("vervallen")}>
                Markeer als vervallen
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Klant + factuurinfo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card rounded-xl border border-border/40 p-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Klant</h3>
          <p className="text-lg font-semibold">{invoice.client_name}</p>
          {invoice.client_address && <p className="text-sm text-muted-foreground">{invoice.client_address}</p>}
          {invoice.client_btw_number && <p className="text-sm text-muted-foreground">BTW: {invoice.client_btw_number}</p>}
          {invoice.client_kvk_number && <p className="text-sm text-muted-foreground">KVK: {invoice.client_kvk_number}</p>}
        </div>
        <div className="bg-card rounded-xl border border-border/40 p-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Factuurgegevens</h3>
          <div className="grid grid-cols-2 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Factuurnummer</span>
            <span className="font-mono font-medium">{invoice.invoice_number}</span>
            <span className="text-muted-foreground">Factuurdatum</span>
            <span>{formatDate(invoice.invoice_date)}</span>
            <span className="text-muted-foreground">Vervaldatum</span>
            <span className={isOverdue ? "text-red-600 font-medium" : ""}>
              {invoice.due_date ? formatDate(invoice.due_date) : "—"}
            </span>
            <span className="text-muted-foreground">BTW percentage</span>
            <span>{invoice.btw_percentage}%</span>
          </div>
        </div>
      </div>

      {/* Factuurregels */}
      <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-border/30">
          <h3 className="text-sm font-semibold">Factuurregels</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30 bg-muted/30">
              <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Omschrijving</th>
              <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Aantal</th>
              <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Eenheid</th>
              <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Prijs</th>
              <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Totaal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Geen factuurregels
                </td>
              </tr>
            ) : (
              lines.map((line: any, idx: number) => (
                <tr key={line.id || idx} className="hover:bg-muted/10">
                  <td className="px-5 py-2.5 text-sm">{line.description}</td>
                  <td className="px-5 py-2.5 text-sm text-right tabular-nums">{line.quantity}</td>
                  <td className="px-5 py-2.5 text-sm text-muted-foreground">{line.unit}</td>
                  <td className="px-5 py-2.5 text-sm text-right tabular-nums">{formatCurrency(line.unit_price)}</td>
                  <td className="px-5 py-2.5 text-sm text-right tabular-nums font-medium">{formatCurrency(line.total)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Totalen */}
        <div className="border-t border-border/30 px-5 py-4">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-between w-48 text-sm">
              <span className="text-muted-foreground">Subtotaal</span>
              <span className="tabular-nums">{formatCurrency(invoice.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between w-48 text-sm">
              <span className="text-muted-foreground">BTW ({invoice.btw_percentage}%)</span>
              <span className="tabular-nums">{formatCurrency(invoice.btw_amount)}</span>
            </div>
            <div className="flex items-center justify-between w-48 text-base font-semibold pt-1 border-t border-border/30 mt-1">
              <span>Totaal</span>
              <span className="tabular-nums">{formatCurrency(invoice.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notities */}
      {invoice.notes && (
        <div className="bg-card rounded-xl border border-border/40 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Notities</h3>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
        </div>
      )}

      {/* Bevestigingsdialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Factuur als verzonden markeren?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit betekent dat de factuur naar de klant is verstuurd. Deze actie kan niet ongedaan worden gemaakt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmAction && handleStatusChange(confirmAction.status)}>
              Bevestigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
