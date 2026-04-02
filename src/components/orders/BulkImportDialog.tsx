import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  client_name: string;
  pickup_address: string;
  delivery_address: string;
  weight_kg: number | null;
  quantity: number | null;
  unit: string;
}

interface ColumnMapping {
  csvHeader: string;
  mappedField: keyof ParsedRow | null;
}

// ── Column mapping configuration ──────────────────────────────────────
// Maps common Dutch/English CSV header names to order fields.
// Matching is case-insensitive and uses "contains" logic.
const FIELD_ALIASES: Record<keyof ParsedRow, string[]> = {
  client_name: ["klant", "client", "klantnaam", "opdrachtgever", "customer", "bedrijf", "company"],
  pickup_address: ["ophalen", "pickup", "ophaaladres", "pickup_address", "laden", "vertrek"],
  delivery_address: ["leveren", "delivery", "afleveradres", "delivery_address", "lossen", "bestemming", "afleveren"],
  weight_kg: ["gewicht", "weight", "kg", "weight_kg", "massa"],
  quantity: ["aantal", "quantity", "stuks", "qty", "hoeveelheid"],
  unit: ["eenheid", "unit", "verpakking", "colli"],
};

function fuzzyMatchField(header: string): keyof ParsedRow | null {
  const normalized = header.toLowerCase().trim();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (normalized === alias || normalized.includes(alias)) {
        return field as keyof ParsedRow;
      }
    }
  }
  return null;
}

