import { describe, it, expect } from "vitest";
import {
  haversineKm,
  calculateEtaMinutes,
} from "../../../supabase/functions/eta-watcher/eta";

describe("haversineKm", () => {
  it("geeft 0 voor twee identieke punten", () => {
    const p = { lat: 52.37, lng: 4.9 };
    expect(haversineKm(p, p)).toBe(0);
  });

  it("geeft ~57 km tussen Amsterdam en Rotterdam", () => {
    const ams = { lat: 52.37, lng: 4.9 };
    const rtm = { lat: 51.92, lng: 4.48 };
    const km = haversineKm(ams, rtm);
    expect(km).toBeGreaterThan(56);
    expect(km).toBeLessThan(58);
  });

  it("geeft ~halve omtrek aarde voor antipode (0,0) -> (0,180)", () => {
    const km = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    // Halve omtrek aarde via R=6371: pi * R = ~20015
    expect(km).toBeGreaterThan(20005);
    expect(km).toBeLessThan(20025);
  });

  it("is symmetrisch: haversine(a,b) == haversine(b,a)", () => {
    const a = { lat: 40.7128, lng: -74.006 };
    const b = { lat: 34.0522, lng: -118.2437 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});

describe("calculateEtaMinutes", () => {
  it("geeft een lege array bij geen resterende stops", () => {
    const eta = calculateEtaMinutes({
      currentLat: 52.37,
      currentLng: 4.9,
      remainingStops: [],
    });
    expect(eta).toEqual([]);
  });

  it("geeft ~60 min voor 1 stop op 50 km bij 50 km/h", () => {
    // We kiezen twee punten op dezelfde lengtegraad, ~50 km uit elkaar.
    // 1 graad latitude is ~111.32 km, dus 50/111.32 ~ 0.4491 graden.
    const start = { lat: 52.0, lng: 5.0 };
    const stop = { lat: 52.0 + 50 / 111.32, lng: 5.0 };
    const eta = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      speedKmh: 50,
      remainingStops: [stop],
    });
    expect(eta).toHaveLength(1);
    expect(eta[0]).toBeGreaterThan(58);
    expect(eta[0]).toBeLessThan(62);
  });

  it("rekent dwell-tijd toe voor stops na de eerste", () => {
    // Drie stops op dezelfde lijn, telkens 50 km uit elkaar bij 50 km/h.
    // Elke etappe = 60 min rijden. Dwell = 25 min default.
    // ETA[0] = 60
    // ETA[1] = 60 + 25 + 60 = 145
    // ETA[2] = 145 + 25 + 60 = 230
    const start = { lat: 52.0, lng: 5.0 };
    const stops = [
      { lat: 52.0 + 50 / 111.32, lng: 5.0 },
      { lat: 52.0 + 100 / 111.32, lng: 5.0 },
      { lat: 52.0 + 150 / 111.32, lng: 5.0 },
    ];
    const eta = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      speedKmh: 50,
      remainingStops: stops,
    });
    expect(eta).toHaveLength(3);
    expect(eta[0]).toBeGreaterThan(58);
    expect(eta[0]).toBeLessThan(62);
    expect(eta[1]).toBeGreaterThan(143);
    expect(eta[1]).toBeLessThan(147);
    expect(eta[2]).toBeGreaterThan(228);
    expect(eta[2]).toBeLessThan(232);
    // Cumulatief monotoon stijgend
    expect(eta[1]).toBeGreaterThan(eta[0]);
    expect(eta[2]).toBeGreaterThan(eta[1]);
  });

  it("valt terug op defaultSpeedKmh (50) wanneer speedKmh ontbreekt", () => {
    const start = { lat: 52.0, lng: 5.0 };
    const stop = { lat: 52.0 + 50 / 111.32, lng: 5.0 };
    const eta = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      remainingStops: [stop],
    });
    // Zonder speed: default = 50 km/h, dus ~60 min voor 50 km
    expect(eta[0]).toBeGreaterThan(58);
    expect(eta[0]).toBeLessThan(62);
  });

  it("valt terug op defaultSpeedKmh wanneer speedKmh = 0", () => {
    const start = { lat: 52.0, lng: 5.0 };
    const stop = { lat: 52.0 + 50 / 111.32, lng: 5.0 };
    const eta = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      speedKmh: 0,
      remainingStops: [stop],
    });
    // 0 mag geen Infinity geven, moet fallback zijn op 50 -> ~60 min
    expect(eta[0]).toBeGreaterThan(58);
    expect(eta[0]).toBeLessThan(62);
    expect(Number.isFinite(eta[0])).toBe(true);
  });

  it("respecteert custom defaultSpeedKmh", () => {
    const start = { lat: 52.0, lng: 5.0 };
    const stop = { lat: 52.0 + 100 / 111.32, lng: 5.0 };
    const eta = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      remainingStops: [stop],
      defaultSpeedKmh: 100,
    });
    // 100 km bij 100 km/h = 60 min
    expect(eta[0]).toBeGreaterThan(58);
    expect(eta[0]).toBeLessThan(62);
  });

  it("respecteert custom dwellMinutesPerStop", () => {
    const start = { lat: 52.0, lng: 5.0 };
    const stops = [
      { lat: 52.0 + 50 / 111.32, lng: 5.0 },
      { lat: 52.0 + 100 / 111.32, lng: 5.0 },
    ];
    const etaDefault = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      speedKmh: 50,
      remainingStops: stops,
    });
    const etaCustom = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      speedKmh: 50,
      remainingStops: stops,
      dwellMinutesPerStop: 10,
    });
    // Verschil tussen ETA[1]-en moet exact het dwell-verschil zijn (25-10=15)
    const diff = etaDefault[1] - etaCustom[1];
    expect(diff).toBeCloseTo(15, 5);
    // De eerste stop heeft geen dwell, dus die moet gelijk zijn
    expect(etaDefault[0]).toBeCloseTo(etaCustom[0], 5);
  });

  it("default dwell is 25 minuten", () => {
    // ETA[1] - ETA[0] = dwell + rijtijd voor segment 0->1.
    // Twee stops op gelijke afstand vanaf elkaar, eerste stop op 50 km
    // (60 min rijden), tweede op 100 km (segment 0->1 ook 50 km, 60 min).
    const start = { lat: 52.0, lng: 5.0 };
    const stops = [
      { lat: 52.0 + 50 / 111.32, lng: 5.0 },
      { lat: 52.0 + 100 / 111.32, lng: 5.0 },
    ];
    const eta = calculateEtaMinutes({
      currentLat: start.lat,
      currentLng: start.lng,
      speedKmh: 50,
      remainingStops: stops,
    });
    const segmentMinutes = eta[1] - eta[0];
    // segment = 60 min rijden + 25 min dwell = 85
    expect(segmentMinutes).toBeGreaterThan(83);
    expect(segmentMinutes).toBeLessThan(87);
  });
});
