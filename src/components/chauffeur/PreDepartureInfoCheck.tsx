import { useEffect, useState } from "react";
import { AlertTriangle, Phone, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  orderIds: string[];
  plannerPhone?: string | null;
  onCancel: () => void;
  /** Chauffeur drukt "Toch starten" — parent roept de start-mutation aan. */
  onProceed: () => void;
}

interface OpenRequest {
  id: string;
  order_id: string;
  field_label: string | null;
  field_name: string;
  status: string;
}

/**
 * §22 REQ-22.6 — niet-blokkerende modal die chauffeur waarschuwt dat er
 * info-verzoeken openstaan voor de orders in deze rit.
 *
 * Wordt pas gemount zodra `open` true is; pre-checkt open-requests bij mount.
 */
export function PreDepartureInfoCheck({
  open,
  orderIds,
  plannerPhone,
  onCancel,
  onProceed,
}: Props) {
  const [checking, setChecking] = useState(true);
  const [openReqs, setOpenReqs] = useState<OpenRequest[]>([]);

  useEffect(() => {
    if (!open || orderIds.length === 0) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      const { data, error } = await (supabase as any)
        .from("order_info_requests")
        .select("id, order_id, field_label, field_name, status")
        .in("order_id", orderIds)
        .in("status", ["PENDING", "OVERDUE"]);
      if (!cancelled) {
        if (error) {
          console.warn("[PreDepartureInfoCheck] query error:", error);
          setOpenReqs([]);
        } else {
          setOpenReqs((data ?? []) as OpenRequest[]);
        }
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderIds]);

  // Als er niks openstaat: direct doorstarten zonder modal.
  useEffect(() => {
    if (open && !checking && openReqs.length === 0) {
      onProceed();
    }
    // Alleen reageren op het moment van afronding van de check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, openReqs.length]);

  if (!open || checking || openReqs.length === 0) return null;

  const hasOverdue = openReqs.some(r => r.status === "OVERDUE");

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md card--luxe overflow-hidden p-0 border-[hsl(var(--gold)/0.3)]">
        <div className={`p-4 text-white ${hasOverdue ? "bg-red-600" : "bg-amber-600"}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            <h2 className="text-base font-bold font-display tracking-tight">
              {hasOverdue ? "STOP, info niet binnen" : "Let op, info openstaand"}
            </h2>
          </div>
          <p className="text-sm mt-1 text-white/90">
            Voor deze rit ontbreekt nog informatie die de klant moest aanleveren.
            Bel de planner vóór vertrek om gedoe op locatie te voorkomen.
          </p>
        </div>

        <div className="p-4 space-y-3 max-h-[40vh] overflow-y-auto">
          <p className="text-[11px] font-bold uppercase text-[hsl(var(--gold-deep))] tracking-[0.18em] font-display">
            Openstaand ({openReqs.length})
          </p>
          <ul className="space-y-1.5">
            {openReqs.map(r => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    r.status === "OVERDUE" ? "bg-red-500" : "bg-amber-500"
                  }`}
                />
                <span className="font-medium">{r.field_label ?? r.field_name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-3 border-t border-[hsl(var(--gold)/0.18)] flex flex-col gap-2">
          {plannerPhone && (
            <a href={`tel:${plannerPhone}`} className="block">
              <Button className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl">
                <Phone className="h-4 w-4 mr-2" />
                Bel planner (<span className="tabular-nums">{plannerPhone}</span>)
              </Button>
            </a>
          )}
          {!plannerPhone && (
            <Button disabled className="w-full h-11 bg-gray-200 text-gray-500 rounded-xl">
              <Phone className="h-4 w-4 mr-2" />
              Bel planner (nummer niet ingesteld)
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="btn-luxe btn-luxe--secondary flex-1 h-10"
              onClick={onCancel}
            >
              <X className="h-4 w-4 mr-1" /> Annuleren
            </Button>
            <Button
              className="btn-luxe btn-luxe--primary flex-1 h-10"
              onClick={onProceed}
            >
              <Play className="h-4 w-4 mr-1" /> Toch starten
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
