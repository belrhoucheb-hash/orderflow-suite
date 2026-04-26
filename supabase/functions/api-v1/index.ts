// Publieke REST API v1.
//
// Alle endpoints onder /api-v1/ (edge function base-path). Bearer-token
// authenticatie, scope-check per endpoint, rate-limit per token.
//
// Endpoints:
//   GET  /orders            orders:read
//   GET  /orders/:id        orders:read
//   POST /orders            orders:write
//   GET  /trips             trips:read
//   GET  /trips/:id         trips:read
//   GET  /invoices          invoices:read
//   GET  /invoices/:id      invoices:read
//   GET  /clients           clients:read
//   GET  /clients/:id       clients:read
//
// Queries worden ALTIJD gescopet op token.tenant_id en, als
// token.client_id gezet is, ook op client_id. De gateway gebruikt
// service-role om RLS te omzeilen; alle scoping gebeurt in code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyToken, touchTokenLastUsed, hasScope, type ApiToken } from "../_shared/api/tokens.ts";
import { checkRateLimit, type RateLimitResult } from "../_shared/api/rate-limit.ts";
import { errors, jsonResponse, type RateLimitHeaders } from "../_shared/api/response.ts";
import {
  shapeOrder,
  shapeTrip,
  shapeInvoice,
  shapeClient,
} from "../_shared/api/shapers.ts";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

function rlToHeaders(r: RateLimitResult): RateLimitHeaders {
  return { limit: r.limit, remaining: r.remaining, resetAt: r.resetAt };
}

