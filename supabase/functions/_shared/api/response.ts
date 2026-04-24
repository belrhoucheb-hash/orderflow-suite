// Uniforme response-helpers voor REST API v1.
//
// Alle responses JSON. Errors volgen een vaste shape zodat klanten
// consistent kunnen parsen:
//   { "error": { "code": "not_found", "message": "Order niet gevonden" } }
//
// Rate-limit-headers worden altijd meegestuurd als die bekend zijn.

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RateLimitHeaders {
  limit: number;
  remaining: number;
  resetAt: string;
}

const BASE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
} as const;

export function jsonResponse(
  body: unknown,
  status = 200,
  rateLimit?: RateLimitHeaders,
): Response {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (rateLimit) {
    headers["X-RateLimit-Limit"] = String(rateLimit.limit);
    headers["X-RateLimit-Remaining"] = String(rateLimit.remaining);
    headers["X-RateLimit-Reset"] = rateLimit.resetAt;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  rateLimit?: RateLimitHeaders,
  details?: Record<string, unknown>,
): Response {
  const err: ApiError = { code, message };
  if (details) err.details = details;
  return jsonResponse({ error: err }, status, rateLimit);
}

export const errors = {
  unauthorized: (msg = "Ongeldige of ontbrekende token") =>
    errorResponse("unauthorized", msg, 401),
  forbidden: (msg = "Token mist benodigde scope") =>
    errorResponse("forbidden", msg, 403),
  notFound: (msg = "Resource niet gevonden") =>
    errorResponse("not_found", msg, 404),
  badRequest: (msg: string, details?: Record<string, unknown>) =>
    errorResponse("bad_request", msg, 400, undefined, details),
  methodNotAllowed: (msg = "Methode niet toegestaan voor dit endpoint") =>
    errorResponse("method_not_allowed", msg, 405),
  rateLimited: (rateLimit: RateLimitHeaders) =>
    errorResponse("rate_limited", "Te veel requests, probeer later opnieuw", 429, rateLimit),
  serverError: (msg = "Interne fout") =>
    errorResponse("server_error", msg, 500),
};
