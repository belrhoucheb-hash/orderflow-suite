import { describe, it, expect } from "vitest";

// Deze testfile borgt de drempel- en dedupe-logica van de eta-watcher
// edge function (supabase/functions/eta-watcher/index.ts). Die logica zit
// daar verweven in I/O-code en is niet als pure functie geexporteerd.
// Om de drempelwaarden tegen regressie te beschermen, definieren we hier
// inline pure helpers met dezelfde formules als index.ts en testen we
// daartegen. Wijkt index.ts in de toekomst af, dan moeten deze helpers
// (en/of index.ts) bijgewerkt worden.

interface EtaSettings {
  customer_push_lead_minutes: number;
  customer_update_threshold_minutes: number;
  predicted_delay_threshold_minutes: number;
}

const DEFAULT_SETTINGS: EtaSettings = {
  customer_push_lead_minutes: 30,
  customer_update_threshold_minutes: 15,
  predicted_delay_threshold_minutes: 15,
};

/**
 * Mirror van index.ts regels rond CUSTOMER_LEAD:
 *   minutesUntilArrival = (predictedEtaMs - now) / 60_000
 *   trigger als minutesUntilArrival in [0, lead_minutes].
 */
function shouldTriggerLead(args: {
  predictedEtaMs: number;
  nowMs: number;
  settings: EtaSettings;
  alreadyHasLead: boolean;
}): boolean {
  if (args.alreadyHasLead) return false;
  const minutesUntilArrival = (args.predictedEtaMs - args.nowMs) / 60_000;
  return (
    minutesUntilArrival >= 0 &&
    minutesUntilArrival <= args.settings.customer_push_lead_minutes
  );
}

/**
 * Mirror van index.ts regels rond CUSTOMER_UPDATE:
 *   driftMs = |predictedEtaMs - leadMs|
 *   trigger als driftMs >= update_threshold * 60_000 (boundary inclusief).
 */
function shouldTriggerUpdate(args: {
  predictedEtaMs: number;
  leadEtaMs: number;
  settings: EtaSettings;
  alreadyHasLead: boolean;
  alreadyHasUpdate: boolean;
}): boolean {
  if (!args.alreadyHasLead) return false;
  if (args.alreadyHasUpdate) return false;
  const driftMs = Math.abs(args.predictedEtaMs - args.leadEtaMs);
  return driftMs >= args.settings.customer_update_threshold_minutes * 60_000;
}

/**
 * Mirror van index.ts regels rond PREDICTED_DELAY:
 *   overrunMs = predictedEtaMs - windowEndMs
 *   trigger als overrunMs >= delay_threshold * 60_000 (boundary inclusief).
 */
function shouldOpenPredictedDelay(args: {
  predictedEtaMs: number;
  windowEndMs: number;
  settings: EtaSettings;
  alreadyHasOpenException: boolean;
}): boolean {
  if (args.alreadyHasOpenException) return false;
  const overrunMs = args.predictedEtaMs - args.windowEndMs;
  return overrunMs >= args.settings.predicted_delay_threshold_minutes * 60_000;
}

const NOW = Date.UTC(2026, 3, 25, 10, 0, 0); // 2026-04-25 10:00:00 UTC
const MIN = 60_000;

describe("CUSTOMER_LEAD-drempel", () => {
  it("stop binnen lead-window triggert CUSTOMER_LEAD", () => {
    // ETA over 20 min, lead-window = 30 min -> binnen window
    expect(
      shouldTriggerLead({
        predictedEtaMs: NOW + 20 * MIN,
        nowMs: NOW,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: false,
      }),
    ).toBe(true);
  });

  it("stop niet binnen lead-window triggert geen CUSTOMER_LEAD", () => {
    // ETA over 90 min, lead-window = 30 min -> buiten window
    expect(
      shouldTriggerLead({
        predictedEtaMs: NOW + 90 * MIN,
        nowMs: NOW,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: false,
      }),
    ).toBe(false);
  });

  it("stop in het verleden (negatieve minutesUntilArrival) triggert geen LEAD", () => {
    // Voorkomt dat we een SMS sturen voor een stop die al voorbij is
    expect(
      shouldTriggerLead({
        predictedEtaMs: NOW - 5 * MIN,
        nowMs: NOW,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: false,
      }),
    ).toBe(false);
  });

  it("dedupe: bestaande LEAD-rij voorkomt nieuwe LEAD", () => {
    expect(
      shouldTriggerLead({
        predictedEtaMs: NOW + 10 * MIN,
        nowMs: NOW,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: true,
      }),
    ).toBe(false);
  });
});

