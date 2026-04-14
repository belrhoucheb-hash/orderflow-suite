import { useState } from "react";
import { AlertTriangle, Phone, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * §22 PREVIEW — toont de chauffeur pre-departure info-modal met mock-data.
 * Handig om de UX te testen zonder DB/trips/info-requests te moeten prepareren.
 * Route: /chauffeur/preview-modal
 */
export default function PreviewPreDepartureModal() {
  const [open, setOpen] = useState(true);
  const [severity, setSeverity] = useState<"overdue" | "pending">("overdue");
  const [withPhone, setWithPhone] = useState(true);

  const mockRequests = [
    { id: "1", field_label: "Laadreferentie", status: severity === "overdue" ? "OVERDUE" : "PENDING" },
    { id: "2", field_label: "MRN-nummer", status: "PENDING" },
    { id: "3", field_label: "Contactpersoon op locatie", status: "PENDING" },
  ];

  const hasOverdue = mockRequests.some(r => r.status === "OVERDUE");
  const plannerPhone = withPhone ? "+31 20 123 4567" : null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Pre-departure modal — preview</h1>
        <p className="text-sm text-gray-600">
          Mock-preview van de modal die een chauffeur te zien krijgt bij "Start Rit" als er nog info openstaat.
        </p>

        <div className="bg-white rounded-xl border p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant={severity === "overdue" ? "default" : "outline"}
              onClick={() => setSeverity("overdue")}
            >
              Rood (OVERDUE)
            </Button>
            <Button
              size="sm"
              variant={severity === "pending" ? "default" : "outline"}
              onClick={() => setSeverity("pending")}
            >
              Oranje (PENDING)
            </Button>
            <Button
              size="sm"
              variant={withPhone ? "default" : "outline"}
              onClick={() => setWithPhone(v => !v)}
            >
              {withPhone ? "Met plannernr" : "Zonder plannernr"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              Modal tonen
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            In prod: modal opent automatisch bij Start Rit als de bijbehorende orders open
            info_requests hebben. Kies "Toch starten" = rit start; "Annuleren" = terug zonder starten.
          </p>
        </div>

        {open && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
              <div className={`p-4 text-white ${hasOverdue ? "bg-red-600" : "bg-amber-600"}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6" />
                  <h2 className="text-base font-bold">
                    {hasOverdue ? "STOP — Info niet binnen" : "Let op — info openstaand"}
                  </h2>
                </div>
                <p className="text-sm mt-1 text-white/90">
                  Voor deze rit ontbreekt nog informatie die de klant moest aanleveren.
                  Bel de planner vóór vertrek om gedoe op locatie te voorkomen.
                </p>
              </div>

              <div className="p-4 space-y-3 max-h-[40vh] overflow-y-auto">
                <p className="text-xs font-bold uppercase text-gray-500 tracking-wide">
                  Openstaand ({mockRequests.length})
                </p>
                <ul className="space-y-1.5">
                  {mockRequests.map(r => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          r.status === "OVERDUE" ? "bg-red-500" : "bg-amber-500"
                        }`}
                      />
                      <span className="font-medium">{r.field_label}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-3 border-t border-gray-100 flex flex-col gap-2">
                {plannerPhone && (
                  <a href={`tel:${plannerPhone}`} className="block">
                    <Button className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl">
                      <Phone className="h-4 w-4 mr-2" />
                      Bel planner ({plannerPhone})
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
                    className="flex-1 h-10"
                    onClick={() => setOpen(false)}
                  >
                    <X className="h-4 w-4 mr-1" /> Annuleren
                  </Button>
                  <Button
                    className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => { alert("Rit start (preview)"); setOpen(false); }}
                  >
                    <Play className="h-4 w-4 mr-1" /> Toch starten
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
