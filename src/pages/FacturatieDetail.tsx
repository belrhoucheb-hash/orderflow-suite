import { useParams, useNavigate } from "react-router-dom";
import { useMemo, useState, useCallback } from "react";
import { ArrowLeft, FileDown, Send, CheckCircle, AlertTriangle, Receipt, Loader2, Plus, Trash2, Save, Pencil, Calculator, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/PageHeader";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { useInvoiceById, useUpdateInvoiceStatus, useUpdateInvoiceLines, type InvoiceLine } from "@/hooks/useInvoices";
import { downloadInvoicePDF } from "@/lib/invoiceUtils";
import { useTenant } from "@/contexts/TenantContext";
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
  verzonden: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400", label: "Verzonden" },
  betaald: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400", label: "Betaald" },
  vervallen: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400", label: "Vervallen" },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Editable line type for local state (may have temporary IDs for new lines)
interface EditableLine {
  id: string;
  invoice_id: string;
  order_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  sort_order: number;
}

export default function FacturatieDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: invoice, isLoading, isError } = useInvoiceById(id ?? null);
  const { tenant } = useTenant();
  const updateStatus = useUpdateInvoiceStatus();
  const updateLines = useUpdateInvoiceLines();
  const [confirmAction, setConfirmAction] = useState<{ status: string; label: string } | null>(null);
  const [snelstartRetrying, setSnelstartRetrying] = useState(false);
  const queryClient = useQueryClient();
  const retrySnelstart = async () => {
    if (!invoice) return;
    setSnelstartRetrying(true);
    try {
      const { error } = await supabase.functions.invoke("snelstart-sync", {
        body: { invoice_id: invoice.id },
      });
      if (error) throw new Error(error.message);
      toast.success("Sync naar Snelstart gestart");
      queryClient.invalidateQueries({ queryKey: ["invoices", invoice.id] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Sync mislukt", { description: msg });
    } finally {
      setSnelstartRetrying(false);
    }
  };

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editableLines, setEditableLines] = useState<EditableLine[]>([]);
  const [editingCellId, setEditingCellId] = useState<string | null>(null);

  const isOverdue = useMemo(() => {
    if (!invoice?.due_date || invoice.status !== "verzonden") return false;
    return new Date(invoice.due_date) < new Date();
  }, [invoice]);

  const effectiveStatus = isOverdue ? "vervallen" : (invoice?.status ?? "concept");
  const style = statusStyles[effectiveStatus] || statusStyles.concept;
  const isConcept = invoice?.status === "concept";

  // Calculate totals from editable lines
  const editTotals = useMemo(() => {
    if (!isEditing || !invoice) return null;
    const subtotal = editableLines.reduce((sum, l) => sum + l.total, 0);
    const btwAmount = Math.round(subtotal * (invoice.btw_percentage / 100) * 100) / 100;
    const total = Math.round((subtotal + btwAmount) * 100) / 100;
    return { subtotal, btwAmount, total };
  }, [editableLines, isEditing, invoice]);

  const startEditing = useCallback(() => {
    if (!invoice) return;
    const lines = (invoice.invoice_lines ?? []).map((l: any) => ({
      id: l.id,
      invoice_id: l.invoice_id,
      order_id: l.order_id,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unit_price: l.unit_price,
      total: l.total,
      sort_order: l.sort_order,
    }));
    setEditableLines(lines);
    setIsEditing(true);
    setEditingCellId(null);
  }, [invoice]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditableLines([]);
    setEditingCellId(null);
  }, []);

  const updateLine = useCallback((lineId: string, field: keyof EditableLine, value: string | number) => {
    setEditableLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        const updated = { ...line, [field]: value };
        // Recalculate line total when quantity or unit_price changes
        if (field === "quantity" || field === "unit_price") {
          updated.total = Math.round(updated.quantity * updated.unit_price * 100) / 100;
        }
        return updated;
      })
    );
  }, []);

  const addNewLine = useCallback(() => {
    if (!invoice) return;
    const newLine: EditableLine = {
      id: `new-${Date.now()}`,
      invoice_id: invoice.id,
      order_id: null,
      description: "",
      quantity: 1,
      unit: "stuk",
      unit_price: 0,
      total: 0,
      sort_order: editableLines.length,
    };
    setEditableLines((prev) => [...prev, newLine]);
    // Auto-focus the new line description
    setEditingCellId(`${newLine.id}-description`);
  }, [invoice, editableLines.length]);

  const deleteLine = useCallback((lineId: string) => {
    setEditableLines((prev) => prev.filter((l) => l.id !== lineId));
  }, []);

  const saveChanges = useCallback(async () => {
    if (!invoice) return;
    try {
      await updateLines.mutateAsync({
        invoiceId: invoice.id,
        lines: editableLines.map((l) => ({
          id: l.id,
          invoice_id: l.invoice_id,
          order_id: l.order_id,
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unit_price: l.unit_price,
          total: l.total,
          sort_order: l.sort_order,
        })),
        btw_percentage: invoice.btw_percentage,
      });
      toast.success("Factuurregels opgeslagen");
      setIsEditing(false);
      setEditableLines([]);
      setEditingCellId(null);
    } catch (e: any) {
      toast.error("Opslaan mislukt", { description: e.message });
    }
  }, [invoice, editableLines, updateLines]);

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

  const handleDownloadPDF = async () => {
    if (!invoice) return;
    try {
      await downloadInvoicePDF(invoice, { templateUrl: tenant?.invoiceTemplateUrl });
      toast.success(
        tenant?.invoiceTemplateUrl
          ? "PDF wordt gedownload met tenant-sjabloon"
          : "PDF wordt gedownload"
      );
    } catch (e: any) {
      toast.error("PDF generatie mislukt", { description: e.message });
    }
  };

  if (isLoading) return <LoadingState message="Factuur laden..." />;
  if (isError) {
    return (
      <EmptyState
        icon={Receipt}
        title="Fout bij laden"
        description="Er ging iets mis bij het ophalen van de factuur. Probeer het opnieuw."
        action={<Button variant="outline" onClick={() => navigate("/facturatie")}>Terug naar overzicht</Button>}
      />
    );
  }
  if (!invoice) {
    return (
      <EmptyState
        icon={Receipt}
        title="Factuur niet gevonden"
        description={`Factuur met ID "${id}" bestaat niet of je hebt geen toegang.`}
        action={<Button variant="outline" onClick={() => navigate("/facturatie")}>Terug naar overzicht</Button>}
      />
    );
  }

  const lines = invoice.invoice_lines ?? [];
  const displayLines = isEditing ? editableLines : lines;
  const displaySubtotal = isEditing ? (editTotals?.subtotal ?? 0) : invoice.subtotal;
  const displayBtwAmount = isEditing ? (editTotals?.btwAmount ?? 0) : invoice.btw_amount;
  const displayTotal = isEditing ? (editTotals?.total ?? 0) : invoice.total;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        eyebrow="Facturatie"
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
          <div className="flex items-center gap-3 flex-wrap">
            <span className={cn("px-3 py-1 rounded-lg text-sm font-medium", style.bg, style.text)}>
              {style.label}
            </span>
            {isOverdue && (
              <span className="flex items-center gap-1 text-sm text-red-600 font-medium">
                <AlertTriangle className="h-4 w-4" /> Vervallen
              </span>
            )}
            {(() => {
              const st = (invoice as any).snelstart_status as
                | "niet_geboekt" | "bezig" | "geboekt" | "fout" | undefined;
              if (!st || st === "niet_geboekt") return null;
              const snelstartLabel: Record<string, { bg: string; text: string; label: string }> = {
                bezig:   { bg: "bg-amber-100",   text: "text-amber-800",   label: "Snelstart: bezig" },
                geboekt: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Snelstart: geboekt" },
                fout:    { bg: "bg-red-100",     text: "text-red-800",     label: "Snelstart: fout" },
              };
              const s = snelstartLabel[st];
              const errorText = (invoice as any).snelstart_error as string | null;
              const boekingId = (invoice as any).snelstart_boeking_id as string | null;
              const badge = (
                <span className={cn("flex items-center gap-1 px-3 py-1 rounded-lg text-sm font-medium", s.bg, s.text)}>
                  <Calculator className="h-3.5 w-3.5" />
                  {s.label}
                  {boekingId && st === "geboekt" && (
                    <span className="ml-1 font-mono text-xs opacity-75">#{boekingId}</span>
                  )}
                </span>
              );
              return (
                <div className="flex items-center gap-2">
                  {st === "fout" && errorText ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild><div>{badge}</div></TooltipTrigger>
                        <TooltipContent className="max-w-xs">{errorText}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : badge}
                  {st === "fout" && (
                    <Button size="sm" variant="outline" className="gap-1.5"
                      onClick={retrySnelstart} disabled={snelstartRetrying}>
                      <RefreshCw className={cn("h-3.5 w-3.5", snelstartRetrying && "animate-spin")} />
                      Opnieuw proberen
                    </Button>
                  )}
                </div>
              );
            })()}
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
        <div className="px-5 py-3 border-b border-border/30 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Factuurregels</h3>
          {isConcept && !isEditing && (
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5">
              <Pencil className="h-3.5 w-3.5" /> Bewerken
            </Button>
          )}
          {isEditing && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={addNewLine} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Regel toevoegen
              </Button>
              <Button variant="outline" size="sm" onClick={cancelEditing}>
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={saveChanges}
                disabled={updateLines.isPending}
                className="gap-1.5 bg-primary hover:bg-primary/90"
              >
                {updateLines.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Opslaan
              </Button>
            </div>
          )}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border/30 bg-muted/30">
              <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Omschrijving</th>
              <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-24">Aantal</th>
              <th className="px-5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-24">Eenheid</th>
              <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-28">Prijs</th>
              <th className="px-5 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-28">Totaal</th>
              {isEditing && (
                <th className="px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-12"></th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/20">
            {displayLines.length === 0 ? (
              <tr>
                <td colSpan={isEditing ? 6 : 5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  {isEditing ? "Nog geen regels. Klik op \"Regel toevoegen\" om te beginnen." : "Geen factuurregels"}
                </td>
              </tr>
            ) : (
              displayLines.map((line: any, idx: number) => {
                if (isEditing) {
                  return (
                    <tr key={line.id || idx} className="hover:bg-muted/10">
                      <td className="px-5 py-1.5">
                        {editingCellId === `${line.id}-description` ? (
                          <Input
                            autoFocus
                            value={line.description}
                            onChange={(e) => updateLine(line.id, "description", e.target.value)}
                            onBlur={() => setEditingCellId(null)}
                            onKeyDown={(e) => e.key === "Enter" && setEditingCellId(null)}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <button
                            className="w-full text-left text-sm py-1 px-2 -mx-2 rounded hover:bg-muted/40 transition-colors min-h-[32px] truncate"
                            onClick={() => setEditingCellId(`${line.id}-description`)}
                          >
                            {line.description || <span className="text-muted-foreground/40 italic">Klik om in te vullen...</span>}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-1.5">
                        {editingCellId === `${line.id}-quantity` ? (
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, "quantity", parseFloat(e.target.value) || 0)}
                            onBlur={() => setEditingCellId(null)}
                            onKeyDown={(e) => e.key === "Enter" && setEditingCellId(null)}
                            className="h-8 text-sm text-right tabular-nums"
                          />
                        ) : (
                          <button
                            className="w-full text-right text-sm py-1 px-2 -mx-2 rounded hover:bg-muted/40 transition-colors tabular-nums"
                            onClick={() => setEditingCellId(`${line.id}-quantity`)}
                          >
                            {line.quantity}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-1.5">
                        {editingCellId === `${line.id}-unit` ? (
                          <Input
                            autoFocus
                            value={line.unit}
                            onChange={(e) => updateLine(line.id, "unit", e.target.value)}
                            onBlur={() => setEditingCellId(null)}
                            onKeyDown={(e) => e.key === "Enter" && setEditingCellId(null)}
                            className="h-8 text-sm"
                          />
                        ) : (
                          <button
                            className="w-full text-left text-sm py-1 px-2 -mx-2 rounded hover:bg-muted/40 transition-colors text-muted-foreground"
                            onClick={() => setEditingCellId(`${line.id}-unit`)}
                          >
                            {line.unit}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-1.5">
                        {editingCellId === `${line.id}-unit_price` ? (
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.unit_price}
                            onChange={(e) => updateLine(line.id, "unit_price", parseFloat(e.target.value) || 0)}
                            onBlur={() => setEditingCellId(null)}
                            onKeyDown={(e) => e.key === "Enter" && setEditingCellId(null)}
                            className="h-8 text-sm text-right tabular-nums"
                          />
                        ) : (
                          <button
                            className="w-full text-right text-sm py-1 px-2 -mx-2 rounded hover:bg-muted/40 transition-colors tabular-nums"
                            onClick={() => setEditingCellId(`${line.id}-unit_price`)}
                          >
                            {formatCurrency(line.unit_price)}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-sm text-right tabular-nums font-medium">
                        {formatCurrency(line.total)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => deleteLine(line.id)}
                          className="p-1 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Regel verwijderen"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                }

                // Read-only row
                return (
                  <tr key={line.id || idx} className="hover:bg-muted/10">
                    <td className="px-5 py-2.5 text-sm">{line.description}</td>
                    <td className="px-5 py-2.5 text-sm text-right tabular-nums">{line.quantity}</td>
                    <td className="px-5 py-2.5 text-sm text-muted-foreground">{line.unit}</td>
                    <td className="px-5 py-2.5 text-sm text-right tabular-nums">{formatCurrency(line.unit_price)}</td>
                    <td className="px-5 py-2.5 text-sm text-right tabular-nums font-medium">{formatCurrency(line.total)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Totalen */}
        <div className="border-t border-border/30 px-5 py-4">
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center justify-between w-48 text-sm">
              <span className="text-muted-foreground">Subtotaal</span>
              <span className="tabular-nums">{formatCurrency(displaySubtotal)}</span>
            </div>
            <div className="flex items-center justify-between w-48 text-sm">
              <span className="text-muted-foreground">BTW ({invoice.btw_percentage}%)</span>
              <span className="tabular-nums">{formatCurrency(displayBtwAmount)}</span>
            </div>
            <div className="flex items-center justify-between w-48 text-base font-semibold pt-1 border-t border-border/30 mt-1">
              <span>Totaal</span>
              <span className="tabular-nums">{formatCurrency(displayTotal)}</span>
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
