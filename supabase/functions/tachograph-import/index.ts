// Tachograaf-import endpoint voor het chauffeursportaal.
//
// Flow:
//   1. Chauffeur kiest een .DDD bestand in /chauffeur > Tachograaf.
//   2. Frontend POST multipart/form-data met `file` en optioneel
//      `driver_id` (planner-side gebruik).
//   3. Deze function:
//      - valideert de JWT en haalt tenant_id uit app_metadata,
//      - resolved driver_id uit drivers.user_id (chauffeur-account)
//        of accepteert een meegestuurde driver_id als de caller
//        een planner is uit dezelfde tenant,
//      - upload het bestand naar storage bucket tachograph-files
//        onder {tenant_id}/{driver_id}/{timestamp}.ddd,
//      - insert in tachograph_imports met status RECEIVED.
//
// PARSING: het echte parsen van .DDD-binary (EU 165/2014 bijlage 1B) zit
// nog niet in deze function. ESM-pakketten zoals `tachograph-parser`
// (Node) zijn niet Deno-compatible en de open-source Deno-alternatieven
// die we vonden zijn ofwel onaf, ofwel >5MB aan WASM. Voor v1 nemen we
// daarom alleen het bestand in en zetten status op RECEIVED. De planner
// kan signed URL's halen en de file lokaal of in een aparte service
// parsen. v2-roadmap: aparte parser-job (Node-runtime) die polled op
// status=RECEIVED en de tabel update naar PARSED.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { getUserAuth } from "../_shared/auth.ts";

const CORS_OPTIONS = { extraHeaders: [], methods: "POST, OPTIONS" };

const MAX_FILE_BYTES = 10 * 1024 * 1024;

interface ResolvedDriver {
  driverId: string;
  tenantId: string;
}

async function resolveDriver(
  admin: SupabaseClient,
  authUserId: string,
  authTenantId: string,
  requestedDriverId: string | null,
): Promise<ResolvedDriver | { error: string; status: number }> {
  // Pad 1: chauffeur die zelf upload. drivers.user_id == auth user id.
  const { data: ownDriver } = await admin
    .from("drivers")
    .select("id, tenant_id")
    .eq("user_id", authUserId)
    .maybeSingle();
  if (ownDriver) {
    if ((ownDriver as { tenant_id: string }).tenant_id !== authTenantId) {
      return { error: "Driver tenant mismatch", status: 403 };
    }
    if (
      requestedDriverId &&
      (ownDriver as { id: string }).id !== requestedDriverId
    ) {
      return { error: "Chauffeur mag alleen voor zichzelf uploaden", status: 403 };
    }
    return {
      driverId: (ownDriver as { id: string }).id,
      tenantId: (ownDriver as { tenant_id: string }).tenant_id,
    };
  }

  // Pad 2: planner upload namens een chauffeur. Dan moet driver_id
  // expliciet meegegeven zijn en in dezelfde tenant zitten.
  if (!requestedDriverId) {
    return { error: "driver_id verplicht voor planner-upload", status: 400 };
  }
  const { data: targetDriver, error } = await admin
    .from("drivers")
    .select("id, tenant_id")
    .eq("id", requestedDriverId)
    .maybeSingle();
  if (error || !targetDriver) {
    return { error: "Chauffeur niet gevonden", status: 404 };
  }
  if ((targetDriver as { tenant_id: string }).tenant_id !== authTenantId) {
    return { error: "Driver tenant mismatch", status: 403 };
  }
  return {
    driverId: (targetDriver as { id: string }).id,
    tenantId: (targetDriver as { tenant_id: string }).tenant_id,
  };
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const cors = corsFor(req, CORS_OPTIONS);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const auth = await getUserAuth(req);
  if (!auth.ok) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new Response(
      JSON.stringify({ error: "multipart/form-data verwacht" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const file = formData.get("file");
  const requestedDriverId = (formData.get("driver_id") as string | null)?.trim() || null;

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "file ontbreekt" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!/\.ddd$/i.test(file.name)) {
    return new Response(
      JSON.stringify({ error: "Alleen .DDD bestanden toegestaan" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  if (file.size === 0) {
    return new Response(JSON.stringify({ error: "Bestand is leeg" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (file.size > MAX_FILE_BYTES) {
    return new Response(
      JSON.stringify({ error: `Bestand te groot (max ${MAX_FILE_BYTES} bytes)` }),
      { status: 413, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Server-config mist" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const resolved = await resolveDriver(admin, auth.userId, auth.tenantId, requestedDriverId);
  if ("error" in resolved) {
    return new Response(JSON.stringify({ error: resolved.error }), {
      status: resolved.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${resolved.tenantId}/${resolved.driverId}/${timestamp}.ddd`;

  const buffer = new Uint8Array(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from("tachograph-files")
    .upload(path, buffer, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    console.error("tachograph-import: upload mislukt", uploadError);
    return new Response(
      JSON.stringify({ error: "Upload mislukt", detail: uploadError.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  const { data: importRow, error: insertError } = await admin
    .from("tachograph_imports")
    .insert({
      tenant_id: resolved.tenantId,
      driver_id: resolved.driverId,
      file_path: path,
      file_name: file.name,
      file_size: file.size,
      status: "RECEIVED",
      imported_by: auth.userId,
    })
    .select("id")
    .single();
  if (insertError || !importRow) {
    console.error("tachograph-import: insert mislukt", insertError);
    // Best-effort: ruim het net geuploade bestand op zodat we geen
    // weesbestanden in de bucket laten staan.
    await admin.storage.from("tachograph-files").remove([path]).catch(() => undefined);
    return new Response(
      JSON.stringify({ error: "Insert mislukt", detail: insertError?.message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      importId: (importRow as { id: string }).id,
      filePath: path,
    }),
    {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    },
  );
});
