import { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ──────────────────────────────────────────────────────────

export interface GeoPosition {
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number;
  timestamp: number;
}

export interface GeoLocationOptions {
  enableHighAccuracy?: boolean;
  maximumAge?: number;
  timeout?: number;
}

export interface GeoLocationState {
  position: GeoPosition | null;
  error: GeolocationPositionError | null;
  isTracking: boolean;
  startTracking: () => void;
  stopTracking: () => void;
}

// ─── Defaults ───────────────────────────────────────────────────────

const DEFAULT_OPTIONS: GeoLocationOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 15_000,
};

// ─── Hook ───────────────────────────────────────────────────────────

/**
 * Wrapper around the browser Geolocation API.
 * Provides reactive position updates via `navigator.geolocation.watchPosition`.
 */
export function useGeoLocation(
  options?: GeoLocationOptions,
): GeoLocationState {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  const startTracking = useCallback(() => {
    if (watchIdRef.current !== null) return; // already tracking
    if (!navigator.geolocation) {
      // Create a synthetic error-like object
      setError({
        code: 2,
        message: "Geolocation is not supported by this browser",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError);
      return;
    }

    setError(null);

    const id = navigator.geolocation.watchPosition(
      (geo) => {
        setPosition({
          lat: geo.coords.latitude,
          lng: geo.coords.longitude,
          heading: geo.coords.heading,
          speed: geo.coords.speed,
          accuracy: geo.coords.accuracy,
          timestamp: geo.timestamp,
        });
        setError(null);
      },
      (err) => {
        setError(err);
      },
      {
        enableHighAccuracy: mergedOptions.enableHighAccuracy,
        maximumAge: mergedOptions.maximumAge,
        timeout: mergedOptions.timeout,
      },
    );

    watchIdRef.current = id;
    setIsTracking(true);
  }, [mergedOptions.enableHighAccuracy, mergedOptions.maximumAge, mergedOptions.timeout]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { position, error, isTracking, startTracking, stopTracking };
}
