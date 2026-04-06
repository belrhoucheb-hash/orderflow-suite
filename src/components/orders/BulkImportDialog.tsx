import { useState, useCallback, useRef, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useQueryClient } from "@tanstack/react-query";
import type { BulkImportRow, BulkImportValidation, BulkImportResult, ColumnMapping } from "@/types/bulkImport";
import { ORDER_FIELDS } from "@/types/bulkImport";
import {
  parseCSV,
  parseExcel,
  autoDetectColumns,
  mapRowsToImportData,
  validateRows,
} from "@/utils/bulkImportParser";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "mapping" | "preview" | "importing" | "done";

export function BulkImportDialog({ open, onOpenChange }: Props) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [validations, setValidations] = useState<BulkImportValidation[]>([]);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setMappings([]);
    setRawRows([]);
    setValidations([]);
    setImportResult(null);
    setDragOver(false);
  }, []);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) reset();
      onOpenChange(isOpen);
    },
    [onOpenChange, reset]
  );

  // ── File processing ────────────────────────────────────────────────

  const processFile = useCallback((file: File) => {
    const name = file.name.toLowerCase();
    const isExcel = name.endsWith(".xlsx") || name.endsWith(".xls");
    const isCsv = name.endsWith(".csv") || name.endsWith(".txt");

    if (!isExcel && !isCsv) {
      toast.error("Alleen CSV- en Excel-bestanden worden ondersteund (.csv, .txt, .xlsx, .xls)");
      return;
    }

    setFileName(file.name);

    const handleParsed = (parsedHeaders: string[], rows: string[][]) => {
      if (parsedHeaders.length === 0) {
        toast.error("Kan geen kolommen detecteren in het bestand");
        return;
      }
      if (rows.length === 0) {
        toast.error("Bestand bevat geen data (alleen header gevonden)");
        return;
      }

      const autoMappings = autoDetectColumns(parsedHeaders);
      setHeaders(parsedHeaders);
      setMappings(autoMappings);
      setRawRows(rows);
      setStep("mapping");
    };

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer || buffer.byteLength === 0) {
          toast.error("Bestand is leeg");
          return;
        }
        const { headers: parsedHeaders, rows } = await parseExcel(buffer);
        handleParsed(parsedHeaders, rows);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (!text || !text.trim()) {
          toast.error("Bestand is leeg");
          return;
        }
        const { headers: parsedHeaders, rows } = parseCSV(text);
        handleParsed(parsedHeaders, rows);
      };
      reader.readAsText(file);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // ── Mapping ────────────────────────────────────────────────────────

  const updateMapping = (index: number, field: keyof BulkImportRow | null) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, orderField: field } : m))
    );
  };

  const hasMappedClient = mappings.some((m) => m.orderField === "clientName");

  const proceedToPreview = useCallback(() => {
    const importRows = mapRowsToImportData(rawRows, mappings);
    const validated = validateRows(importRows);
    setValidations(validated);
    setStep("preview");
  }, [rawRows, mappings]);

  // ── Validation stats ───────────────────────────────────────────────

  const validCount = useMemo(() => validations.filter((v) => v.isValid).length, [validations]);
  const warningCount = useMemo(
    () => validations.filter((v) => v.isValid && v.warnings.length > 0).length,
    [validations]
  );
  const errorCount = useMemo(() => validations.filter((v) => !v.isValid).length, [validations]);

  // ── Import ─────────────────────────────────────────────────────────

  const handleImport = async () => {
    setStep("importing");

    const validRows = validations.filter((v) => v.isValid);
    let imported = 0;
    const importErrors: BulkImportResult["errors"] = [];
    const clientCache: Record<string, string> = {};

    for (const v of validRows) {
      try {
        const { row } = v;
        const clientName = row.clientName.trim();

        // Resolve or create client
        let clientId = clientCache[clientName.toLowerCase()];
        if (!clientId) {
          const lookupQuery = supabase
            .from("clients")
            .select("id")
            .ilike("name", clientName);
          if (tenant?.id) lookupQuery.eq("tenant_id", tenant.id);
          const { data: existingClient } = await lookupQuery.limit(1).maybeSingle();

          if (existingClient) {
            clientId = existingClient.id;
          } else {
            const clientInsert: Record<string, unknown> = { name: clientName };
            if (tenant?.id) clientInsert.tenant_id = tenant.id;
            const { data: newClient, error: clientErr } = await supabase
              .from("clients")
              .insert(clientInsert as any)
              .select("id")
              .single();

            if (clientErr || !newClient) {
              importErrors.push({ rowIndex: v.rowIndex, message: `Kan klant niet aanmaken: ${clientErr?.message}` });
              continue;
            }
            clientId = newClient.id;
          }
          clientCache[clientName.toLowerCase()] = clientId;
        }

        const weightRaw = row.weight?.replace(",", ".");
        const quantityRaw = row.quantity?.replace(",", ".");

        const orderData: Record<string, unknown> = {
          client_name: clientName,
          client_id: clientId,
          pickup_address: row.pickupAddress || null,
          delivery_address: row.deliveryAddress || null,
          weight_kg: weightRaw ? parseFloat(weightRaw) || null : null,
          quantity: quantityRaw ? parseInt(quantityRaw, 10) || null : null,
          reference: row.reference || null,
          notes: row.notes || null,
          delivery_date: row.deliveryDate || null,
          status: "PENDING",
        };

        if (tenant?.id) {
          orderData.tenant_id = tenant.id;
        }

        const { error: insertErr } = await supabase.from("orders").insert([orderData]);
        if (insertErr) {
          importErrors.push({ rowIndex: v.rowIndex, message: insertErr.message });
        } else {
          imported++;
        }
      } catch (err: any) {
        importErrors.push({ rowIndex: v.rowIndex, message: err?.message || "Onbekende fout" });
      }
    }

    const result: BulkImportResult = {
      total: validations.length,
      imported,
      skipped: validations.length - validRows.length,
      errors: importErrors,
    };

    setImportResult(result);
    setStep("done");

    // Refresh queries
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });

    if (imported > 0) {
      toast.success(`${imported} orders ge\u00EFmporteerd${importErrors.length > 0 ? `, ${importErrors.length} fouten` : ""}`);
    } else {
      toast.error(`Import mislukt: ${importErrors.length} fouten`);
    }
  };

  // ── Field options for dropdown ─────────────────────────────────────

  const fieldOptions: { value: string; label: string }[] = [
    { value: "", label: "-- Overslaan --" },
    ...ORDER_FIELDS.map((f) => ({ value: f.value, label: f.label })),
  ];

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Orders importeren</DialogTitle>
          <DialogDescription>
            Upload een CSV-bestand met ordergegevens. Kolommen worden automatisch herkend.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              flex flex-col items-center justify-center gap-3 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-colors
              ${dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}
            `}
          >
            <Upload className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                Sleep een CSV- of Excel-bestand hierheen
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                of klik om een bestand te selecteren
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Ondersteund: .csv, .xlsx, .xls (komma of puntkomma gescheiden)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Step 2: Column Mapping */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{fileName}</span>
              <span className="text-xs">({rawRows.length} rijen gevonden)</span>
            </div>

            {/* Column Mapping Grid */}
            <div>
              <h4 className="text-xs font-bold text-foreground mb-2">Kolomkoppeling</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {mappings.map((mapping, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground truncate" title={mapping.csvColumn}>
                      {mapping.csvColumn}
                    </span>
                    <select
                      value={mapping.orderField || ""}
                      onChange={(e) =>
                        updateMapping(idx, (e.target.value || null) as keyof BulkImportRow | null)
                      }
                      className="text-xs rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                    >
                      {fieldOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {!hasMappedClient && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p className="text-xs">
                  Koppel minimaal de kolom &quot;Klant&quot; om door te gaan.
                </p>
              </div>
            )}

            {/* Preview Table (first 5 rows) */}
            <div>
              <h4 className="text-xs font-bold text-foreground mb-2">
                Voorbeeld (eerste {Math.min(5, rawRows.length)} rijen)
              </h4>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {headers.map((h, i) => {
                        const mapped = mappings[i]?.orderField;
                        return (
                          <th
                            key={i}
                            className={`px-3 py-1.5 text-left font-medium whitespace-nowrap ${
                              mapped ? "text-primary" : "text-muted-foreground"
                            }`}
                          >
                            {h}
                            {mapped && (
                              <span className="ml-1 text-[10px] text-primary/60">
                                ({ORDER_FIELDS.find((f) => f.value === mapped)?.label})
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {rawRows.slice(0, 5).map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-border/30">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[200px] truncate"
                          >
                            {cell || "\u2014"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview & Validate */}
        {step === "preview" && (
          <div className="space-y-4">
            {/* Summary badges */}
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 bg-emerald-500/10">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {validCount} geldig
              </Badge>
              {warningCount > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-500/30 bg-amber-500/10">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {warningCount} waarschuwingen
                </Badge>
              )}
              {errorCount > 0 && (
                <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10">
                  <X className="h-3 w-3 mr-1" />
                  {errorCount} fouten
                </Badge>
              )}
            </div>

            {/* Validation table */}
            <div className="border border-border rounded-lg overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-10">#</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground w-10">Status</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Klant</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Ophaaladres</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Afleveradres</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Gewicht</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Aantal</th>
                    <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Fout / Waarschuwing</th>
                  </tr>
                </thead>
                <tbody>
                  {validations.map((v) => (
                    <tr
                      key={v.rowIndex}
                      className={`border-b border-border/30 ${
                        !v.isValid ? "bg-destructive/5" : v.warnings.length > 0 ? "bg-amber-500/5" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{v.rowIndex + 1}</td>
                      <td className="px-3 py-1.5">
                        {!v.isValid ? (
                          <X className="h-3.5 w-3.5 text-destructive" />
                        ) : v.warnings.length > 0 ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-foreground/80 max-w-[120px] truncate">{v.row.clientName || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[150px] truncate">{v.row.pickupAddress || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[150px] truncate">{v.row.deliveryAddress || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{v.row.weight || "\u2014"}</td>
                      <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{v.row.quantity || "\u2014"}</td>
                      <td className="px-3 py-1.5">
                        {v.errors.length > 0 && (
                          <span className="text-destructive">{v.errors.join("; ")}</span>
                        )}
                        {v.warnings.length > 0 && (
                          <span className="text-amber-600">{v.errors.length > 0 ? " | " : ""}{v.warnings.join("; ")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 4: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Orders worden ge&iuml;mporteerd...
            </p>
          </div>
        )}

        {/* Step 5: Done */}
        {step === "done" && importResult && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            {importResult.imported > 0 ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            ) : (
              <AlertCircle className="h-10 w-10 text-destructive" />
            )}
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                {importResult.imported > 0
                  ? `${importResult.imported} van ${importResult.total} orders ge\u00EFmporteerd`
                  : "Import mislukt"}
              </p>
              {importResult.skipped > 0 && (
                <p className="text-xs text-muted-foreground">
                  {importResult.skipped} rij(en) overgeslagen (validatiefouten)
                </p>
              )}
              {importResult.errors.length > 0 && (
                <p className="text-xs text-destructive">
                  {importResult.errors.length} rij(en) met importfouten
                </p>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <div className="w-full max-h-[150px] overflow-y-auto border border-border rounded-lg p-2 text-xs">
                {importResult.errors.map((err, i) => (
                  <p key={i} className="text-destructive">
                    Rij {err.rowIndex + 1}: {err.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <DialogFooter>
          {step === "mapping" && (
            <div className="flex gap-2 w-full justify-between">
              <Button variant="outline" onClick={reset}>
                Terug
              </Button>
              <Button
                onClick={proceedToPreview}
                disabled={!hasMappedClient}
                className="btn-primary"
              >
                Valideer &amp; Preview
              </Button>
            </div>
          )}
          {step === "preview" && (
            <div className="flex gap-2 w-full justify-between">
              <Button variant="outline" onClick={() => setStep("mapping")}>
                Terug
              </Button>
              <Button
                onClick={handleImport}
                disabled={validCount === 0}
                className="btn-primary"
              >
                <Upload className="h-4 w-4 mr-1" />
                Importeer {validCount} orders
                {errorCount > 0 && ` (${errorCount} overslaan)`}
              </Button>
            </div>
          )}
          {step === "done" && (
            <div className="flex gap-2 w-full justify-end">
              <Button variant="outline" onClick={reset}>
                Nog een bestand
              </Button>
              <Button onClick={() => handleClose(false)}>Sluiten</Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