Deno.serve(async (req) => {
  const started = Date.now();

  // CORS preflight , open naar de wereld; auth zit in de bearer-token.
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. Auth
  const auth = await verifyToken(supabase, req);
  if (!auth.ok) {
    return errors.unauthorized(auth.error);
  }
  const token = auth.token;

  // 2. Rate limit
  const rl = await checkRateLimit(supabase, token.id);
  if (!rl.ok) {
    return errors.rateLimited(rlToHeaders(rl));
  }

  // 3. Parse path
  const url = new URL(req.url);
  // Base pad is /api-v1 of /functions/v1/api-v1 afhankelijk van deploy.
  // Strip alles tot en met "api-v1".
  const pathMatch = url.pathname.match(/\/api-v1(\/.*)?$/);
  const routePath = pathMatch?.[1] ?? "/";
  const segments = routePath.split("/").filter(Boolean);
  const resource = segments[0];
  const resourceId = segments[1];

  let response: Response;
  try {
    response = await route({
      req,
      supabase,
      token,
      rl,
      resource,
      resourceId,
      url,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[api-v1] unhandled: ${msg}`);
    response = errors.serverError();
  }

  // 4. Log request (fire-and-forget)
  const duration = Date.now() - started;
  logRequest(supabase, token, req.method, url.pathname, response.status, duration);
  touchTokenLastUsed(supabase, token.id);

  return response;
});

interface RouteCtx {
  req: Request;
  supabase: ReturnType<typeof createClient>;
  token: ApiToken;
  rl: RateLimitResult;
  resource: string | undefined;
  resourceId: string | undefined;
  url: URL;
}

async function route(ctx: RouteCtx): Promise<Response> {
  const { req, resource, resourceId, rl } = ctx;
  const rlHeaders = rlToHeaders(rl);

  if (!resource) {
    return jsonResponse(
      {
        version: "v1",
        endpoints: [
          "GET /orders", "GET /orders/:id", "POST /orders",
          "GET /trips", "GET /trips/:id",
          "GET /invoices", "GET /invoices/:id",
          "GET /clients", "GET /clients/:id",
        ],
      },
      200,
      rlHeaders,
    );
  }

  switch (resource) {
    case "orders":
      if (req.method === "GET" && !resourceId) return listOrders(ctx);
      if (req.method === "GET" && resourceId) return getOrder(ctx, resourceId);
      if (req.method === "POST" && !resourceId) return createOrder(ctx);
      return errors.methodNotAllowed();

    case "trips":
      if (req.method !== "GET") return errors.methodNotAllowed();
      return resourceId ? getTrip(ctx, resourceId) : listTrips(ctx);

    case "invoices":
      if (req.method !== "GET") return errors.methodNotAllowed();
      return resourceId ? getInvoice(ctx, resourceId) : listInvoices(ctx);

    case "clients":
      if (req.method !== "GET") return errors.methodNotAllowed();
      return resourceId ? getClient(ctx, resourceId) : listClients(ctx);

    default:
      return errors.notFound(`Onbekende resource: ${resource}`);
  }
}

// ─── Pagination helpers ─────────────────────────────────────────────

function parsePagination(url: URL): { limit: number; offset: number } {
  const rawLimit = Number(url.searchParams.get("limit") ?? DEFAULT_PAGE_SIZE);
  const rawOffset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Math.min(Math.max(1, Number.isFinite(rawLimit) ? rawLimit : DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  return { limit, offset };
}

function scopeClient<T extends { client_id?: string | null }>(
  q: any,
  token: ApiToken,
): any {
  return token.client_id ? q.eq("client_id", token.client_id) : q;
}

async function validateOrderClientId(
  supabase: ReturnType<typeof createClient>,
  tenantId: string,
  clientId: unknown,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (clientId === undefined || clientId === null || clientId === "") {
    return { ok: true };
  }

  if (typeof clientId !== "string") {
    return { ok: false, message: "client_id moet een string zijn" };
  }

  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return { ok: false, message: "Kon client_id niet valideren" };
  }

  if (!data) {
    return { ok: false, message: "client_id hoort niet bij deze tenant" };
  }

  return { ok: true };
}

// ─── Orders ─────────────────────────────────────────────────────────

async function listOrders(ctx: RouteCtx): Promise<Response> {
  const { supabase, token, url, rl } = ctx;
  if (!hasScope(token, "orders:read")) return errors.forbidden();

  const { limit, offset } = parsePagination(url);

  let q = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .eq("tenant_id", token.tenant_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  q = scopeClient(q, token);

  const { data, count, error } = await q;
  if (error) return errors.serverError(error.message);

  return jsonResponse(
    {
      data: (data ?? []).map(shapeOrder),
      pagination: { limit, offset, total: count ?? 0 },
    },
    200,
    rlToHeaders(rl),
  );
}

async function getOrder(ctx: RouteCtx, id: string): Promise<Response> {
  const { supabase, token, rl } = ctx;
  if (!hasScope(token, "orders:read")) return errors.forbidden();

  let q = supabase
    .from("orders")
    .select("*")
    .eq("tenant_id", token.tenant_id)
    .eq("id", id);

  q = scopeClient(q, token);

  const { data, error } = await q.maybeSingle();
  if (error) return errors.serverError(error.message);
  if (!data) return errors.notFound();

  return jsonResponse({ data: shapeOrder(data) }, 200, rlToHeaders(rl));
}

const ALLOWED_ORDER_FIELDS = new Set([
  "client_name", "client_id", "pickup_address", "delivery_address",
  "transport_type", "weight_kg", "is_weight_per_unit", "quantity", "unit",
  "dimensions", "requirements", "internal_note", "delivery_date",
  "reference", "notes",
]);

async function createOrder(ctx: RouteCtx): Promise<Response> {
  const { req, supabase, token, rl } = ctx;
  if (!hasScope(token, "orders:write")) return errors.forbidden();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errors.badRequest("Body moet geldig JSON zijn");
  }

  // Klant-token: forceer client_id van de token, overschrijf wat er
  // eventueel in de body staat (voorkomt cross-klant-write).
  if (token.client_id) {
    body.client_id = token.client_id;
  }

  // Minimale validatie zoals create-order
  if (!body.client_name && !body.pickup_address && !body.delivery_address && !body.client_id) {
    return errors.badRequest(
      "Minstens één van client_name, client_id, pickup_address of delivery_address is vereist",
    );
  }

  // Filter velden
  const orderData: Record<string, unknown> = { tenant_id: token.tenant_id };
  for (const [k, v] of Object.entries(body)) {
    if (ALLOWED_ORDER_FIELDS.has(k)) orderData[k] = v;
  }
  if (!orderData.status) orderData.status = "DRAFT";

  const clientValidation = await validateOrderClientId(
    supabase,
    token.tenant_id,
    orderData.client_id,
  );
  if (!clientValidation.ok) {
    return errors.badRequest(clientValidation.message);
  }

  const { data, error } = await supabase
    .from("orders")
    .insert(orderData)
    .select("*")
    .single();

  if (error) return errors.badRequest("Kon order niet opslaan", { db: error.message });
  return jsonResponse({ data: shapeOrder(data) }, 201, rlToHeaders(rl));
}

// ─── Trips ──────────────────────────────────────────────────────────

async function listTrips(ctx: RouteCtx): Promise<Response> {
  const { supabase, token, url, rl } = ctx;
  if (!hasScope(token, "trips:read")) return errors.forbidden();

  const { limit, offset } = parsePagination(url);

  // Klant-scope: filter trips waar MINSTENS één order bij deze klant hoort.
  // Voor v1 simpel: alleen tenant-scope. Klant-scoped trips vereisen join
  // via trip_orders; we staan dit nog niet toe en geven een 403 terug.
  if (token.client_id) {
    return errors.forbidden("trips:read is niet beschikbaar voor klant-tokens in v1");
  }

  const { data, count, error } = await supabase
    .from("trips")
    .select("*", { count: "exact" })
    .eq("tenant_id", token.tenant_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return errors.serverError(error.message);

  return jsonResponse(
    {
      data: (data ?? []).map(shapeTrip),
      pagination: { limit, offset, total: count ?? 0 },
    },
    200,
    rlToHeaders(rl),
  );
}

async function getTrip(ctx: RouteCtx, id: string): Promise<Response> {
  const { supabase, token, rl } = ctx;
  if (!hasScope(token, "trips:read")) return errors.forbidden();
  if (token.client_id) {
    return errors.forbidden("trips:read is niet beschikbaar voor klant-tokens in v1");
  }

  const { data, error } = await supabase
    .from("trips")
    .select("*")
    .eq("tenant_id", token.tenant_id)
    .eq("id", id)
    .maybeSingle();

  if (error) return errors.serverError(error.message);
  if (!data) return errors.notFound();

  return jsonResponse({ data: shapeTrip(data) }, 200, rlToHeaders(rl));
}

// ─── Invoices ───────────────────────────────────────────────────────

async function listInvoices(ctx: RouteCtx): Promise<Response> {
  const { supabase, token, url, rl } = ctx;
  if (!hasScope(token, "invoices:read")) return errors.forbidden();

  const { limit, offset } = parsePagination(url);

  let q = supabase
    .from("invoices")
    .select("*", { count: "exact" })
    .eq("tenant_id", token.tenant_id)
    .order("invoice_date", { ascending: false })
    .range(offset, offset + limit - 1);

  q = scopeClient(q, token);

  const { data, count, error } = await q;
  if (error) return errors.serverError(error.message);

  return jsonResponse(
    {
      data: (data ?? []).map(shapeInvoice),
      pagination: { limit, offset, total: count ?? 0 },
    },
    200,
    rlToHeaders(rl),
  );
}

async function getInvoice(ctx: RouteCtx, id: string): Promise<Response> {
  const { supabase, token, rl } = ctx;
  if (!hasScope(token, "invoices:read")) return errors.forbidden();

  let q = supabase
    .from("invoices")
    .select("*")
    .eq("tenant_id", token.tenant_id)
    .eq("id", id);

  q = scopeClient(q, token);

  const { data, error } = await q.maybeSingle();
  if (error) return errors.serverError(error.message);
  if (!data) return errors.notFound();

  return jsonResponse({ data: shapeInvoice(data) }, 200, rlToHeaders(rl));
}

// ─── Clients ────────────────────────────────────────────────────────

async function listClients(ctx: RouteCtx): Promise<Response> {
  const { supabase, token, url, rl } = ctx;
  if (!hasScope(token, "clients:read")) return errors.forbidden();

  // Klant-token ziet alleen zichzelf.
  const { limit, offset } = parsePagination(url);

  let q = supabase
    .from("clients")
    .select("*", { count: "exact" })
    .eq("tenant_id", token.tenant_id)
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (token.client_id) q = q.eq("id", token.client_id);

  const { data, count, error } = await q;
  if (error) return errors.serverError(error.message);

  return jsonResponse(
    {
      data: (data ?? []).map(shapeClient),
      pagination: { limit, offset, total: count ?? 0 },
    },
    200,
    rlToHeaders(rl),
  );
}

async function getClient(ctx: RouteCtx, id: string): Promise<Response> {
  const { supabase, token, rl } = ctx;
  if (!hasScope(token, "clients:read")) return errors.forbidden();

  // Klant-token mag alleen eigen client opvragen.
  if (token.client_id && token.client_id !== id) return errors.notFound();

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("tenant_id", token.tenant_id)
    .eq("id", id)
    .maybeSingle();

  if (error) return errors.serverError(error.message);
  if (!data) return errors.notFound();

  return jsonResponse({ data: shapeClient(data) }, 200, rlToHeaders(rl));
}

// ─── Logging ────────────────────────────────────────────────────────

async function logRequest(
  supabase: ReturnType<typeof createClient>,
  token: ApiToken,
  method: string,
  path: string,
  statusCode: number,
  durationMs: number,
): Promise<void> {
  try {
    await supabase.from("api_request_log").insert({
      token_id: token.id,
      tenant_id: token.tenant_id,
      client_id: token.client_id,
      method,
      path,
      status_code: statusCode,
      duration_ms: durationMs,
    });
  } catch (e) {
    console.error("[api-v1] log failed:", e instanceof Error ? e.message : e);
  }
}
