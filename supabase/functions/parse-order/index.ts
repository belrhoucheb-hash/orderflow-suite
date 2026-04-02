import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Retry helper with exponential backoff for 429 errors ──
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const resp = await fetch(url, options);
    if (resp.status === 429 && attempt < maxRetries) {
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      console.warn(`429 rate-limited, retrying in ${Math.round(backoff)}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }
    return resp;
  }
  // Should never reach here, but satisfy TS
  return fetch(url, options);
}

// ── Gemini API helper ──
function geminiUrl(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
}

function buildGeminiBody(systemPrompt: string, userText: string, jsonSchema?: Record<string, any>) {
  const body: any = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userText }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };
  if (jsonSchema) {
    body.generationConfig.responseSchema = jsonSchema;
  }
  return body;
}

function parseGeminiResponse(json: any): string | null {
  return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
}

const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "client_name", label: "Klantnaam" },
  { key: "pickup_address", label: "Ophaaladres" },
  { key: "delivery_address", label: "Afleveradres" },
  { key: "quantity", label: "Aantal" },
  { key: "weight_kg", label: "Gewicht" },
  { key: "dimensions", label: "Afmetingen (LxBxH)" },
];

function detectMissingFields(extracted: Record<string, any>): string[] {
  const missing: string[] = [];
  for (const { key, label } of REQUIRED_FIELDS) {
    const val = extracted[key];
    if (val === undefined || val === null || val === "" || val === 0) missing.push(label);
  }
  return missing;
}

function generateFollowUpDraft(missing: string[], extracted: Record<string, any>): string {
  if (missing.length === 0) return "";
  const missingList = missing.map((f) => `  • ${f}`).join("\n");
  const clientName = extracted.client_name || "Geachte heer/mevrouw";

  // Build a summary of what WAS understood to make the mail more personal
  const understood: string[] = [];
  if (extracted.quantity && extracted.unit) understood.push(`${extracted.quantity} ${extracted.unit}`);
  else if (extracted.quantity) understood.push(`${extracted.quantity} stuks`);
  if (extracted.delivery_address) understood.push(`levering naar ${extracted.delivery_address}`);
  if (extracted.pickup_address) understood.push(`ophalen bij ${extracted.pickup_address}`);
  if (extracted.requirements?.length > 0) understood.push(`vereisten: ${extracted.requirements.join(", ")}`);

  const understoodText = understood.length > 0
    ? `Wij hebben uw aanvraag voor ${understood.join(", ")} ontvangen.`
    : `Wij hebben uw transportaanvraag ontvangen.`;

  return `Beste ${clientName},\n\n${understoodText} Om dit correct in te plannen hebben wij nog het volgende nodig:\n\n${missingList}\n\nKunt u deze informatie zo spoedig mogelijk aanleveren? Dan plannen wij uw transport direct in.\n\nMet vriendelijke groet,\nRoyalty Cargo Planning`;
}

// ── Anomaly detection against client history ──
interface ClientStats {
  avg_weight: number;
  min_weight: number;
  max_weight: number;
  avg_quantity: number;
  order_count: number;
}

function detectAnomalies(
  extracted: Record<string, any>,
  clientStats: ClientStats | null
): { field: string; value: number; avg_value: number; message: string }[] {
  if (!clientStats || clientStats.order_count < 3) return [];
  const anomalies: { field: string; value: number; avg_value: number; message: string }[] = [];

  if (extracted.weight_kg && clientStats.avg_weight > 0) {
    const ratio = extracted.weight_kg / clientStats.avg_weight;
    if (ratio > 3 || ratio < 0.2) {
      anomalies.push({
        field: "weight_kg",
        value: extracted.weight_kg,
        avg_value: Math.round(clientStats.avg_weight),
        message: `Gewicht ${extracted.weight_kg}kg wijkt sterk af van gemiddelde (${Math.round(clientStats.avg_weight)}kg) voor deze klant`,
      });
    }
  }

  if (extracted.quantity && clientStats.avg_quantity > 0) {
    const ratio = extracted.quantity / clientStats.avg_quantity;
    if (ratio > 4 || ratio < 0.15) {
      anomalies.push({
        field: "quantity",
        value: extracted.quantity,
        avg_value: Math.round(clientStats.avg_quantity),
        message: `Aantal ${extracted.quantity} wijkt sterk af van gemiddelde (${Math.round(clientStats.avg_quantity)}) voor deze klant`,
      });
    }
  }

  return anomalies;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { emailBody, pdfUrls, threadContext, tenantId } = await req.json();

    let tenantIdStr = tenantId;
    if (!tenantIdStr) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            const payload = JSON.parse(atob(parts[1]));
            tenantIdStr = payload.app_metadata?.tenant_id;
          } catch (e) {}
        }
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const hasPdfs = pdfUrls && Array.isArray(pdfUrls) && pdfUrls.length > 0;
    const hasEmail = !!emailBody;

    // ── Fetch AI corrections & patterns for known clients ──
    let aiContextBlock = "";
    const senderHint = emailBody?.match(/(?:van|from|afzender)[:\s]*([^\n<]+)/i)?.[1]?.trim() || "";

    async function fetchCorrections(clientName: string): Promise<string> {
      if (!clientName) return "";
      try {
        const { data } = await supabase
          .from("ai_corrections")
          .select("field_name, ai_value, corrected_value")
          .ilike("client_name", `%${clientName}%`)
          .order("created_at", { ascending: false })
          .limit(15);
        if (!data || data.length === 0) return "";
        const lines = data.map(c =>
          `- Veld "${c.field_name}": AI zei "${c.ai_value}" → dispatcher corrigeerde naar "${c.corrected_value}"`
        );
        return `\nHISTORISCHE CORRECTIES VOOR DEZE KLANT (pas deze toe!):\n${lines.join("\n")}`;
      } catch { return ""; }
    }

    async function fetchPatterns(): Promise<string> {
      try {
        const { data } = await supabase
          .from("orders")
          .select("client_name, pickup_address, delivery_address")
          .not("confidence_score", "is", null)
          .gte("confidence_score", 80)
          .neq("status", "CANCELLED")
          .order("created_at", { ascending: false })
          .limit(30);
        if (!data || data.length < 3) return "";
        const addressMap: Record<string, Set<string>> = {};
        data.forEach(o => {
          const name = o.client_name || "";
          if (!addressMap[name]) addressMap[name] = new Set();
          if (o.pickup_address) addressMap[name].add(`ophaal: ${o.pickup_address}`);
          if (o.delivery_address) addressMap[name].add(`lever: ${o.delivery_address}`);
        });
        const patterns = Object.entries(addressMap)
          .filter(([_, addrs]) => addrs.size >= 2)
          .slice(0, 5)
          .map(([name, addrs]) => `- ${name}: ${[...addrs].slice(0, 3).join(", ")}`)
          .join("\n");
        if (!patterns) return "";
        return `\nBEKENDE KLANT-ADRESSEN (gebruik deze als de email vaag is):\n${patterns}`;
      } catch { return ""; }
    }

    // Pre-fetch patterns (corrections will be fetched after extraction if client unknown)
    const patternsPromise = fetchPatterns();

    // ── Step 1: Thread intent classification (if email body exists) ──
    let threadType = "new";
    let changes: { field: string; old_value: string; new_value: string }[] = [];

    if (hasEmail && threadContext?.parentOrder) {
      // We have a parent order — classify the intent
      try {
        const classifySystemPrompt = `Je bent een e-mail thread classifier voor een transport/logistiek bedrijf.
Analyseer de e-mail en bepaal het type:
- "update": klant wil een bestaande order wijzigen (gewicht, adres, aantal, datum, etc.)
- "cancellation": klant wil annuleren
- "confirmation": klant bevestigt de order
- "question": klant stelt een vraag
- "new": dit is een nieuwe/aparte order

Als het een "update" is, identificeer dan ook welke velden gewijzigd worden.

Bestaande ordergegevens:
- Klant: ${threadContext.parentOrder.client_name || "onbekend"}
- Gewicht: ${threadContext.parentOrder.weight_kg || "onbekend"} kg
- Aantal: ${threadContext.parentOrder.quantity || "onbekend"} ${threadContext.parentOrder.unit || ""}
- Ophaaladres: ${threadContext.parentOrder.pickup_address || "onbekend"}
- Afleveradres: ${threadContext.parentOrder.delivery_address || "onbekend"}

Antwoord als JSON: {"thread_type": "update|cancellation|confirmation|question|new", "changes": [{"field": "...", "old_value": "...", "new_value": "..."}]}`;

        const classifyResp = await fetchWithRetry(geminiUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildGeminiBody(classifySystemPrompt, emailBody)),
        });

        if (classifyResp.ok) {
          const classResult = await classifyResp.json();
          
          // Log AI Usage
          const usage = classResult.usageMetadata;
          if (usage && tenantId) {
            const inputTokens = usage.promptTokenCount || 0;
            const outputTokens = usage.candidatesTokenCount || 0;
            const cost = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.3;
            // Best effort insert without awaiting to keep function fast
            supabase.from("ai_usage_log").insert({
              tenant_id: tenantId,
              function_name: "parse-order-classify",
              model: "gemini-2.5-flash",
              input_tokens: inputTokens,
              output_tokens: outputTokens,
              cost_estimate: cost
            }).then();
          }

          const text = parseGeminiResponse(classResult);
          if (text) {
            const parsed = JSON.parse(text);
            threadType = parsed.thread_type || "new";
            changes = parsed.changes || [];
          }
        } else {
          await classifyResp.text();
        }
      } catch (e) {
        console.error("Thread classification error:", e);
      }
    }

    // ── Step 2: Data extraction ──
    const userContent: any[] = [];
    if (emailBody) userContent.push({ type: "text", text: `E-MAIL BODY:\n${emailBody}` });

    if (hasPdfs) {
      for (const url of pdfUrls) {
        try {
          const pdfResp = await fetch(url);
          if (!pdfResp.ok) { userContent.push({ type: "text", text: `[PDF kon niet worden opgehaald: ${url}]` }); continue; }
          const pdfBuffer = await pdfResp.arrayBuffer();
          const base64 = btoa(new Uint8Array(pdfBuffer).reduce((s, b) => s + String.fromCharCode(b), ""));
          userContent.push({ type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } });
          userContent.push({ type: "text", text: "Analyseer bovenstaand PDF document en extraheer alle ordergegevens." });
        } catch (e) {
          userContent.push({ type: "text", text: `[Fout bij ophalen PDF: ${e}]` });
        }
      }
    }

    if (userContent.length === 0) {
      return new Response(JSON.stringify({ error: "Geen e-mail of PDF content meegegeven" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sourceInstructions = hasPdfs && hasEmail
      ? `Je hebt TWEE bronnen: een e-mail body EN een of meer PDF-bijlagen. Voor elk veld dat je extraheert, geef aan uit welke bron het komt: "email", "pdf", of "both".`
      : hasPdfs ? `Alle velden komen uit "pdf".` : `Alle velden komen uit "email".`;

    // Fetch corrections if we know the client from thread context
    const knownClient = threadContext?.parentOrder?.client_name || senderHint || "";
    const [correctionsBlock, patternsBlock] = await Promise.all([
      fetchCorrections(knownClient),
      patternsPromise,
    ]);
    aiContextBlock = correctionsBlock + patternsBlock;

    const extractionSystemPrompt = `Je bent een logistiek data-extractie assistent voor een Transport Management Systeem (TMS) in Nederland.
Je analyseert e-mails en PDF-bijlagen en extraheert gestructureerde ordergegevens.

${sourceInstructions}

Regels:
- Gebruik altijd Nederlandse plaatsnamen waar mogelijk
- Gewicht altijd in kg (als gewicht per stuk/pallet vermeld wordt, bereken het totaal OF zet is_weight_per_unit op true)
- Afmetingen in cm formaat: LxBxH
- Transport type: "direct" of "warehouse-air"
- Unit: map naar een van deze waarden:
  - "Pallets" (ook: europallets, blokpallets, pallets, pallet, plt)
  - "Colli" (ook: dozen, pakken, stuks, stuks, collo, kartons, kratten)
  - "Box" (ook: container, rolcontainer, kist, bak)
  BELANGRIJK: Kies ALTIJD de best passende unit. Laat dit NOOIT leeg.
- Requirements: kies uit ["Koeling", "ADR", "Laadklep", "Douane"]
  - "Koeling" als er gekoeld/koel/temperatuur/graden wordt genoemd
  - "ADR" als er gevaarlijke stoffen/chemisch/ADR wordt genoemd
  - "Laadklep" als er laadklep/klep/heftruck nodig/geen dock wordt genoemd
  - "Douane" als er douane/customs/invoer/uitvoer wordt genoemd
- Als een veld ECHT niet gevonden kan worden, geef een lege string of 0 terug
- confidence_score: 0-100, hoe zeker je bent over de extractie
- BELANGRIJK: Extraheer ALLES wat je kunt vinden. Laat liever geen veld leeg als er informatie beschikbaar is.
${aiContextBlock}
Antwoord als JSON met deze velden:
{
  "client_name": "string",
  "transport_type": "direct|warehouse-air",
  "pickup_address": "string",
  "delivery_address": "string",
  "quantity": number,
  "unit": "Pallets|Colli|Box",
  "weight_kg": number,
  "is_weight_per_unit": boolean,
  "dimensions": "string (LxBxH in cm)",
  "requirements": ["Koeling"|"ADR"|"Laadklep"|"Douane"],
  "confidence_score": number (0-100),
  "field_sources": { "client_name": "email|pdf|both", "transport_type": "email|pdf|both", ... }
}`;

    // Build the user content as a single text string for Gemini
    const userTextParts: string[] = [];
    for (const part of userContent) {
      if (part.type === "text") userTextParts.push(part.text);
      else if (part.type === "image_url") userTextParts.push("[PDF bijlage - inhoud wordt meegestuurd als tekst indien beschikbaar]");
    }

    const response = await fetchWithRetry(geminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiBody(extractionSystemPrompt, userTextParts.join("\n\n"))),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Te veel verzoeken" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("Gemini API error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI parsing mislukt" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();

    // Log AI Usage
    const usage = result.usageMetadata;
    if (usage && tenantId) {
      const inputTokens = usage.promptTokenCount || 0;
      const outputTokens = usage.candidatesTokenCount || 0;
      const cost = (inputTokens / 1_000_000) * 0.075 + (outputTokens / 1_000_000) * 0.3;
      await supabase.from("ai_usage_log").insert({
        tenant_id: tenantId,
        function_name: "parse-order",
        model: "gemini-2.5-flash",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_estimate: cost
      });
    }

    const extractedText = parseGeminiResponse(result);
    if (!extractedText) {
      return new Response(JSON.stringify({ error: "Geen data geëxtraheerd" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const extracted = JSON.parse(extractedText);

    // ── Step 3: Anomaly detection against client history ──
    let anomalies: { field: string; value: number; avg_value: number; message: string }[] = [];
    const clientName = extracted.client_name;
    if (clientName) {
      try {
        const { data: history } = await supabase
          .from("orders")
          .select("weight_kg, quantity")
          .ilike("client_name", clientName)
          .not("weight_kg", "is", null)
          .neq("status", "CANCELLED")
          .limit(50);

        if (history && history.length >= 3) {
          const weights = history.map((h: any) => h.weight_kg).filter(Boolean);
          const quantities = history.map((h: any) => h.quantity).filter(Boolean);
          const stats: ClientStats = {
            avg_weight: weights.length > 0 ? weights.reduce((a: number, b: number) => a + b, 0) / weights.length : 0,
            min_weight: weights.length > 0 ? Math.min(...weights) : 0,
            max_weight: weights.length > 0 ? Math.max(...weights) : 0,
            avg_quantity: quantities.length > 0 ? quantities.reduce((a: number, b: number) => a + b, 0) / quantities.length : 0,
            order_count: history.length,
          };
          anomalies = detectAnomalies(extracted, stats);
        }
      } catch (e) {
        console.error("Anomaly detection error:", e);
      }
    }

    const missingFields = detectMissingFields(extracted);
    const followUpDraft = generateFollowUpDraft(missingFields, extracted);

    // ── Step 4: Confidence score penalty for missing critical fields ──
    // Critical fields that make an order unplannable if missing
    const CRITICAL_FIELDS = ["pickup_address", "delivery_address", "client_name"];
    const missingCritical = CRITICAL_FIELDS.filter(key => {
      const val = extracted[key];
      return val === undefined || val === null || val === "" || val === 0;
    });
    if (missingCritical.length > 0) {
      // Penalize 15 points per missing critical field, cap at minimum 20
      const penalty = missingCritical.length * 15;
      extracted.confidence_score = Math.max(20, (extracted.confidence_score || 0) - penalty);
    }
    // Also penalize for non-critical missing fields (lighter)
    const nonCriticalMissing = missingFields.filter(f => 
      !CRITICAL_FIELDS.some(cf => REQUIRED_FIELDS.find(rf => rf.key === cf)?.label === f)
    );
    if (nonCriticalMissing.length > 0) {
      const penalty = nonCriticalMissing.length * 5;
      extracted.confidence_score = Math.max(20, (extracted.confidence_score || 0) - penalty);
    }

    return new Response(JSON.stringify({
      extracted,
      missing_fields: missingFields,
      follow_up_draft: followUpDraft,
      thread_type: threadType,
      changes_detected: changes,
      anomalies,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-order error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
