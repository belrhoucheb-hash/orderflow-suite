// Geocoding lookup for Dutch cities/areas used by the planning map
export interface GeoCoord {
  lat: number;
  lng: number;
}

// Common Dutch cities/areas with coordinates
export const cityCoordinates: Record<string, GeoCoord> = {
  amsterdam: { lat: 52.37, lng: 4.9 },
  rotterdam: { lat: 51.92, lng: 4.48 },
  "den haag": { lat: 52.07, lng: 4.3 },
  utrecht: { lat: 52.09, lng: 5.12 },
  eindhoven: { lat: 51.44, lng: 5.47 },
  groningen: { lat: 53.22, lng: 6.57 },
  tilburg: { lat: 51.56, lng: 5.09 },
  breda: { lat: 51.59, lng: 4.78 },
  venlo: { lat: 51.37, lng: 6.17 },
  maastricht: { lat: 50.85, lng: 5.69 },
  arnhem: { lat: 51.98, lng: 5.91 },
  nijmegen: { lat: 51.84, lng: 5.87 },
  apeldoorn: { lat: 52.21, lng: 5.97 },
  enschede: { lat: 52.22, lng: 6.9 },
  haarlem: { lat: 52.38, lng: 4.64 },
  almere: { lat: 52.35, lng: 5.26 },
  zwolle: { lat: 52.52, lng: 6.09 },
  leiden: { lat: 52.16, lng: 4.49 },
  dordrecht: { lat: 51.81, lng: 4.67 },
  haarlemmermeer: { lat: 52.3, lng: 4.69 },
  schiphol: { lat: 52.31, lng: 4.77 },
  pernis: { lat: 51.88, lng: 4.39 },
  aalsmeer: { lat: 52.26, lng: 4.76 },
  delft: { lat: 52.01, lng: 4.36 },
  leeuwarden: { lat: 53.2, lng: 5.8 },
  "den bosch": { lat: 51.69, lng: 5.3 },
  "'s-hertogenbosch": { lat: 51.69, lng: 5.3 },
  deventer: { lat: 52.25, lng: 6.16 },
  amersfoort: { lat: 52.16, lng: 5.39 },
  duitsland: { lat: 51.5, lng: 7.0 },
  nederland: { lat: 52.13, lng: 5.29 },
  belgie: { lat: 50.85, lng: 4.35 },
};

// Vehicle colors for map markers
export const vehicleColors: Record<string, string> = {
  fv1: "#3b82f6", // blue
  fv2: "#8b5cf6", // violet
  fv3: "#06b6d4", // cyan
  fv4: "#f59e0b", // amber
};

/**
 * Try to resolve coordinates from an address string by matching known city names.
 */
export function resolveCoordinates(address: string | null): GeoCoord | null {
  if (!address) return null;
  const lower = address.toLowerCase();

  // Try to match known cities (longest match first)
  const sorted = Object.keys(cityCoordinates).sort((a, b) => b.length - a.length);
  for (const city of sorted) {
    if (lower.includes(city)) {
      // Add small random offset to prevent overlapping markers
      const jitter = () => (Math.random() - 0.5) * 0.02;
      return {
        lat: cityCoordinates[city].lat + jitter(),
        lng: cityCoordinates[city].lng + jitter(),
      };
    }
  }
  return null;
}

/**
 * Extract postcode region (first 2 digits) from address.
 * Falls back to city-based region estimation.
 */
export function getPostcodeRegion(address: string | null): string {
  if (!address) return "99";
  // Match Dutch postcode pattern: 4 digits + 2 letters
  const match = address.match(/(\d{4})\s*[A-Za-z]{2}/);
  if (match) return match[1].substring(0, 2);

  // Fallback: estimate from city
  const lower = address.toLowerCase();
  const cityToRegion: Record<string, string> = {
    amsterdam: "10",
    haarlem: "20",
    "den haag": "25",
    rotterdam: "30",
    breda: "48",
    tilburg: "50",
    eindhoven: "56",
    venlo: "59",
    arnhem: "68",
    nijmegen: "65",
    utrecht: "35",
    groningen: "97",
    zwolle: "80",
    maastricht: "62",
    schiphol: "11",
    pernis: "31",
    duitsland: "DE",
  };
  const sorted = Object.keys(cityToRegion).sort((a, b) => b.length - a.length);
  for (const city of sorted) {
    if (lower.includes(city)) return cityToRegion[city];
  }
  return "99";
}

/**
 * Haversine distance in km between two coordinates.
 */
export function haversineKm(a: GeoCoord, b: GeoCoord): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// Region label mapping
export function getRegionLabel(region: string): string {
  const labels: Record<string, string> = {
    "10": "Amsterdam / Noord-Holland",
    "11": "Schiphol / Haarlemmermeer",
    "20": "Haarlem / Kennemerland",
    "25": "Den Haag / Zuid-Holland",
    "30": "Rotterdam / Rijnmond",
    "31": "Rotterdam Haven",
    "35": "Utrecht",
    "48": "Breda / West-Brabant",
    "50": "Tilburg / Midden-Brabant",
    "56": "Eindhoven / Oost-Brabant",
    "59": "Venlo / Noord-Limburg",
    "62": "Maastricht / Zuid-Limburg",
    "65": "Nijmegen / Gelderland",
    "68": "Arnhem / Veluwe",
    "80": "Zwolle / Overijssel",
    "97": "Groningen",
    "99": "Overig",
    DE: "Duitsland",
  };
  return labels[region] || `Regio ${region}`;
}
