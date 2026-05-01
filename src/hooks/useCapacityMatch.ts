import { useMemo } from "react";
import { useVehicles, type FleetVehicle } from "./useVehicles";
import { useDrivers, type Driver } from "./useDrivers";

export interface CapacityMatch {
  vehicle: FleetVehicle;
  driver: Driver | null;
  score: number; // 0-100, how well it matches
  reasons: string[]; // why this vehicle is a good match
  warnings: string[]; // potential issues
}

interface MatchInput {
  requirements: string[];
  weightKg: number;
  quantity: number;
  unit: string;
}

function normalizeReq(r: string): string {
  return r.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Matches an order's requirements to available vehicles+drivers.
 * Returns ranked list of matching options.
 */
export function useCapacityMatch(input: MatchInput | null) {
  const { data: vehicles = [] } = useVehicles();
  const { data: drivers = [] } = useDrivers();

  return useMemo(() => {
    if (!input) return [];

    const matches: CapacityMatch[] = [];
    const reqsNormalized = input.requirements.map(normalizeReq);
    const needsADR = reqsNormalized.includes("adr");
    const needsCooling = reqsNormalized.includes("koeling");
    const palletCount = input.unit === "Pallets" ? input.quantity : 0;

    for (const vehicle of vehicles) {
      const driver = drivers.find(d => d.current_vehicle_id === vehicle.id) || null;
      const vehicleFeatures = vehicle.features.map(normalizeReq);
      const driverCerts = driver ? driver.certifications.map(normalizeReq) : [];
      const allCaps = [...vehicleFeatures, ...driverCerts];

      let score = 50;
      const reasons: string[] = [];
      const warnings: string[] = [];

      // Check hard requirements
      if (needsADR && !allCaps.includes("adr")) {
        continue; // Skip — hard requirement not met
      }
      if (needsCooling && !vehicleFeatures.includes("koeling")) {
        continue; // Skip — hard requirement not met
      }

      // Weight check
      if (input.weightKg > 0) {
        if (input.weightKg > vehicle.capacityKg) {
          warnings.push(`Overgewicht: ${input.weightKg}kg > ${vehicle.capacityKg}kg capaciteit`);
          score -= 30;
        } else {
          const utilization = input.weightKg / vehicle.capacityKg;
          if (utilization > 0.6 && utilization <= 1) {
            score += 20;
            reasons.push(`Goede benutting: ${Math.round(utilization * 100)}% capaciteit`);
          } else if (utilization <= 0.3) {
            score -= 10;
            warnings.push(`Lage benutting: slechts ${Math.round(utilization * 100)}%`);
          }
        }
      }

      // Pallet check
      if (palletCount > 0) {
        if (palletCount > vehicle.capacityPallets) {
          warnings.push(`Te weinig palletplaatsen: ${palletCount} > ${vehicle.capacityPallets}`);
          score -= 30;
        } else {
          score += 10;
          reasons.push(`${vehicle.capacityPallets - palletCount} palletplaatsen over`);
        }
      }

      // Requirement match bonuses
      if (needsADR && allCaps.includes("adr")) {
        score += 25;
        reasons.push("ADR-gecertificeerd");
      }
      if (needsCooling && vehicleFeatures.includes("koeling")) {
        score += 25;
        reasons.push("Koelinstallatie aanwezig");
      }

      // Driver cert match
      for (const req of reqsNormalized) {
        if (driverCerts.includes(req) && driver) {
          reasons.push(`Chauffeur ${driver.name}: ${req.toUpperCase()}-gecertificeerd`);
        }
      }

      if (reasons.length === 0) {
        reasons.push("Beschikbaar");
      }

      matches.push({
        vehicle,
        driver,
        score: Math.max(0, Math.min(100, score)),
        reasons,
        warnings,
      });
    }

    return matches.sort((a, b) => b.score - a.score);
  }, [vehicles, drivers, input]);
}
