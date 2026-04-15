import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

interface ApprovalPayload {
  skill_name: string;
  channel: string;
  ads: Array<{
    label: string;
    headline: string;
    primary_text: string;
    cta: string;
    variants: Array<{ name: string; text: string }>;
  }>;
}

/**
 * Build the WhatsApp approval message from structured ad data.
 */
function buildApprovalMessage(payload: ApprovalPayload): string {
  const lines: string[] = [
    `Nieuwe content klaar`,
    ``,
    `Skill: ${payload.skill_name}`,
    `Kanaal: ${payload.channel}`,
    ``,
    `---`,
  ];

  payload.ads.forEach((ad, i) => {
    lines.push(``);
    lines.push(`${i + 1}. ${ad.label}`);
    lines.push(`Headline: ${ad.headline}`);
    lines.push(`CTA: ${ad.cta}`);
    lines.push(``);

    ad.variants.forEach((v) => {
      lines.push(`${v.name}:`);
      lines.push(v.text);
      lines.push(``);
    });

    lines.push(`---`);
  });

  lines.push(``);
  lines.push(`Goedkeuren?`);
  lines.push(``);
  lines.push(`JA = publiceren`);
  lines.push(`NEE = weggooien`);
  lines.push(`AANPASSEN = opnieuw genereren`);

  return lines.join("\n");
}

/**
 * Send a WhatsApp message via Twilio.
 */
async function sendWhatsApp(params: {
  to: string;
  body: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}): Promise<string> {
  const { to, body, accountSid, authToken, fromNumber } = params;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  // Twilio WhatsApp requires whatsapp: prefix
  const toWhatsApp = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const fromWhatsApp = fromNumber.startsWith("whatsapp:")
    ? fromNumber
    : `whatsapp:${fromNumber}`;

  const formData = new URLSearchParams({
    To: toWhatsApp,
    From: fromWhatsApp,
    Body: body,
  });

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
    },
    body: formData.toString(),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Twilio WhatsApp mislukt (${resp.status}): ${errBody}`);
  }

  const result = await resp.json();
  return result.sid as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Auth: accept either Bearer token or x-api-key
    const authHeader = req.headers.get("Authorization");
    const apiKey = req.headers.get("x-api-key");
    const expectedApiKey = Deno.env.get("MARKETING_API_KEY");

    if (apiKey) {
      if (!expectedApiKey || apiKey !== expectedApiKey) {
        return new Response(
          JSON.stringify({ error: "Invalid API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse payload
    const payload: ApprovalPayload = await req.json();

    if (!payload.skill_name || !payload.channel || !payload.ads?.length) {
      return new Response(
        JSON.stringify({ error: "skill_name, channel, and ads[] are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Env vars
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const ceoPhone = Deno.env.get("CEO_WHATSAPP_NUMBER");

    if (!twilioSid || !twilioToken || !twilioFrom) {
      return new Response(
        JSON.stringify({ error: "Twilio WhatsApp not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!ceoPhone) {
      return new Response(
        JSON.stringify({ error: "CEO_WHATSAPP_NUMBER not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build message
    const message = buildApprovalMessage(payload);

    // Store in database
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: approval, error: dbErr } = await supabase
      .from("marketing_approvals")
      .insert({
        skill_name: payload.skill_name,
        channel: payload.channel,
        content: payload.ads,
        status: "PENDING",
        ceo_phone: ceoPhone,
      })
      .select()
      .single();

    if (dbErr) throw dbErr;

    // Send WhatsApp
    const messageSid = await sendWhatsApp({
      to: ceoPhone,
      body: message,
      accountSid: twilioSid,
      authToken: twilioToken,
      fromNumber: twilioFrom,
    });

    return new Response(
      JSON.stringify({
        success: true,
        approval_id: approval.id,
        twilio_sid: messageSid,
        message_preview: message.substring(0, 200) + "...",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("send-approval error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
