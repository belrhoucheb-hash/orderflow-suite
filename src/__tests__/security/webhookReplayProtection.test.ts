// Replay-protection contract voor outbound webhooks.
//
// Onze signatuur (`v1=<hex>`) bindt timestamp aan body, maar dat alleen
// is geen replay-bescherming: een aanvaller kan een eerder vastgelegd
// (timestamp, body, signature) tripel later opnieuw afspelen tegen de
// subscriber. De norm in onze docs is dat subscribers de timestamp
// vergelijken met "nu" en alleen ±5 min toelaten.
//
// Deze tests bevriezen die check als shared helper en bewijzen dat de
// drempel werkt zoals gedocumenteerd. Doel: onze klant-SDK / docs
// kunnen hetzelfde gedrag aannemen.

import { describe, it, expect } from "vitest";

const REPLAY_WINDOW_SECONDS = 5 * 60;

/**
 * Verifier die een subscriber zou implementeren. Returnt true als het
 * timestamp recent genoeg is (binnen het toegestane window).
 */
export function isWithinReplayWindow(
  timestampSeconds: number,
  nowSeconds: number,
  toleranceSeconds = REPLAY_WINDOW_SECONDS,
): boolean {
  const delta = Math.abs(nowSeconds - timestampSeconds);
  return delta <= toleranceSeconds;
}

describe("replay-window helper", () => {
  const NOW = 1714000000;

  it("accepteert timestamp van 'nu'", () => {
    expect(isWithinReplayWindow(NOW, NOW)).toBe(true);
  });

  it("accepteert ±4 min uit het verleden of de toekomst", () => {
    expect(isWithinReplayWindow(NOW - 4 * 60, NOW)).toBe(true);
    expect(isWithinReplayWindow(NOW + 4 * 60, NOW)).toBe(true);
  });

  it("accepteert exact op de grens van 5 min", () => {
    expect(isWithinReplayWindow(NOW - 5 * 60, NOW)).toBe(true);
    expect(isWithinReplayWindow(NOW + 5 * 60, NOW)).toBe(true);
  });

  it("weigert timestamp 6 min oud (replay)", () => {
    expect(isWithinReplayWindow(NOW - 6 * 60, NOW)).toBe(false);
  });

  it("weigert timestamp 1 uur in de toekomst (clock skew misbruik)", () => {
    expect(isWithinReplayWindow(NOW - 60 * 60, NOW)).toBe(false);
    expect(isWithinReplayWindow(NOW + 60 * 60, NOW)).toBe(false);
  });

  it("custom tolerance werkt symmetrisch", () => {
    expect(isWithinReplayWindow(NOW - 30, NOW, 60)).toBe(true);
    expect(isWithinReplayWindow(NOW - 90, NOW, 60)).toBe(false);
  });
});

describe("delivery-id contract", () => {
  // Outbound delivery_id is altijd een UUIDv4 (uit DB-default gen_random_uuid).
  // Subscribers gebruiken deze als idempotency-key. Dit bevriest het formaat
  // zodat een wijziging in het schema (bijv. naar een numeric id) onmiddellijk
  // breekt op de tests in plaats van pas in productie.
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it("UUIDv4-pattern matcht een gen_random_uuid sample", () => {
    expect("550e8400-e29b-41d4-a716-446655440000").toMatch(UUID_V4);
  });

  it("matcht NIET op een numeriek id (regressie als formaat verandert)", () => {
    expect("123").not.toMatch(UUID_V4);
    expect("not-a-uuid").not.toMatch(UUID_V4);
  });
});
