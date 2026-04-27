import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { REQUIRED_FIELDS, buildExtractionSystemPrompt, extractionSchema } from "./_prompt.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";

// TODO: replace with tenant_settings lookup when multi-tenant is wired up
const COMPANY_NAME = "Royalty Cargo";

const CORS_OPTIONS = {
  extraHeaders: [
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ],
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
  // Use Flex tier for batch email processing to reduce costs
  return `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-flex:generateContent?key=${key}`;
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

  return `Beste ${clientName},\n\n${understoodText} Om dit correct in te plannen hebben wij nog het volgende nodig:\n\n${missingList}\n\nKunt u deze informatie zo spoedig mogelijk aanleveren? Dan plannen wij uw transport direct in.\n\nMet vriendelijke groet,\n${COMPANY_NAME} Planning`;
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
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  try {
    const { emailBody, pdfUrls, threadContext, tenantId, fewShotExamples } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let tenantIdStr: string | undefined;
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
    const isServiceRoleCall = !!bearerToken && bearerToken === supabaseKey;

    if (isServiceRoleCall) {
      tenantIdStr = tenantId;
    } else {
      if (!bearerToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(bearerToken);
      if (authError || !authUser) {
        return new Response(JSON.stringify({ error: "Ongeldige of verlopen sessie" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const jwtTenantId = authUser.app_metadata?.tenant_id;
      if (!jwtTenantId) {
        return new Response(JSON.stringify({ error: "Missing tenant_id in token" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (tenantId && tenantId !== jwtTenantId) {
        return new Response(JSON.stringify({ error: "tenant_id komt niet overeen met gebruiker" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      tenantIdStr = jwtTenantId;
    }

    const hasPdfs = pdfUrls && Array.isArray(pdfUrls) && pdfUrls.length > 0;
    const hasEmail = !!emailBody;

    // ── Fetch AI corrections & patterns for known clients ──
    let aiContextBlock = "";
    const senderHint = emailBody?.match(/(?:van|from|afzender)[:\s]*([^\n<]+)/i)?.[1]?.trim() || "";

    // Prompt-injection bescherming. DB-waarden (correcties, patterns, templates)
    // worden door gebruikers ingevoerd en komen in de Gemini system-prompt. Een
    // kwaadwillende correctie met backticks of role-overrides zou de prompt
    // kunnen kapen. We escapen backticks en backslashes, strippen null-bytes
    // en kappen op maxLen zodat een lange adversarial string niet de hele
    // prompt kan overschrijven.
    function sanitizePromptString(s: string | null | undefined, maxLen = 500): string {
      if (!s) return "";
      return s
        .replace(/[`\\]/g, "\\$&")
        .replace(/\u0000/g, "")
        .substring(0, maxLen);
    }

    async function fetchCorrections(clientName: string): Promise<string> {
      if (!clientName) return "";
      try {
        let query = supabase
          .from("ai_corrections")
          .select("field_name, ai_value, corrected_value")
          .ilike("client_name", `%${clientName}%`)
          .order("created_at", { ascending: false })
          .limit(15);
        if (tenantIdStr) {
          query = query.eq("tenant_id", tenantIdStr);
        }
        const { data } = await query;
        if (!data || data.length === 0) return "";
        const lines = data.map(c =>
          `- Veld "${sanitizePromptString(c.field_name, 80)}": AI zei "${sanitizePromptString(c.ai_value, 200)}" → dispatcher corrigeerde naar "${sanitizePromptString(c.corrected_value, 200)}"`
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
          const name = sanitizePromptString(o.client_name, 120);
          if (!addressMap[name]) addressMap[name] = new Set();
          if (o.pickup_address) addressMap[name].add(`ophaal: ${sanitizePromptString(o.pickup_address, 200)}`);
          if (o.delivery_address) addressMap[name].add(`lever: ${sanitizePromptString(o.delivery_address, 200)}`);
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

    // ── Fetch client extraction template ──
    async function fetchClientTemplate(clientEmail: string): Promise<string> {
      if (!clientEmail) return "";
      try {
        let query = supabase
          .from("client_extraction_templates")
          .select("field_mappings, success_count")
          .eq("client_email", clientEmail);
        if (tenantIdStr) {
          query = query.eq("tenant_id", tenantIdStr);
        }
        const { data } = await query.limit(1).single();
        if (!data || !data.field_mappings) return "";
        const fm = data.field_mappings as Record<string, any>;
        const parts: string[] = [];
        if (fm.unit) parts.push(sanitizePromptString(fm.unit, 40));
        if (fm.pickup_address) parts.push(`van ${sanitizePromptString(fm.pickup_address, 200)}`);
        if (fm.delivery_address) parts.push(`naar ${sanitizePromptString(fm.delivery_address, 200)}`);
        if (fm.transport_type) parts.push(`type: ${sanitizePromptString(fm.transport_type, 40)}`);
        if (fm.requirements && fm.requirements.length > 0) {
          const reqs = (fm.requirements as unknown[])
            .map((r) => sanitizePromptString(typeof r === "string" ? r : String(r ?? ""), 40))
            .filter(Boolean);
          if (reqs.length > 0) parts.push(`met ${reqs.join(", ")}`);
        }
        if (parts.length === 0) return "";
        const successCount = Number.isFinite(Number(data.success_count)) ? Number(data.success_count) : 0;
        return `\nKLANT TEMPLATE (gebaseerd op ${successCount} eerdere extracties): Deze klant bestelt typisch ${parts.join(", ")}.`;
      } catch {
        return "";
      }
    }

    // ── Upsert client extraction template after successful extraction ──
    async function upsertClientTemplate(
      clientEmail: string,
      extracted: Record<string, any>,
      confidenceScore: number,
    ): Promise<void> {
      if (!clientEmail || !tenantIdStr || confidenceScore < 90) return;
      try {
        // Check if template already exists
        const { data: existing } = await supabase
          .from("client_extraction_templates")
          .select("id, success_count")
          .eq("client_email", clientEmail)
          .eq("tenant_id", tenantIdStr)
          .limit(1)
          .single();

        if (existing) {
          // Template exists — increment count; update mappings every 10th extraction
          const newCount = (existing.success_count || 1) + 1;
          const updatePayload: Record<string, any> = { success_count: newCount };
          if (newCount % 10 === 0) {
            updatePayload.field_mappings = buildFieldMappings(extracted);
          }
          await supabase
            .from("client_extraction_templates")
            .update(updatePayload)
            .eq("id", existing.id);
        } else {
          // No template yet — check if client has 5+ successful extractions
          const { count } = await supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .ilike("client_name", extracted.client_name || "")
            .gte("confidence_score", 90)
            .neq("status", "CANCELLED");

          if ((count || 0) >= 5) {
            await supabase
              .from("client_extraction_templates")
              .insert({
                tenant_id: tenantIdStr,
                client_email: clientEmail,
                field_mappings: buildFieldMappings(extracted),
                success_count: count || 5,
              });
          }
        }
      } catch (e) {
        console.error("Template upsert error:", e);
      }
    }

    function buildFieldMappings(extracted: Record<string, any>): Record<string, any> {
      return {
        pickup_address: extracted.pickup_address || null,
        delivery_address: extracted.delivery_address || null,
        unit: extracted.unit || null,
        transport_type: extracted.transport_type || null,
        requirements: extracted.requirements || [],
      };
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
              model: "gemini-2.5-flash-flex",
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

    // Fetch corrections and template if we know the client from thread context
    const knownClient = threadContext?.parentOrder?.client_name || senderHint || "";
    // Extract email from sender hint or thread context for template lookup
    const clientEmail = emailBody?.match(/(?:van|from|afzender)[:\s]*[^<]*<([^>]+)>/i)?.[1]?.trim()
      || emailBody?.match(/(?:van|from|afzender)[:\s]*(\S+@\S+)/i)?.[1]?.trim()
      || "";
    const [correctionsBlock, patternsBlock, templateBlock] = await Promise.all([
      fetchCorrections(knownClient),
      patternsPromise,
      fetchClientTemplate(clientEmail),
    ]);
    aiContextBlock = correctionsBlock + patternsBlock + templateBlock;
    // Append client-side few-shot examples from the AI feedback loop (if provided)
    if (fewShotExamples && typeof fewShotExamples === "string" && fewShotExamples.length > 0) {
      aiContextBlock += "\n\n" + fewShotExamples;
    }

    const extractionSystemPrompt = buildExtractionSystemPrompt({
      today: new Date().toISOString().split("T")[0],
      sourceInstructions,
      aiContextBlock,
    });
    // Build the user content as a single text string for Gemini
    const userTextParts: string[] = [];
    for (const part of userContent) {
      if (part.type === "text") userTextParts.push(part.text);
      else if (part.type === "image_url") userTextParts.push("[PDF bijlage - inhoud wordt meegestuurd als tekst indien beschikbaar]");
    }

    const response = await fetchWithRetry(geminiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildGeminiBody(extractionSystemPrompt, userTextParts.join("\n\n"), extractionSchema)),
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
        model: "gemini-2.5-flash-flex",
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_estimate: cost
      });
    }

    const extractedText = parseGeminiResponse(result);
    if (!extractedText) {
      return new Response(JSON.stringify({ error: "Geen data geëxtraheerd" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let extracted: any;
    try {
      extracted = JSON.parse(extractedText);
    } catch (parseErr) {
      console.error("JSON parse error on AI output:", parseErr, "Raw text:", extractedText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "AI retourneerde ongeldig JSON", raw_text: extractedText.substring(0, 1000) }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Normalise confidence_score: AI may return 0-1 float instead of 0-100 ──
    if (
      typeof extracted.confidence_score === "number" &&
      extracted.confidence_score > 0 &&
      extracted.confidence_score <= 1
    ) {
      extracted.confidence_score = Math.round(extracted.confidence_score * 100);
    }
    // Also normalise field_confidence values
    if (extracted.field_confidence && typeof extracted.field_confidence === "object") {
      for (const key of Object.keys(extracted.field_confidence)) {
        const val = extracted.field_confidence[key];
        if (typeof val === "number" && val > 0 && val <= 1) {
          extracted.field_confidence[key] = Math.round(val * 100);
        }
      }
    }

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

    // ── Step 3b: Apply standard dimensions if derivable ──
    if (!extracted.dimensions || extracted.dimensions === "") {
      const unitLower = (extracted.unit || "").toLowerCase();
      if (unitLower === "pallets" || unitLower === "europallets" || unitLower === "pallet") {
        extracted.dimensions = "120x80x150";
      } else if (unitLower === "box" || unitLower === "rolcontainer") {
        extracted.dimensions = "80x67x170";
      }
    }

    // ── Step 3c: Address validation — detect city-only addresses ──
    const addressContainsStreet = (addr: string | null | undefined): boolean => {
      if (!addr || addr.trim().length === 0) return false;
      // A valid address should contain at least one digit (house number)
      return /\d/.test(addr);
    };

    const incompleteAddresses: string[] = [];
    if (extracted.pickup_address && !addressContainsStreet(extracted.pickup_address)) {
      incompleteAddresses.push("Ophaaladres (alleen stad, geen straat + huisnummer)");
      if (extracted.field_confidence) {
        extracted.field_confidence.pickup_address = Math.min(extracted.field_confidence.pickup_address || 100, 40);
      }
    }
    if (extracted.delivery_address && !addressContainsStreet(extracted.delivery_address)) {
      incompleteAddresses.push("Afleveradres (alleen stad, geen straat + huisnummer)");
      if (extracted.field_confidence) {
        extracted.field_confidence.delivery_address = Math.min(extracted.field_confidence.delivery_address || 100, 40);
      }
    }

    const missingFields = detectMissingFields(extracted);
    // Add incomplete addresses to missing fields
    incompleteAddresses.forEach(ia => {
      if (!missingFields.includes(ia)) missingFields.push(ia);
    });

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

    // Penalize -20 per incomplete (city-only) address
    if (incompleteAddresses.length > 0) {
      const addrPenalty = incompleteAddresses.length * 20;
      extracted.confidence_score = Math.max(20, (extracted.confidence_score || 0) - addrPenalty);
    }

    // Also penalize for non-critical missing fields (lighter)
    // BUT skip "Afmetingen (LxBxH)" if dimensions were derived from standard sizes
    const dimensionsDerived = !!extracted.dimensions && extracted.dimensions !== "";
    const nonCriticalMissing = missingFields.filter(f => {
      // Skip fields that are in CRITICAL_FIELDS
      if (CRITICAL_FIELDS.some(cf => REQUIRED_FIELDS.find(rf => rf.key === cf)?.label === f)) return false;
      // Skip incomplete-address messages (already penalized above)
      if (incompleteAddresses.includes(f)) return false;
      // Skip dimensions if they were derived from standard sizes
      if (f === "Afmetingen (LxBxH)" && dimensionsDerived) return false;
      return true;
    });
    if (nonCriticalMissing.length > 0) {
      const penalty = nonCriticalMissing.length * 5;
      extracted.confidence_score = Math.max(20, (extracted.confidence_score || 0) - penalty);
    }

    // ── Step 5: Upsert client extraction template (fire-and-forget) ──
    if (clientEmail && extracted.confidence_score >= 90) {
      upsertClientTemplate(clientEmail, extracted, extracted.confidence_score).catch(e =>
        console.error("Template upsert background error:", e)
      );
    }

    // ── Step 6: Record AI decision in confidence store (inline) ──
    if (tenantIdStr) {
      const autoApprove = (extracted.confidence_score ?? 0) >= 95 && !!extracted.client_name;
      supabase.from("ai_decisions").insert({
        tenant_id: tenantIdStr,
        decision_type: "order_extraction",
        entity_type: "order",
        confidence_score: extracted.confidence_score ?? 0,
        field_confidences: extracted.field_confidence ?? {},
        ai_suggestion: extracted,
        was_auto_approved: autoApprove,
        model_version: "gemini-2.5-flash-flex",
      }).then(() => {}).catch((e: any) => console.error("Edge confidence store error:", e));
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
