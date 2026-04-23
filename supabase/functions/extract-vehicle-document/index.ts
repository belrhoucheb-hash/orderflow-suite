// Extract vehicle-document data from an uploaded document.
//
// Input (multipart of JSON):
//   { file_base64: string, mime_type: string, tenant_id: string }
// Output:
//   { doc_type, issued_date, expiry_date, confidence }
//
// Strategie: we vragen Gemini 2.5 Flash om het document (PDF of foto) te
// lezen en de vier velden uit een gesloten lijst mogelijke voertuig-
// documenttypes te kiezen. We halen de lijst actieve types voor de tenant
// op en geven die mee in de prompt, zodat het model alleen bestaande codes
// kan kiezen. Bij onzekerheid returnt het model doc_type=null en
// confidence<0.5, zodat de UI de velden niet silent voor-invult.
//
// Review-flow: deze functie stelt alleen een voorstel voor. De gebruiker
// ziet de velden voorgevuld met "AI-voorstel"-badge en kan alles
// overschrijven voor opslaan.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { getUserAuth } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";

function geminiUrl(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 800 + Math.random() * 400;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 800 + Math.random() * 400;
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw lastErr;
}

interface DocType {
  code: string;
  name: string;
}

async function loadDocumentTypes(tenantId: string): Promise<DocType[]> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("Supabase env not configured");
  }
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data, error } = await admin
    .from("vehicle_document_types")
    .select("code, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as DocType[];
}

function buildPrompt(types: DocType[]): string {
  const typeList = types.map((t) => `- ${t.code}: ${t.name}`).join("\n");
  return [
    "Je krijgt een scan of foto van een voertuig-document. Dit kan bijvoorbeeld zijn: APK-keuringsrapport, kentekenbewijs, verzekeringsbewijs, ADR-keuringscertificaat, tachograaf-ijking, groene kaart, eurovignet of leasecontract. Haal vier velden eruit:",
    "1. doc_type: kies exact één code uit de lijst hieronder. Als je geen match vindt, gebruik null.",
    "2. issued_date: uitgifte-/afgiftedatum in YYYY-MM-DD. Null als niet te vinden.",
    "3. expiry_date: vervaldatum, einddatum, geldig tot, einddatum polis, etc. in YYYY-MM-DD. Null als niet te vinden.",
    "4. confidence: schatting van je zekerheid tussen 0 en 1. Onder 0.5 als het document onduidelijk of afgesneden is.",
    "",
    "Beschikbare doc_types voor deze tenant:",
    typeList,
    "",
    "Let op bij Nederlandse datums: DD-MM-YYYY en DD/MM/YYYY komen vaak voor, draai om naar YYYY-MM-DD.",
    "Verwar uitgifte- en vervaldatum niet: de uitgifte ligt eerder in de tijd dan de vervaldatum.",
    "Geef alleen JSON terug, geen uitleg.",
  ].join("\n");
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    doc_type: { type: "STRING", nullable: true },
    issued_date: { type: "STRING", nullable: true },
    expiry_date: { type: "STRING", nullable: true },
    confidence: { type: "NUMBER" },
  },
  required: ["doc_type", "issued_date", "expiry_date", "confidence"],
};

interface ExtractResult {
  doc_type: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  confidence: number;
}

function normaliseDate(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD-MM-YYYY en DD/MM/YYYY voor de zekerheid nog eens omdraaien,
  // want Gemini returnt soms toch de Nederlandse volgorde.
  const m = trimmed.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function validateCode(raw: string | null, types: DocType[]): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  return types.find((t) => t.code.toLowerCase() === lower)?.code ?? null;
}

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const cors = corsFor(req);
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: cors });
  }

  // Vereist een geldige user-JWT met tenant_id; alleen ingelogde planners
  // mogen voertuig-documenten via AI scannen.
  const auth = await getUserAuth(req);
  if (!auth.ok) {
    return new Response(
      JSON.stringify({ error: auth.error }),
      { status: auth.status, headers: { ...cors, "content-type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const fileBase64: string | undefined = body.file_base64;
    const mimeType: string | undefined = body.mime_type;
    const tenantId: string | undefined = body.tenant_id;

    if (!fileBase64 || !mimeType || !tenantId) {
      return new Response(
        JSON.stringify({ error: "file_base64, mime_type en tenant_id zijn verplicht" }),
        { status: 400, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    // Cross-tenant blokkeren: tenant_id in body moet matchen met token.
    if (tenantId !== auth.tenantId) {
      return new Response(
        JSON.stringify({ error: "Forbidden: tenant mismatch" }),
        { status: 403, headers: { ...cors, "content-type": "application/json" } },
      );
    }
    if (fileBase64.length > 14 * 1024 * 1024) {
      // ~10MB binary wordt ~13.5MB base64; geef een nette fout boven 14MB.
      return new Response(
        JSON.stringify({ error: "Bestand te groot voor AI-scan" }),
        { status: 413, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const types = await loadDocumentTypes(tenantId);
    if (types.length === 0) {
      return new Response(
        JSON.stringify({ error: "Geen voertuig-documenttypes geconfigureerd voor deze tenant" }),
        { status: 400, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const geminiBody = {
      systemInstruction: { parts: [{ text: buildPrompt(types) }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: fileBase64,
              },
            },
            { text: "Extract de velden uit dit voertuig-document." },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema,
      },
    };

    const resp = await fetchWithRetry(geminiUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("Gemini error", resp.status, text);
      return new Response(
        JSON.stringify({ error: "AI-scan mislukt, vul handmatig aan" }),
        { status: 502, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const json = await resp.json();
    const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) {
      return new Response(
        JSON.stringify({ error: "AI gaf geen resultaat" }),
        { status: 502, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    let parsed: ExtractResult;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("JSON parse failed", e, raw);
      return new Response(
        JSON.stringify({ error: "AI-antwoord niet leesbaar" }),
        { status: 502, headers: { ...cors, "content-type": "application/json" } },
      );
    }

    const result: ExtractResult = {
      doc_type: validateCode(parsed.doc_type, types),
      issued_date: normaliseDate(parsed.issued_date),
      expiry_date: normaliseDate(parsed.expiry_date),
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (err) {
    console.error("extract-vehicle-document error", err);
    return new Response(
      JSON.stringify({ error: "Onbekende fout" }),
      { status: 500, headers: { ...cors, "content-type": "application/json" } },
    );
  }
});
