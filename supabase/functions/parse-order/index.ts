import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  return `Beste ${clientName},\n\nBedankt voor uw transportaanvraag. Wij hebben uw order ontvangen maar missen nog de volgende gegevens om uw transport correct in te plannen:\n\n${missingList}\n\nKunt u deze informatie zo spoedig mogelijk aanleveren? Dan plannen wij uw transport direct in.\n\nMet vriendelijke groet,\nRoyalty Cargo Planning`;
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
    const { emailBody, pdfUrls, threadContext } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const hasPdfs = pdfUrls && Array.isArray(pdfUrls) && pdfUrls.length > 0;
    const hasEmail = !!emailBody;

    // ── Step 1: Thread intent classification (if email body exists) ──
    let threadType = "new";
    let changes: { field: string; old_value: string; new_value: string }[] = [];

    if (hasEmail && threadContext?.parentOrder) {
      // We have a parent order — classify the intent
      try {
        const classifyResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content: `Je bent een e-mail thread classifier voor een transport/logistiek bedrijf.
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
- Afleveradres: ${threadContext.parentOrder.delivery_address || "onbekend"}`,
              },
              { role: "user", content: emailBody },
            ],
            tools: [{
              type: "function",
              function: {
                name: "classify_thread",
                description: "Classify email thread intent and detect changes",
                parameters: {
                  type: "object",
                  properties: {
                    thread_type: { type: "string", enum: ["update", "cancellation", "confirmation", "question", "new"] },
                    changes: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          field: { type: "string", description: "Veld dat wijzigt (weight_kg, quantity, pickup_address, delivery_address, requirements, etc.)" },
                          old_value: { type: "string", description: "Oude waarde" },
                          new_value: { type: "string", description: "Nieuwe waarde" },
                        },
                        required: ["field", "old_value", "new_value"],
                      },
                      description: "Gedetecteerde wijzigingen (alleen bij type=update)",
                    },
                  },
                  required: ["thread_type", "changes"],
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "classify_thread" } },
          }),
        });

        if (classifyResp.ok) {
          const classResult = await classifyResp.json();
          const toolCall = classResult.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `Je bent een logistiek data-extractie assistent voor een Transport Management Systeem (TMS) in Nederland.
Je analyseert e-mails en PDF-bijlagen en extraheert gestructureerde ordergegevens.

${sourceInstructions}

Regels:
- Gebruik altijd Nederlandse plaatsnamen waar mogelijk
- Gewicht altijd in kg
- Afmetingen in cm formaat: LxBxH
- Transport type: "direct" of "warehouse-air"
- Unit: "Pallets", "Colli", of "Box"
- Requirements: kies uit ["Koeling", "ADR", "Laadklep", "Douane"]
- Als een veld niet gevonden kan worden, geef een lege string of 0 terug
- confidence_score: 0-100, hoe zeker je bent over de extractie`,
          },
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_order_data",
            description: "Extract structured order data from email and/or PDF content",
            parameters: {
              type: "object",
              properties: {
                client_name: { type: "string" },
                transport_type: { type: "string", enum: ["direct", "warehouse-air"] },
                pickup_address: { type: "string" },
                delivery_address: { type: "string" },
                quantity: { type: "number" },
                unit: { type: "string", enum: ["Pallets", "Colli", "Box"] },
                weight_kg: { type: "number" },
                is_weight_per_unit: { type: "boolean" },
                dimensions: { type: "string" },
                requirements: { type: "array", items: { type: "string", enum: ["Koeling", "ADR", "Laadklep", "Douane"] } },
                confidence_score: { type: "number" },
                field_sources: {
                  type: "object",
                  properties: {
                    client_name: { type: "string", enum: ["email", "pdf", "both"] },
                    transport_type: { type: "string", enum: ["email", "pdf", "both"] },
                    pickup_address: { type: "string", enum: ["email", "pdf", "both"] },
                    delivery_address: { type: "string", enum: ["email", "pdf", "both"] },
                    quantity: { type: "string", enum: ["email", "pdf", "both"] },
                    unit: { type: "string", enum: ["email", "pdf", "both"] },
                    weight_kg: { type: "string", enum: ["email", "pdf", "both"] },
                    dimensions: { type: "string", enum: ["email", "pdf", "both"] },
                    requirements: { type: "string", enum: ["email", "pdf", "both"] },
                  },
                  required: ["client_name", "transport_type", "pickup_address", "delivery_address", "quantity", "unit", "weight_kg", "dimensions", "requirements"],
                },
              },
              required: ["client_name", "transport_type", "pickup_address", "delivery_address", "quantity", "unit", "weight_kg", "is_weight_per_unit", "dimensions", "requirements", "confidence_score", "field_sources"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_order_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Te veel verzoeken" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Krediet op" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI parsing mislukt" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Geen data geëxtraheerd" }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const extracted = JSON.parse(toolCall.function.arguments);

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