// Detect delimiter: semicolon (European CSVs) vs comma
function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function BulkImportDialog({ open, onOpenChange }: Props) {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setMappings([]);
    setRows([]);
    setImporting(false);
    setResult(null);
    setDragOver(false);
  }, []);

  const handleClose = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) reset();
      onOpenChange(isOpen);
    },
    [onOpenChange, reset]
  );

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".txt")) {
      toast.error("Alleen CSV-bestanden worden ondersteund (.csv, .txt)");
      return;
    }

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text || !text.trim()) {
        toast.error("Bestand is leeg");
        return;
      }

      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length < 2) {
        toast.error("Bestand bevat geen data (alleen header gevonden)");
        return;
      }

      const delimiter = detectDelimiter(lines[0]);
      const csvHeaders = parseCSVLine(lines[0], delimiter);
      const csvRows = lines.slice(1).map((line) => parseCSVLine(line, delimiter));

      // Auto-map columns
      const autoMappings: ColumnMapping[] = csvHeaders.map((h) => ({
        csvHeader: h,
        mappedField: fuzzyMatchField(h),
      }));

      setHeaders(csvHeaders);
      setMappings(autoMappings);
      setRows(csvRows);
      setStep("preview");
    };
    reader.readAsText(file);
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

  const updateMapping = (index: number, field: keyof ParsedRow | null) => {
    setMappings((prev) =>
      prev.map((m, i) => (i === index ? { ...m, mappedField: field } : m))
    );
  };

  const getColumnIndex = (field: keyof ParsedRow): number => {
    return mappings.findIndex((m) => m.mappedField === field);
  };

  const handleImport = async () => {
    const clientIdx = getColumnIndex("client_name");
    if (clientIdx === -1) {
      toast.error("Kolomkoppeling voor 'Klant' is verplicht");
      return;
    }

    setImporting(true);
    setStep("importing");

    let success = 0;
    let errors = 0;

    // Cache for client lookups to avoid repeated queries
    const clientCache: Record<string, string> = {};

    for (const row of rows) {
      try {
        const clientName = row[clientIdx]?.trim();
        if (!clientName) {
          errors++;
          continue;
        }

        // Resolve or create client
        let clientId = clientCache[clientName.toLowerCase()];
        if (!clientId) {
          // Look up existing client
          const { data: existingClient } = await supabase
            .from("clients")
            .select("id")
            .ilike("name", clientName)
            .limit(1)
            .maybeSingle();

          if (existingClient) {
            clientId = existingClient.id;
          } else {
            // Create new client
            const { data: newClient, error: clientErr } = await supabase
              .from("clients")
              .insert({ name: clientName } as any)
              .select("id")
              .single();

            if (clientErr || !newClient) {
              console.error("Failed to create client:", clientErr);
              errors++;
              continue;
            }
            clientId = newClient.id;
          }
          clientCache[clientName.toLowerCase()] = clientId;
        }

        const pickupIdx = getColumnIndex("pickup_address");
        const deliveryIdx = getColumnIndex("delivery_address");
        const weightIdx = getColumnIndex("weight_kg");
        const quantityIdx = getColumnIndex("quantity");
        const unitIdx = getColumnIndex("unit");

        const weightRaw = weightIdx >= 0 ? row[weightIdx]?.trim().replace(",", ".") : null;
        const quantityRaw = quantityIdx >= 0 ? row[quantityIdx]?.trim() : null;

        const orderData: Record<string, unknown> = {
          client_name: clientName,
          client_id: clientId,
          pickup_address: pickupIdx >= 0 ? row[pickupIdx]?.trim() || null : null,
          delivery_address: deliveryIdx >= 0 ? row[deliveryIdx]?.trim() || null : null,
          weight_kg: weightRaw ? parseFloat(weightRaw) || null : null,
          quantity: quantityRaw ? parseInt(quantityRaw, 10) || null : null,
          unit: unitIdx >= 0 ? row[unitIdx]?.trim() || null : null,
          status: "PENDING",
        };

        if (tenant?.id) {
          orderData.tenant_id = tenant.id;
        }

        const { error: insertErr } = await supabase.from("orders").insert([orderData]);
        if (insertErr) {
          console.error("Failed to insert order:", insertErr);
          errors++;
        } else {
          success++;
        }
      } catch (err) {
        console.error("Row import error:", err);
        errors++;
      }
    }

    setResult({ success, errors });
    setImporting(false);
    setStep("done");

    // Refresh orders list
    queryClient.invalidateQueries({ queryKey: ["orders"] });
    queryClient.invalidateQueries({ queryKey: ["clients"] });

    if (success > 0) {
      toast.success(`${success} orders geïmporteerd${errors > 0 ? `, ${errors} fouten` : ""}`);
    } else {
      toast.error(`Import mislukt: ${errors} fouten`);
    }
  };

  const previewRows = rows.slice(0, 10);
  const hasMappedClient = mappings.some((m) => m.mappedField === "client_name");

  const fieldOptions: { value: keyof ParsedRow | ""; label: string }[] = [
    { value: "", label: "-- Overslaan --" },
    { value: "client_name", label: "Klant" },
    { value: "pickup_address", label: "Ophaaladres" },
    { value: "delivery_address", label: "Afleveradres" },
    { value: "weight_kg", label: "Gewicht (kg)" },
    { value: "quantity", label: "Aantal" },
    { value: "unit", label: "Eenheid" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
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
                Sleep een CSV-bestand hierheen
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                of klik om een bestand te selecteren
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Ondersteund: .csv (komma of puntkomma gescheiden)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Step 2: Preview & Column Mapping */}
        {step === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />
              <span>{fileName}</span>
              <span className="text-xs">({rows.length} rijen gevonden)</span>
            </div>

            {/* Column Mapping */}
            <div>
              <h4 className="text-xs font-bold text-foreground mb-2">Kolomkoppeling</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {mappings.map((mapping, idx) => (
                  <div key={idx} className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground truncate" title={mapping.csvHeader}>
                      {mapping.csvHeader}
                    </span>
                    <select
                      value={mapping.mappedField || ""}
                      onChange={(e) =>
                        updateMapping(idx, (e.target.value || null) as keyof ParsedRow | null)
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
                  Koppel minimaal de kolom "Klant" om door te gaan.
                </p>
              </div>
            )}

            {/* Preview Table */}
            <div>
              <h4 className="text-xs font-bold text-foreground mb-2">
                Voorbeeld (eerste {Math.min(10, rows.length)} rijen)
              </h4>
              <div className="border border-border rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      {headers.map((h, i) => {
                        const mapped = mappings[i]?.mappedField;
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
                                ({fieldOptions.find((f) => f.value === mapped)?.label})
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, rIdx) => (
                      <tr key={rIdx} className="border-b border-border/30">
                        {row.map((cell, cIdx) => (
                          <td
                            key={cIdx}
                            className="px-3 py-1.5 text-muted-foreground whitespace-nowrap max-w-[200px] truncate"
                          >
                            {cell || "—"}
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

        {/* Step 3: Importing */}
        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Orders worden geïmporteerd...
            </p>
          </div>
        )}

        {/* Step 4: Done */}
        {step === "done" && result && (
          <div className="flex flex-col items-center justify-center gap-4 py-8">
            {result.success > 0 ? (
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            ) : (
              <AlertCircle className="h-10 w-10 text-destructive" />
            )}
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-foreground">
                {result.success > 0
                  ? `${result.success} orders geïmporteerd`
                  : "Import mislukt"}
              </p>
              {result.errors > 0 && (
                <p className="text-xs text-muted-foreground">
                  {result.errors} rij(en) met fouten overgeslagen
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <DialogFooter>
          {step === "preview" && (
            <div className="flex gap-2 w-full justify-between">
              <Button variant="outline" onClick={reset}>
                Terug
              </Button>
              <Button
                onClick={handleImport}
                disabled={!hasMappedClient || importing}
                className="btn-primary"
              >
                <Upload className="h-4 w-4 mr-1" />
                Importeer {rows.length} orders
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
