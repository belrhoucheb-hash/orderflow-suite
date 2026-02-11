import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { emailBody, pdfText } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const contentParts: string[] = [];
    if (emailBody) contentParts.push(`E-MAIL BODY:\n${emailBody}`);
    if (pdfText) contentParts.push(`PDF BIJLAGE INHOUD:\n${pdfText}`);

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
              content: contentParts.join("\n\n---\n\n"),
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "extract_order_data",
                description:
                  "Extract structured order data from email and/or PDF content",
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

    return new Response(JSON.stringify({ extracted }), {
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
