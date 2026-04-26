// Centrale CORS-helper voor alle edge functions.
//
// Ontwerpregels:
//  - Nooit `Access-Control-Allow-Origin: *` retourneren. Een wildcard breekt
//    cookies en credentialed requests, en maakt het lastig om misbruik
//    achteraf te traceren.
//  - Origin van de request alleen echo'en als hij voorkomt in een
//    expliciete whitelist. Anders een veilige fallback (productie-origin)
//    teruggeven, zodat de browser de response blokkeert i.p.v. accepteert.
//  - Whitelist is configureerbaar via env var ALLOWED_ORIGINS
//    (kommagescheiden lijst). Backwards-compat: ALLOWED_ORIGIN (singular)
//    wordt ook nog gelezen, zodat bestaande deploys niet hoeven te wijzigen.
//  - `Vary: Origin` zorgt dat caches per origin een aparte entry maken.

const DEFAULT_ALLOWED_ORIGINS: ReadonlyArray<string> = [
  "https://orderflow-suite.vercel.app",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:8080",
];

const SAFE_FALLBACK_ORIGIN = "https://orderflow-suite.vercel.app";

const DEFAULT_ALLOWED_HEADERS = [
  "authorization",
  "x-client-info",
  "apikey",
  "content-type",
];

const DEFAULT_ALLOWED_METHODS = "POST, GET, OPTIONS";

interface CorsOptions {
  /** Extra headers naast de defaults, bv. ["x-api-key"]. */
  extraHeaders?: string[];
  /** Override van toegestane methods, bv. "POST, OPTIONS". */
  methods?: string;
}

function loadAllowList(): Set<string> {
  const csv = Deno.env.get("ALLOWED_ORIGINS");
  if (csv && csv.trim().length > 0) {
    return new Set(
      csv
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    );
  }
  // Backwards-compat: oude singular env var blijft werken zolang we hem
  // tegenkomen in deployments.
  const legacy = Deno.env.get("ALLOWED_ORIGIN");
  if (legacy && legacy.trim().length > 0) {
    return new Set([legacy.trim(), ...DEFAULT_ALLOWED_ORIGINS]);
  }
  return new Set(DEFAULT_ALLOWED_ORIGINS);
}

export function corsFor(req: Request, options: CorsOptions = {}): Record<string, string> {
  const allowList = loadAllowList();
  const origin = req.headers.get("origin") ?? "";
  const allowOrigin = allowList.has(origin) ? origin : SAFE_FALLBACK_ORIGIN;

  const headers = options.extraHeaders && options.extraHeaders.length > 0
    ? [...DEFAULT_ALLOWED_HEADERS, ...options.extraHeaders]
    : DEFAULT_ALLOWED_HEADERS;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": options.methods ?? DEFAULT_ALLOWED_METHODS,
    "Access-Control-Allow-Headers": headers.join(", "),
  };
}

export function handleOptions(req: Request, options: CorsOptions = {}): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: corsFor(req, options) });
}
