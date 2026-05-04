import { useCallback, useEffect, useState } from "react";

import { getGpsMode, setGpsMode, type GpsMode } from "@/lib/gpsPreferences";

export type ThemePref = "licht" | "donker" | "auto";

const THEME_KEY = "orderflow_theme_mode";
const HAPTICS_KEY = "orderflow_haptics_enabled";
const NOTIF_KEY = "orderflow_notifications_enabled";

function readTheme(): ThemePref {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "licht" || stored === "donker" || stored === "auto") return stored;
    return "auto";
  } catch {
    return "auto";
  }
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // Stil falen, de keuze wordt deze sessie niet bewaard.
  }
}

/**
 * Bepaal welke effectieve thema-klasse op de root moet komen, gegeven de keuze
 * (licht/donker/auto) en de huidige systeemvoorkeur.
 */
export function effectiveTheme(pref: ThemePref): "licht" | "donker" {
  if (pref === "licht") return "licht";
  if (pref === "donker") return "donker";
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "donker" : "licht";
  }
  return "licht";
}

/**
 * Hook om gebruiksvoorkeuren van de chauffeur uit te lezen en te muteren.
 * Schrijft naar localStorage, geeft updates door binnen één tab via een
 * lokaal storage-event.
 */
export function usePreferences() {
  const [theme, setTheme] = useState<ThemePref>(() => readTheme());
  const [gpsMode, setGpsModeState] = useState<GpsMode>(() => getGpsMode());
  const [hapticsEnabled, setHapticsEnabledState] = useState<boolean>(() => readBool(HAPTICS_KEY, true));
  const [notificationsEnabled, setNotificationsEnabledState] = useState<boolean>(() =>
    readBool(NOTIF_KEY, true),
  );

  const updateTheme = useCallback((next: ThemePref) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Stil falen.
    }
    setTheme(next);
  }, []);

  const updateGpsMode = useCallback((next: GpsMode) => {
    setGpsMode(next);
    setGpsModeState(next);
  }, []);

  const updateHaptics = useCallback((next: boolean) => {
    writeBool(HAPTICS_KEY, next);
    setHapticsEnabledState(next);
  }, []);

  const updateNotifications = useCallback((next: boolean) => {
    writeBool(NOTIF_KEY, next);
    setNotificationsEnabledState(next);
  }, []);

  // Pas de dark-class toe op de root zodra het thema verandert. Volg ook
  // systeem-veranderingen wanneer de voorkeur op "auto" staat.
  useEffect(() => {
    const apply = () => {
      const isDark = effectiveTheme(theme) === "donker";
      document.documentElement.classList.toggle("dark", isDark);
    };
    apply();

    if (theme !== "auto" || typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply();
    if (mql.addEventListener) mql.addEventListener("change", handler);
    else mql.addListener(handler);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", handler);
      else mql.removeListener(handler);
    };
  }, [theme]);

  return {
    theme,
    setTheme: updateTheme,
    gpsMode,
    setGpsMode: updateGpsMode,
    hapticsEnabled,
    setHapticsEnabled: updateHaptics,
    notificationsEnabled,
    setNotificationsEnabled: updateNotifications,
  };
}
