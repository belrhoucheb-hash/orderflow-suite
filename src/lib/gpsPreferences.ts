/**
 * GPS-spaarmodus voorkeur. "hoog" gebruikt high-accuracy GPS met
 * korte cache (5s), "spaar" zet high-accuracy uit en cachet 30s zodat
 * de batterij minder belast wordt tijdens lange ritten.
 */

export type GpsMode = "hoog" | "spaar";

const STORAGE_KEY = "orderflow_gps_mode";

export function getGpsMode(): GpsMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "spaar") return "spaar";
    return "hoog";
  } catch {
    return "hoog";
  }
}

export function setGpsMode(mode: GpsMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage niet beschikbaar, voorkeur wordt deze sessie niet bewaard.
  }
}

export interface GeolocationOptionsForMode {
  enableHighAccuracy: boolean;
  maximumAge: number;
  timeout: number;
}

export function geolocationOptionsForMode(mode: GpsMode): GeolocationOptionsForMode {
  if (mode === "spaar") {
    return { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 };
  }
  return { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 };
}
