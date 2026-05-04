/**
 * Haptic feedback voor de chauffeur-PWA. Trillen werkt alleen op apparaten
 * waarvan de browser de Vibration API ondersteunt (Android Chrome, niet iOS).
 * Bij ontbrekende ondersteuning is dit een no-op zodat de UI nooit crasht.
 */
export function vibrate(pattern: number | readonly number[]): void {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;
  try {
    navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
  } catch {
    // Silent: vibrate is een nice-to-have, niet kritiek.
  }
}

export const HAPTICS = {
  short: 30,
  medium: 60,
  long: [40, 60, 120],
  errorBurst: [50, 80, 50, 80, 50],
  success: [40, 50, 80],
} as const;
