import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useGeoLocation, type GeoPosition } from "./useGeoLocation";

// ─── IndexedDB offline buffer ─────────────────────────────────────

const DB_NAME = "orderflow-offline";
const DB_VERSION = 2; // bumped to add positions store
const POSITIONS_STORE = "pending-positions";

interface PendingPosition {
  id: string;
  tenant_id: string | null;
  vehicle_id: string | null;
  driver_id: string;
  trip_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
  recorded_at: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      // Keep existing stores intact
      if (!db.objectStoreNames.contains("pending-pods")) {
        db.createObjectStore("pending-pods", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(POSITIONS_STORE)) {
        db.createObjectStore(POSITIONS_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePendingPositions(rows: PendingPosition[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POSITIONS_STORE, "readwrite");
    const store = tx.objectStore(POSITIONS_STORE);
    for (const row of rows) {
      store.put(row);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function getPendingPositions(): Promise<PendingPosition[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POSITIONS_STORE, "readonly");
    const store = tx.objectStore(POSITIONS_STORE);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as PendingPosition[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function clearPendingPositions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(POSITIONS_STORE, "readwrite");
    const store = tx.objectStore(POSITIONS_STORE);
    for (const id of ids) {
      store.delete(id);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// ─── Haversine distance (meters) ──────────────────────────────────

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Hook ─────────────────────────────────────────────────────────

const REPORT_INTERVAL_MS = 30_000;
const MIN_DISTANCE_M = 50;

/**
 * Reports the driver's GPS position to Supabase `vehicle_positions` every 30 seconds.
 * Only reports if position changed >50m since last report.
 * Buffers positions in IndexedDB when offline, syncs when back online.
 */
export function usePositionReporter(
  tripId: string | null,
  driverId: string | null,
  vehicleId?: string | null,
  tenantId?: string | null,
) {
  const { position, error, isTracking, startTracking, stopTracking } =
    useGeoLocation();

  const lastReportedRef = useRef<{ lat: number; lng: number } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const positionRef = useRef<GeoPosition | null>(null);

  // Keep positionRef in sync
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // Sync offline buffer when coming back online
  const syncOfflinePositions = useCallback(async () => {
    try {
      const pending = await getPendingPositions();
      if (pending.length === 0) return;

      const { error: insertError } = await supabase
        .from("vehicle_positions" as any)
        .insert(
          pending.map(({ id: _id, ...row }) => row),
        );

      if (!insertError) {
        await clearPendingPositions(pending.map((p) => p.id));
      }
    } catch {
      // Silently fail — will retry next time
    }
  }, []);

  // Report a single position
  const reportPosition = useCallback(async () => {
    const pos = positionRef.current;
    if (!pos || !tripId || !driverId) return;

    // Zonder expliciete tenant_id durven we geen vehicle_positions weg te
    // schrijven. Eerder leunde RLS op vehicle_id/driver_id om tenant te
    // inferentieren, maar dat geeft tenant-leakage als die mappings niet
    // kloppen. Skippen is veiliger dan een rij met tenant_id null.
    if (!tenantId) {
      if (import.meta.env.MODE === "development") {
        // eslint-disable-next-line no-console
        console.warn(
          "[usePositionReporter] tenantId ontbreekt, positie niet gerapporteerd",
        );
      }
      return;
    }

    // Check minimum distance
    if (lastReportedRef.current) {
      const dist = haversineMeters(
        lastReportedRef.current.lat,
        lastReportedRef.current.lng,
        pos.lat,
        pos.lng,
      );
      if (dist < MIN_DISTANCE_M) return;
    }

    const row = {
      tenant_id: tenantId,
      vehicle_id: vehicleId || null,
      driver_id: driverId,
      trip_id: tripId,
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading,
      speed: pos.speed,
      accuracy: pos.accuracy,
      recorded_at: new Date(pos.timestamp).toISOString(),
    };

    if (!navigator.onLine) {
      // Save to IndexedDB for later sync
      try {
        await savePendingPositions([
          { ...row, id: `pos-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        ]);
      } catch {
        // IndexedDB not available — drop
      }
    } else {
      // Try to sync any offline buffer first
      await syncOfflinePositions();

      const { error: insertError } = await supabase
        .from("vehicle_positions" as any)
        .insert(row);

      if (insertError) {
        // Save to offline buffer on failure
        try {
          await savePendingPositions([
            { ...row, id: `pos-${Date.now()}-${Math.random().toString(36).slice(2)}` },
          ]);
        } catch {
          // drop
        }
        return;
      }
    }

    lastReportedRef.current = { lat: pos.lat, lng: pos.lng };
  }, [tripId, driverId, vehicleId, tenantId, syncOfflinePositions]);

  // Set up reporting interval when tracking
  useEffect(() => {
    if (!isTracking || !tripId || !driverId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Report immediately on start
    reportPosition();

    intervalRef.current = setInterval(reportPosition, REPORT_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTracking, tripId, driverId, reportPosition]);

  // Listen for online events to sync offline buffer
  useEffect(() => {
    const handleOnline = () => {
      syncOfflinePositions();
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncOfflinePositions]);

  return {
    position,
    error,
    isTracking,
    startTracking,
    stopTracking,
  };
}
