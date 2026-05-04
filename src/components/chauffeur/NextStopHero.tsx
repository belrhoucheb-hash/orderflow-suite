import { Navigation, Phone, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TripStop } from "@/types/dispatch";

interface Props {
  stop: TripStop;
  currentPosition: { lat: number; lng: number } | null;
  onNavigate: () => void;
  onCall: () => void;
}

const AVG_SPEED_KMH = 50;

function getStopCoord(stop: TripStop): { lat: number; lng: number } | null {
  const order = (stop as any).order ?? null;
  const candidates: Array<[unknown, unknown]> = [
    [stop.planned_latitude, stop.planned_longitude],
    [order?.geocoded_pickup_lat, order?.geocoded_pickup_lng],
    [order?.geocoded_delivery_lat, order?.geocoded_delivery_lng],
  ];
  for (const [lat, lng] of candidates) {
    if (typeof lat === "number" && typeof lng === "number" && !Number.isNaN(lat) && !Number.isNaN(lng)) {
      return { lat, lng };
    }
  }
  return null;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(km: number): string {
  return `${km.toFixed(1).replace(".", ",")} km`;
}

function formatEta(km: number): string {
  const minutes = Math.max(1, Math.round((km / AVG_SPEED_KMH) * 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}u` : `${h}u ${m}m`;
}

export function NextStopHero({ stop, currentPosition, onNavigate, onCall }: Props) {
  const stopCoord = getStopCoord(stop);
  const km = currentPosition && stopCoord ? haversineKm(currentPosition, stopCoord) : null;
  const isLoad = stop.stop_type === "PICKUP";
  const badgeLabel = isLoad ? "Laden" : "Lossen";

  return (
    <div className="card--luxe space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--gold-deep))] font-display text-sm font-bold text-white shadow-sm">
            {stop.stop_sequence}
          </span>
          <span className="rounded-full border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.4)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
            {badgeLabel}
          </span>
        </div>
        {km !== null && (
          <div className="text-right">
            <p className="font-display text-lg font-semibold tabular-nums text-foreground">
              {formatDistance(km)}
            </p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              ca. {formatEta(km)}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-start gap-2">
          <MapPin className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--gold-deep))]" />
          <p className="font-display text-xl font-semibold leading-tight text-foreground">
            {stop.planned_address || "Adres onbekend"}
          </p>
        </div>
        {(stop.contact_name || stop.contact_phone) && (
          <p className="pl-6 text-sm text-muted-foreground">
            {stop.contact_name}
            {stop.contact_name && stop.contact_phone ? ", " : ""}
            {stop.contact_phone}
          </p>
        )}
      </div>

      {stop.instructions && (
        <p className="rounded-xl bg-amber-50/80 px-3 py-2 text-xs text-amber-700">
          {stop.instructions}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={onNavigate} className="btn-luxe flex-1 h-11">
          <Navigation className="mr-2 h-4 w-4" />
          Navigeer
        </Button>
        <Button
          onClick={onCall}
          variant="outline"
          className="btn-luxe btn-luxe--secondary h-11 flex-1"
          disabled={!stop.contact_phone}
        >
          <Phone className="mr-2 h-4 w-4" />
          Bellen
        </Button>
      </div>
    </div>
  );
}
