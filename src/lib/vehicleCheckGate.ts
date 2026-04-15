export type VehicleCheckStatus = "PENDING" | "OK" | "DAMAGE_FOUND" | "RELEASED";

export interface VehicleCheckForGate {
  status: VehicleCheckStatus;
  completed_at: string | null;
}

/**
 * Pure resolver: mag chauffeur vandaag orders zien voor dit voertuig?
 *
 * Open als er voor vandaag een check bestaat met status OK of RELEASED
 * (= handmatig vrijgegeven na DAMAGE_FOUND). PENDING of DAMAGE_FOUND
 * zonder release = dicht.
 */
export function isGatePassed(
  latestCheck: VehicleCheckForGate | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!latestCheck) return false;
  if (!latestCheck.completed_at) return false;
  if (latestCheck.status !== "OK" && latestCheck.status !== "RELEASED") return false;

  const completed = new Date(latestCheck.completed_at);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return completed.getTime() >= startOfDay.getTime();
}
