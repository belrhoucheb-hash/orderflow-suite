import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Fields we consider "required" for a complete transport order
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
    if (val === undefined || val === null || val === "" || val === 0) {
      missing.push(label);
    }
  }
  return missing;
}

function generateFollowUpDraft(
  missing: string[],
  extracted: Record<string, any>,
  senderEmail: string | null
): string {
  if (missing.length === 0) return "";

  const missingList = missing.map((f) => `  • ${f}`).join("\n");
  const clientName = extracted.client_name || "Geachte heer/mevrouw";

  return `Beste ${clientName},

Bedankt voor uw transportaanvraag. Wij hebben uw order ontvangen maar missen nog de volgende gegevens om uw transport correct in te plannen:

${missingList}

Kunt u deze informatie zo spoedig mogelijk aanleveren? Dan plannen wij uw transport direct in.

Met vriendelijke groet,
Royalty Cargo Planning`;
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { emailBody, pdfUrls } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const hasPdfs = pdfUrls && Array.isArray(pdfUrls) && pdfUrls.length > 0;
    const hasEmail = !!emailBody;

    // Build multimodal content parts
    const userContent: any[] = [];

    if (emailBody) {
      userContent.push({ type: "text", text: `E-MAIL BODY:\n${emailBody}` });
    }

    // Fetch and encode PDF files from storage as base64 for Gemini multimodal
    if (hasPdfs) {
      for (const url of pdfUrls) {
        try {
          console.log("Fetching PDF from:", url);
          const pdfResp = await fetch(url);
          if (!pdfResp.ok) {
            console.error("Failed to fetch PDF:", pdfResp.status);
            userContent.push({ type: "text", text: `[PDF kon niet worden opgehaald: ${url}]` });
            continue;
          }
          const pdfBuffer = await pdfResp.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(pdfBuffer).reduce((s, b) => s + String.fromCharCode(b), "")
          );
          console.log(`PDF fetched, size: ${pdfBuffer.byteLength} bytes`);
          userContent.push({
            type: "image_url",
            image_url: { url: `data:application/pdf;base64,${base64}` },
          });
          userContent.push({ type: "text", text: "Analyseer bovenstaand PDF document en extraheer alle ordergegevens." });
        } catch (e) {
          console.error("PDF fetch error:", e);
          userContent.push({ type: "text", text: `[Fout bij ophalen PDF: ${e}]` });
        }
      }
    }

    if (userContent.length === 0) {
      return new Response(
        JSON.stringify({ error: "Geen e-mail of PDF content meegegeven" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build source-aware system prompt
    const sourceInstructions = hasPdfs && hasEmail
      ? `Je hebt TWEE bronnen: een e-mail body EN een of meer PDF-bijlagen.
Voor elk veld dat je extraheert, geef aan uit welke bron het komt:
- "email" als het veld uit de e-mail tekst komt
- "pdf" als het veld uit de PDF-bijlage komt
- "both" als het in beide bronnen staat (gebruik dan de meest complete waarde)`
      : hasPdfs
      ? `Je hebt alleen PDF-bijlagen als bron. Alle velden komen uit "pdf".`
      : `Je hebt alleen een e-mail als bron. Alle velden komen uit "email".`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content: `Je bent een logistiek data-extractie assistent voor een Transport Management Systeem (TMS) in Nederland.
Je analyseert e-mails en PDF-bijlagen (zoals paklijsten, vrachtbrieven, CMR documenten) en extraheert gestructureerde ordergegevens.

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
            {
              role: "user",
              content: userContent,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_order_data",
                description:
                  "Extract structured order data from email and/or PDF content, including source tracking per field",
                parameters: {
                  type: "object",
                  properties: {
                    client_name: {
                      type: "string",
                      description: "Naam van de klant/afzender",
                    },
                    transport_type: {
                      type: "string",
                      enum: ["direct", "warehouse-air"],
                    },
                    pickup_address: {
                      type: "string",
                      description: "Volledig ophaaladres",
                    },
                    delivery_address: {
                      type: "string",
                      description: "Volledig afleveradres",
                    },
                    quantity: { type: "number", description: "Aantal eenheden" },
                    unit: {
                      type: "string",
                      enum: ["Pallets", "Colli", "Box"],
                    },
                    weight_kg: {
                      type: "number",
                      description: "Gewicht in kg (per eenheid of totaal)",
                    },
                    is_weight_per_unit: {
                      type: "boolean",
                      description: "Is het gewicht per eenheid?",
                    },
                    dimensions: {
                      type: "string",
                      description: "Afmetingen in LxBxH cm",
                    },
                    requirements: {
                      type: "array",
                      items: {
                        type: "string",
                        enum: ["Koeling", "ADR", "Laadklep", "Douane"],
                      },
                      description: "Speciale vereisten",
                    },
                    confidence_score: {
                      type: "number",
                      description:
                        "Hoe zeker ben je over de extractie (0-100)",
                    },
                    field_sources: {
                      type: "object",
                      description: "Per veld de bron: 'email', 'pdf', of 'both'",
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
                      additionalProperties: false,
                    },
                  },
                  required: [
                    "client_name",
                    "transport_type",
                    "pickup_address",
                    "delivery_address",
                    "quantity",
                    "unit",
                    "weight_kg",
                    "is_weight_per_unit",
                    "dimensions",
                    "requirements",
                    "confidence_score",
                    "field_sources",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "extract_order_data" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Te veel verzoeken, probeer het later opnieuw." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Krediet op, voeg tegoed toe aan je workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI parsing mislukt" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ error: "Geen data geëxtraheerd" }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    // Detect missing fields and generate follow-up draft
    const missingFields = detectMissingFields(extracted);
    const followUpDraft = generateFollowUpDraft(missingFields, extracted, null);

    return new Response(JSON.stringify({ 
      extracted,
      missing_fields: missingFields,
      follow_up_draft: followUpDraft,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-order error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
