import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Optional imports — these may not be available in all deployments
let recordAIDecision: any = async () => {};
let emitOrderEvent: any = async () => {};
try {
  const cs = await import("../_shared/confidenceStore.ts");
  recordAIDecision = cs.recordAIDecision;
} catch { /* shared module not available */ }
try {
  const ep = await import("../_shared/eventPipeline.ts");
  emitOrderEvent = ep.emitOrderEvent;
} catch { /* shared module not available */ }

// TODO: replace with tenant_settings lookup when multi-tenant is wired up
const COMPANY_NAME = "Royalty Cargo";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
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
  { key: "pickup_date", label: "Ophaaldatum" },
  { key: "delivery_date", label: "Leverdatum" },
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { emailBody, pdfUrls, threadContext, tenantId, fewShotExamples } = await req.json();

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
        if (fm.unit) parts.push(fm.unit);
        if (fm.pickup_address) parts.push(`van ${fm.pickup_address}`);
        if (fm.delivery_address) parts.push(`naar ${fm.delivery_address}`);
        if (fm.transport_type) parts.push(`type: ${fm.transport_type}`);
        if (fm.requirements && fm.requirements.length > 0) parts.push(`met ${fm.requirements.join(", ")}`);
        if (parts.length === 0) return "";
        return `\nKLANT TEMPLATE (gebaseerd op ${data.success_count} eerdere extracties): Deze klant bestelt typisch ${parts.join(", ")}.`;
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

    const extractionSystemPrompt = `Je bent een logistiek data-extractie assistent voor een Transport Management Systeem (TMS) in Nederland.
Je analyseert e-mails en PDF-bijlagen en extraheert gestructureerde ordergegevens.
Vandaag is het ${new Date().toISOString().split("T")[0]}.

${sourceInstructions}

Regels:
- Gebruik altijd Nederlandse plaatsnamen waar mogelijk
- Gewicht altijd in kg (als gewicht per stuk/pallet vermeld wordt, bereken het totaal OF zet is_weight_per_unit op true)
- Afmetingen in cm formaat: LxBxH
- STANDAARD AFMETINGEN (gebruik deze als er geen specifieke afmetingen worden vermeld):
  - Europallet / pallet / EUR-pallet: 120x80x150 cm (LxBxH)
  - Blokpallet / industriepallet: 120x100x150 cm (LxBxH)
  - Rolcontainer / rollcontainer: 80x67x170 cm (LxBxH)
  Als de unit "Pallets" of "europallets" is en er geen afmetingen zijn vermeld, vul dan automatisch "120x80x150" in.
  Als de unit "Box" is en het gaat om een rolcontainer zonder afmetingen, vul dan automatisch "80x67x170" in.
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
- Datums: probeer altijd een datum te extraheren. Als er "morgen", "overmorgen", "donderdag", etc. staat, bereken de juiste ISO 8601 datum op basis van vandaag. Als er geen datum gevonden kan worden, geef een lege string.
- Tijdvenster: als er "voor 12:00", "tussen 8 en 10", "uiterlijk 14:00", etc. staat, extraheer start- en eindtijd in HH:mm formaat. "Voor 14:00" = start leeg, end "14:00". "Tussen 8 en 10" = start "08:00", end "10:00". Als geen tijdvenster gevonden, lege strings.
- Referentienummer: zoek naar ordernummers, PO-nummers, referenties, bestelnummers van de klant. Als niet gevonden, lege string.
- Contactpersoon: naam van contactpersoon bij ophaal of aflevering. Als niet gevonden, lege string.
- Als een veld ECHT niet gevonden kan worden, geef een lege string of 0 terug
- confidence_score: 0-100, hoe zeker je bent over de extractie
- field_confidence: geef naast de totale confidence_score ook een "field_confidence" object mee met PER VELD een score 0-100 die aangeeft hoe zeker je bent over dat specifieke veld. Voorbeeld: "field_confidence": { "client_name": 95, "pickup_address": 80, "delivery_address": 45, "weight_kg": 90, "quantity": 70, "unit": 85, "pickup_date": 60, "delivery_date": 60 }
  - Score 90-100: veld is duidelijk en expliciet vermeld
  - Score 60-89: veld is afgeleid of enigszins onduidelijk
  - Score 0-59: veld is een gok of grotendeels ontbrekend
- ADRESVALIDATIE: Een geldig adres MOET minimaal een straatnaam + huisnummer + stad bevatten. Alleen een stad (bijv. "Groningen", "Amsterdam", "Rotterdam") is GEEN geldig adres. Als alleen een stad wordt gevonden zonder straatnaam en huisnummer, geef het adresveld dan een field_confidence score van maximaal 40. Probeer altijd het volledige adres te extraheren uit de context van de e-mail.
- BELANGRIJK: Extraheer ALLES wat je kunt vinden. Laat liever geen veld leeg als er informatie beschikbaar is.
${aiContextBlock}

VOORBEELD 1:
Input: "Beste, graag 2 pallets (totaal 800kg, 120x80x150cm) ophalen bij Janssen BV, Industrieweg 5 Eindhoven en leveren bij AH DC, Transportweg 10 Zaandam. Graag morgen voor 14:00. Ref: PO-2024-445. Contactpersoon: Piet de Vries."
Output: {"client_name":"Janssen BV","transport_type":"direct","pickup_address":"Industrieweg 5, Eindhoven","delivery_address":"Transportweg 10, Zaandam","pickup_date":"2026-04-03","delivery_date":"2026-04-03","time_window_start":"","time_window_end":"14:00","reference_number":"PO-2024-445","contact_name":"Piet de Vries","quantity":2,"unit":"Pallets","weight_kg":800,"is_weight_per_unit":false,"dimensions":"120x80x150","requirements":[],"confidence_score":95,"field_confidence":{"client_name":98,"pickup_address":95,"delivery_address":95,"quantity":99,"weight_kg":99,"unit":95,"pickup_date":85,"delivery_date":85},"field_sources":{"client_name":"email","pickup_address":"email","delivery_address":"email","pickup_date":"email","delivery_date":"email","time_window_start":"email","time_window_end":"email","reference_number":"email","contact_name":"email","quantity":"email","unit":"email","weight_kg":"email","dimensions":"email"}}

VOORBEELD 2:
Input: "Hallo, wij moeten 5 vaten chemisch afval (ADR klasse 3, totaal 1200kg) laten ophalen bij ons depot in Roosendaal. Afleveradres is ergens in de buurt van Antwerpen, exacte adres volgt nog. Moet gekoeld blijven onder 8 graden. Liefst donderdag tussen 8 en 10 uur 's ochtends. Geen laadperron aanwezig."
Output: {"client_name":"","transport_type":"direct","pickup_address":"Roosendaal","delivery_address":"Antwerpen (exact adres volgt)","pickup_date":"2026-04-03","delivery_date":"2026-04-03","time_window_start":"08:00","time_window_end":"10:00","reference_number":"","contact_name":"","quantity":5,"unit":"Colli","weight_kg":1200,"is_weight_per_unit":false,"dimensions":"","requirements":["Koeling","ADR","Laadklep"],"confidence_score":62,"field_confidence":{"client_name":0,"pickup_address":55,"delivery_address":30,"quantity":95,"weight_kg":90,"unit":70,"pickup_date":75,"delivery_date":75},"field_sources":{"client_name":"email","pickup_address":"email","delivery_address":"email","pickup_date":"email","delivery_date":"email","time_window_start":"email","time_window_end":"email","reference_number":"email","contact_name":"email","quantity":"email","unit":"email","weight_kg":"email","dimensions":"email"}}

Antwoord als JSON met deze velden:
{
  "client_name": "string",
  "transport_type": "direct|warehouse-air",
  "pickup_address": "string",
  "delivery_address": "string",
  "pickup_date": "string (ISO 8601 datum, bijv. 2026-04-03)",
  "delivery_date": "string (ISO 8601 datum, bijv. 2026-04-04)",
  "time_window_start": "string (HH:mm formaat, bijv. 08:00)",
  "time_window_end": "string (HH:mm formaat, bijv. 17:00)",
  "reference_number": "string (klantreferentie indien vermeld)",
  "contact_name": "string (contactpersoon bij ophaal/aflevering)",
  "quantity": number,
  "unit": "Pallets|Colli|Box",
  "weight_kg": number,
  "is_weight_per_unit": boolean,
  "dimensions": "string (LxBxH in cm)",
  "requirements": ["Koeling"|"ADR"|"Laadklep"|"Douane"],
  "confidence_score": number (0-100),
  "field_confidence": { "client_name": number, "pickup_address": number, "delivery_address": number, "quantity": number, "weight_kg": number, "unit": number, "pickup_date": number, "delivery_date": number },
  "field_sources": { "client_name": "email|pdf|both", "pickup_address": "email|pdf|both", "delivery_address": "email|pdf|both", "pickup_date": "email|pdf|both", "delivery_date": "email|pdf|both", "time_window_start": "email|pdf|both", "time_window_end": "email|pdf|both", "reference_number": "email|pdf|both", "contact_name": "email|pdf|both", "quantity": "email|pdf|both", "unit": "email|pdf|both", "weight_kg": "email|pdf|both", "dimensions": "email|pdf|both" }
}`;

    const extractionSchema = {
      type: "OBJECT",
      properties: {
        client_name: { type: "STRING" },
        transport_type: { type: "STRING", enum: ["direct", "warehouse-air"] },
        pickup_address: { type: "STRING" },
        delivery_address: { type: "STRING" },
        pickup_date: { type: "STRING" },
        delivery_date: { type: "STRING" },
        time_window_start: { type: "STRING" },
        time_window_end: { type: "STRING" },
        reference_number: { type: "STRING" },
        contact_name: { type: "STRING" },
        quantity: { type: "NUMBER" },
        unit: { type: "STRING", enum: ["Pallets", "Colli", "Box"] },
        weight_kg: { type: "NUMBER" },
        is_weight_per_unit: { type: "BOOLEAN" },
        dimensions: { type: "STRING" },
        requirements: { type: "ARRAY", items: { type: "STRING", enum: ["Koeling", "ADR", "Laadklep", "Douane"] } },
        confidence_score: { type: "NUMBER" },
        field_confidence: {
          type: "OBJECT",
          properties: {
            client_name: { type: "NUMBER" },
            pickup_address: { type: "NUMBER" },
            delivery_address: { type: "NUMBER" },
            quantity: { type: "NUMBER" },
            weight_kg: { type: "NUMBER" },
            unit: { type: "NUMBER" },
            pickup_date: { type: "NUMBER" },
            delivery_date: { type: "NUMBER" },
          },
        },
        field_sources: { type: "OBJECT", properties: {} },
      },
      required: ["client_name", "confidence_score"],
    };

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

    // ── Step 6: Record AI decision in confidence store ──
    if (tenantIdStr) {
      const autoApprove = (extracted.confidence_score ?? 0) >= 95 && !!extracted.client_name;
      recordAIDecision(supabase, {
        tenantId: tenantIdStr,
        decisionType: "order_extraction",
        entityType: "order",
        confidenceScore: extracted.confidence_score ?? 0,
        fieldConfidences: extracted.field_confidence ?? {},
        aiSuggestion: extracted,
        wasAutoApproved: autoApprove,
        modelVersion: "gemini-2.5-flash",
      }).catch((e) => console.error("Edge confidence store error:", e));
    }

    // ── Step 7: Emit ai_extraction_completed event ──
    // Note: orderId is not available here (the client creates the order first),
    // so the client-side code handles emitEventDirect. This is a fallback if
    // the function is called with an orderId in the body.
    const bodyOrderId = (await req.clone().json().catch(() => ({})))?.orderId;
    if (bodyOrderId && tenantIdStr) {
      emitOrderEvent(supabase, {
        tenantId: tenantIdStr,
        orderId: bodyOrderId,
        eventType: "ai_extraction_completed",
        actorType: "ai",
        confidenceScore: extracted.confidence_score ?? null,
        eventData: { missingFields: missingFields.length, anomalies: anomalies.length },
      }).catch((e) => console.error("Edge event pipeline error:", e));
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
