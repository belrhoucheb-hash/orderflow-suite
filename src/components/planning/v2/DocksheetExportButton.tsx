import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenantOptional } from "@/contexts/TenantContext";

interface DocksheetExportButtonProps {
  date: string;
}

interface ExportRow {
  order_nr: string;
  klant: string;
  ophaaladres: string;
  losadres: string;
  postcode: string;
  chauffeur: string;
  voertuig: string;
  tijdvenster: string;
  opmerking: string;
}

function csvEscape(value: string | null | undefined): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function extractPostcode(address: string | null): string {
  if (!address) return "";
  const m = address.match(/(\d{4}\s*[A-Za-z]{2})/);
  return m ? m[1].toUpperCase() : "";
}

function formatWindow(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  return `${start ?? ""}${start && end ? " - " : ""}${end ?? ""}`;
}

export function DocksheetExportButton({ date }: DocksheetExportButtonProps) {
  const { tenant } = useTenantOptional();
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (!tenant?.id) return;
    setBusy(true);
    try {
      const client = supabase as any;
      const { data, error } = await client
        .from("consolidation_groups")
        .select(`
          id, name, planned_date, vehicle_id, driver_id,
          vehicle:vehicles(name, plate),
          driver:drivers(name),
          consolidation_orders(
            stop_sequence,
            order:orders(
              order_number, client_name,
              pickup_address, delivery_address,
              pickup_time_window_start, pickup_time_window_end,
              delivery_time_window_start, delivery_time_window_end,
              notes, reference
            )
          )
        `)
        .eq("tenant_id", tenant.id)
        .eq("planned_date", date)
        .in("status", ["GOEDGEKEURD", "INGEPLAND"])
        .order("created_at");
      if (error) throw error;

      const rows: ExportRow[] = [];
      (data ?? []).forEach((g: any) => {
        const chauffeur = g.driver?.name ?? "";
        const voertuig = g.vehicle?.name ? `${g.vehicle.name}${g.vehicle.plate ? ` (${g.vehicle.plate})` : ""}` : "";
        const sortedOrders = [...(g.consolidation_orders ?? [])].sort(
          (a, b) => (a.stop_sequence ?? 999) - (b.stop_sequence ?? 999),
        );
        sortedOrders.forEach((co: any) => {
          const o = co.order;
          if (!o) return;
          rows.push({
            order_nr: String(o.order_number ?? ""),
            klant: o.client_name ?? "",
            ophaaladres: o.pickup_address ?? "",
            losadres: o.delivery_address ?? "",
            postcode: extractPostcode(o.delivery_address),
            chauffeur,
            voertuig,
            tijdvenster: formatWindow(o.delivery_time_window_start, o.delivery_time_window_end),
            opmerking: o.notes ?? o.reference ?? "",
          });
        });
      });

      if (rows.length === 0) {
        toast.info("Niets te exporteren", {
          description: "Geen bevestigde of ingeplande clusters voor deze dag.",
        });
        return;
      }

      const header = [
        "Ordernr", "Klant", "Ophaaladres", "Losadres", "Postcode",
        "Chauffeur", "Voertuig", "Tijdvenster", "Opmerking",
      ];
      const lines = [
        header.join(","),
        ...rows.map((r) =>
          [
            csvEscape(r.order_nr),
            csvEscape(r.klant),
            csvEscape(r.ophaaladres),
            csvEscape(r.losadres),
            csvEscape(r.postcode),
            csvEscape(r.chauffeur),
            csvEscape(r.voertuig),
            csvEscape(r.tijdvenster),
            csvEscape(r.opmerking),
          ].join(","),
        ),
      ];
      const csv = "\uFEFF" + lines.join("\n"); // BOM zodat Excel UTF-8 herkent
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `docksheet-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Docksheet geëxporteerd", {
        description: `${rows.length} regels in docksheet-${date}.csv`,
      });
    } catch (err) {
      toast.error("Export mislukt", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={busy}
      className="btn-luxe"
    >
      <FileSpreadsheet className="h-4 w-4" />
      {busy ? "Exporteren..." : "Docksheet"}
    </button>
  );
}