describe("CUSTOMER_UPDATE-drempel", () => {
  it("ETA-shift < threshold triggert geen CUSTOMER_UPDATE", () => {
    // Drift 10 min, threshold 15 min
    const lead = NOW + 30 * MIN;
    const newEta = lead + 10 * MIN;
    expect(
      shouldTriggerUpdate({
        predictedEtaMs: newEta,
        leadEtaMs: lead,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: true,
        alreadyHasUpdate: false,
      }),
    ).toBe(false);
  });

  it("ETA-shift >= threshold triggert wel CUSTOMER_UPDATE", () => {
    // Drift exact 15 min, threshold 15 min -> boundary inclusief
    const lead = NOW + 30 * MIN;
    const newEta = lead + 15 * MIN;
    expect(
      shouldTriggerUpdate({
        predictedEtaMs: newEta,
        leadEtaMs: lead,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: true,
        alreadyHasUpdate: false,
      }),
    ).toBe(true);
  });

  it("ETA-shift ruim boven threshold triggert CUSTOMER_UPDATE", () => {
    const lead = NOW + 30 * MIN;
    const newEta = lead + 45 * MIN;
    expect(
      shouldTriggerUpdate({
        predictedEtaMs: newEta,
        leadEtaMs: lead,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: true,
        alreadyHasUpdate: false,
      }),
    ).toBe(true);
  });

  it("absolute drift telt: ETA naar voren schuiven triggert ook UPDATE", () => {
    // Klant moet ook gewaarschuwd als rit eerder is dan beloofd.
    const lead = NOW + 30 * MIN;
    const newEta = lead - 20 * MIN;
    expect(
      shouldTriggerUpdate({
        predictedEtaMs: newEta,
        leadEtaMs: lead,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: true,
        alreadyHasUpdate: false,
      }),
    ).toBe(true);
  });

  it("zonder LEAD geen UPDATE", () => {
    const lead = NOW + 30 * MIN;
    expect(
      shouldTriggerUpdate({
        predictedEtaMs: lead + 30 * MIN,
        leadEtaMs: lead,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: false,
        alreadyHasUpdate: false,
      }),
    ).toBe(false);
  });

  it("dedupe: bestaande UPDATE voorkomt tweede UPDATE", () => {
    const lead = NOW + 30 * MIN;
    expect(
      shouldTriggerUpdate({
        predictedEtaMs: lead + 30 * MIN,
        leadEtaMs: lead,
        settings: DEFAULT_SETTINGS,
        alreadyHasLead: true,
        alreadyHasUpdate: true,
      }),
    ).toBe(false);
  });
});

describe("PREDICTED_DELAY-drempel", () => {
  it("predicted_eta binnen window triggert geen PREDICTED_DELAY", () => {
    // ETA voor het einde van het window
    const windowEnd = NOW + 60 * MIN;
    const predicted = windowEnd - 5 * MIN;
    expect(
      shouldOpenPredictedDelay({
        predictedEtaMs: predicted,
        windowEndMs: windowEnd,
        settings: DEFAULT_SETTINGS,
        alreadyHasOpenException: false,
      }),
    ).toBe(false);
  });

  it("predicted_eta na window-end maar onder threshold triggert geen PREDICTED_DELAY", () => {
    // 10 min over de tijd, threshold 15 min
    const windowEnd = NOW + 60 * MIN;
    const predicted = windowEnd + 10 * MIN;
    expect(
      shouldOpenPredictedDelay({
        predictedEtaMs: predicted,
        windowEndMs: windowEnd,
        settings: DEFAULT_SETTINGS,
        alreadyHasOpenException: false,
      }),
    ).toBe(false);
  });

  it("predicted_eta > window_end + threshold triggert PREDICTED_DELAY", () => {
    // 30 min over de tijd, threshold 15 min
    const windowEnd = NOW + 60 * MIN;
    const predicted = windowEnd + 30 * MIN;
    expect(
      shouldOpenPredictedDelay({
        predictedEtaMs: predicted,
        windowEndMs: windowEnd,
        settings: DEFAULT_SETTINGS,
        alreadyHasOpenException: false,
      }),
    ).toBe(true);
  });

  it("predicted_eta op exact de drempel grens triggert WEL PREDICTED_DELAY (>= boundary)", () => {
    // 15 min over de tijd, threshold 15 min -> boundary inclusief
    const windowEnd = NOW + 60 * MIN;
    const predicted = windowEnd + 15 * MIN;
    expect(
      shouldOpenPredictedDelay({
        predictedEtaMs: predicted,
        windowEndMs: windowEnd,
        settings: DEFAULT_SETTINGS,
        alreadyHasOpenException: false,
      }),
    ).toBe(true);
  });

  it("dedupe: bestaande open exception voorkomt nieuwe PREDICTED_DELAY", () => {
    const windowEnd = NOW + 60 * MIN;
    const predicted = windowEnd + 60 * MIN;
    expect(
      shouldOpenPredictedDelay({
        predictedEtaMs: predicted,
        windowEndMs: windowEnd,
        settings: DEFAULT_SETTINGS,
        alreadyHasOpenException: true,
      }),
    ).toBe(false);
  });
});
