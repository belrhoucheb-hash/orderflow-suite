export interface FleetVehicle {
  id: string;
  name: string;
  plate: string;
  type: string;
  capacityKg: number;
  capacityPallets: number;
  features: string[];
}

export const fleetVehicles: FleetVehicle[] = [
  {
    id: "fv1",
    name: "Busje 01",
    plate: "NL-BJ-01",
    type: "Sneltransport",
    capacityKg: 800,
    capacityPallets: 2,
    features: [],
  },
  {
    id: "fv2",
    name: "Bakwagen 02",
    plate: "NL-BK-02",
    type: "Distributie",
    capacityKg: 5000,
    capacityPallets: 12,
    features: ["LAADKLEP"],
  },
  {
    id: "fv3",
    name: "Koelwagen 03",
    plate: "NL-KW-03",
    type: "Koeltransport",
    capacityKg: 12000,
    capacityPallets: 18,
    features: ["KOELING"],
  },
  {
    id: "fv4",
    name: "Trekker 04",
    plate: "NL-TK-04",
    type: "Internationaal",
    capacityKg: 24000,
    capacityPallets: 33,
    features: ["ADR"],
  },
];
