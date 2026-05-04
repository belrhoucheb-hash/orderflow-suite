// Geocoding lookup for Dutch cities/areas used by the planning map
export interface GeoCoord {
  lat: number;
  lng: number;
}

// Hardcoded Dutch cities/areas as cache/fallback
const cityCache: Record<string, GeoCoord> = {
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
  antwerpen: { lat: 51.22, lng: 4.4 },
};

// Backwards-compatible export alias
export const cityCoordinates: Record<string, GeoCoord> = cityCache;

// Session-level geocode result cache (address -> coord)
const geocodeResultCache: Record<string, GeoCoord | null> = {};

// Rate limiting for Nominatim (1 request per second)
let lastNominatimCall = 0;

async function waitForNominatimRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastNominatimCall;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastNominatimCall = Date.now();
}

/**
 * Geocode an address string to coordinates.
 * 1. Check local cache (hardcoded cities + session results)
 * 2. Try PDOK Locatieserver for NL addresses
 * 3. Fall back to Nominatim for international addresses
 * 4. Cache results in memory for the session
 */
export async function geocodeAddress(address: string): Promise<GeoCoord | null> {
  if (!address) return null;

  const lower = address.toLowerCase().trim();

  // 1. Check session result cache (exact match)
  if (lower in geocodeResultCache) {
    return geocodeResultCache[lower];
  }

  // 2. Check hardcoded city cache (substring match, longest first)
  const sortedCities = Object.keys(cityCache).sort((a, b) => b.length - a.length);
  for (const city of sortedCities) {
    if (lower.includes(city)) {
      const result = { ...cityCache[city] };
      geocodeResultCache[lower] = result;
      return result;
    }
  }

  // 3. Try PDOK Locatieserver (Dutch addresses)
  try {
    const pdokUrl = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(address)}&rows=1`;
    const pdokRes = await fetch(pdokUrl, { signal: AbortSignal.timeout(5000) });
    if (pdokRes.ok) {
      const pdokData = await pdokRes.json();
      const docs = pdokData?.response?.docs;
      if (docs && docs.length > 0) {
        const doc = docs[0];
        // PDOK returns centroide_ll as "POINT(lng lat)"
        const pointMatch = doc.centroide_ll?.match(/POINT\(([\d.]+)\s+([\d.]+)\)/);
        if (pointMatch) {
          const coord: GeoCoord = {
            lat: parseFloat(pointMatch[2]),
            lng: parseFloat(pointMatch[1]),
          };
          geocodeResultCache[lower] = coord;
          return coord;
        }
      }
    }
  } catch (e) {
    // PDOK failed, continue to Nominatim
    console.warn("PDOK geocode failed, falling back to Nominatim:", e);
  }

  // 4. Fall back to Nominatim (international) with rate limiting
  try {
    await waitForNominatimRateLimit();
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
    const nomRes = await fetch(nomUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "orderflow-suite/1.0" },
    });
    if (nomRes.ok) {
      const nomData = await nomRes.json();
      if (nomData && nomData.length > 0) {
        const coord: GeoCoord = {
          lat: parseFloat(nomData[0].lat),
          lng: parseFloat(nomData[0].lon),
        };
        geocodeResultCache[lower] = coord;
        return coord;
      }
    }
  } catch (e) {
    console.warn("Nominatim geocode failed:", e);
  }

  // Cache negative result to avoid repeated lookups
  geocodeResultCache[lower] = null;
  return null;
}

// Vehicle colors for map markers
export const vehicleColors: Record<string, string> = {
  fv1: "#3b82f6", // blue
  fv2: "#8b5cf6", // violet
  fv3: "#06b6d4", // cyan
  fv4: "#f59e0b", // amber
};

/**
 * Try to resolve coordinates from an address string by matching known city names.
 * Falls back to async geocoding if no cache hit is found (returns null synchronously,
 * but triggers a background geocode for future calls).
 */
export function resolveCoordinates(address: string | null): GeoCoord | null {
  if (!address) return null;
  const lower = address.toLowerCase().trim();

  // Check session result cache first (exact match from previous geocodeAddress calls)
  if (lower in geocodeResultCache && geocodeResultCache[lower]) {
    const cached = geocodeResultCache[lower]!;
    const jitter = () => (Math.random() - 0.5) * 0.02;
    return {
      lat: cached.lat + jitter(),
      lng: cached.lng + jitter(),
    };
  }

  // Try to match known cities (longest match first)
  const sorted = Object.keys(cityCache).sort((a, b) => b.length - a.length);
  for (const city of sorted) {
    if (lower.includes(city)) {
      // Add small random offset to prevent overlapping markers
      const jitter = () => (Math.random() - 0.5) * 0.02;
      return {
        lat: cityCache[city].lat + jitter(),
        lng: cityCache[city].lng + jitter(),
      };
    }
  }

  // Trigger background geocode for future calls (fire-and-forget)
  geocodeAddress(address).catch(() => {});

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
    "21": "Hoofddorp / Haarlemmermeer",
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
