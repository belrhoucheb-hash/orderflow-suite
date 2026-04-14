import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Twilio WhatsApp Webhook handler.
 *
 * Twilio sends incoming WhatsApp messages as application/x-www-form-urlencoded
 * with fields: From, To, Body, MessageSid, etc.
 *
 * This endpoint handles CEO replies: JA, NEE, AANPASSEN.
 */

/**
 * Validate Twilio webhook signature (X-Twilio-Signature).
 * Uses HMAC-SHA1 as per Twilio docs.
 */
async function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): Promise<boolean> {
  // Build data string: URL + sorted params key+value
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return computed === signature;
}

/**
 * Send a WhatsApp reply via Twilio.
 */
async function sendWhatsAppReply(params: {
  to: string;
  body: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}): Promise<void> {
  const { to, body, accountSid, authToken, fromNumber } = params;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const formData = new URLSearchParams({
    To: to,
    From: fromNumber,
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
    console.error(`Twilio reply failed (${resp.status}): ${errBody}`);
  }
}

serve(async (req) => {
  // Twilio sends POST with form data
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioFrom = Deno.env.get("TWILIO_WHATSAPP_FROM");
    const ceoPhone = Deno.env.get("CEO_WHATSAPP_NUMBER");
    const webhookUrl = Deno.env.get("TWILIO_WEBHOOK_URL");

    if (!twilioToken || !twilioSid || !twilioFrom) {
      console.error("Twilio env vars missing");
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Parse form data from Twilio
    const formData = await req.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    const from = params["From"] ?? "";
    const body = (params["Body"] ?? "").trim();
    const messageSid = params["MessageSid"] ?? "";

    // Validate Twilio signature if webhook URL is configured
    if (webhookUrl) {
      const signature = req.headers.get("X-Twilio-Signature") ?? "";
      const valid = await validateTwilioSignature(
        twilioToken,
        signature,
        webhookUrl,
        params
      );
      if (!valid) {
        console.error("Invalid Twilio signature");
        return new Response("<Response></Response>", {
          status: 403,
          headers: { "Content-Type": "text/xml" },
        });
      }
    }

    // Only process messages from CEO
    const ceoWhatsApp = ceoPhone?.startsWith("whatsapp:")
      ? ceoPhone
      : `whatsapp:${ceoPhone}`;

    if (from !== ceoWhatsApp) {
      console.log(`Ignored message from non-CEO: ${from}`);
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the most recent PENDING approval
    const { data: pending, error: fetchErr } = await supabase
      .from("marketing_approvals")
      .select("*")
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      console.error("DB fetch error:", fetchErr);
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (!pending) {
      await sendWhatsAppReply({
        to: from,
        body: "Geen content die op goedkeuring wacht.",
        accountSid: twilioSid,
        authToken: twilioToken,
        fromNumber: twilioFrom,
      });
      return new Response("<Response></Response>", {
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Parse the CEO's reply
    const reply = body.toUpperCase();

    if (reply === "JA") {
      // ─── APPROVED ────────────────────────────────────
      await supabase
        .from("marketing_approvals")
        .update({
          status: "APPROVED",
          decided_at: new Date().toISOString(),
        })
        .eq("id", pending.id);

      await sendWhatsAppReply({
        to: from,
        body: `Goedgekeurd. ${pending.skill_name} content wordt gepubliceerd op ${pending.channel}.`,
        accountSid: twilioSid,
        authToken: twilioToken,
        fromNumber: twilioFrom,
      });
    } else if (reply === "NEE") {
      // ─── REJECTED ────────────────────────────────────
      await supabase
        .from("marketing_approvals")
        .update({
          status: "REJECTED",
          decided_at: new Date().toISOString(),
        })
        .eq("id", pending.id);

      await sendWhatsAppReply({
        to: from,
        body: "Weggegooid. Geen actie.",
        accountSid: twilioSid,
        authToken: twilioToken,
        fromNumber: twilioFrom,
      });
    } else if (reply === "AANPASSEN" || reply.startsWith("AANPASSEN")) {
      // ─── ADJUST ──────────────────────────────────────
      // Extract feedback after "AANPASSEN" if provided
      const feedback = body.length > "AANPASSEN".length
        ? body.substring("AANPASSEN".length).trim()
        : null;

      await supabase
        .from("marketing_approvals")
        .update({
          status: "ADJUST",
          decided_at: new Date().toISOString(),
          feedback: feedback,
        })
        .eq("id", pending.id);

      if (feedback) {
        await sendWhatsAppReply({
          to: from,
          body: `Wordt aangepast met je feedback: "${feedback}". Nieuwe versie komt eraan.`,
          accountSid: twilioSid,
          authToken: twilioToken,
          fromNumber: twilioFrom,
        });
      } else {
        await sendWhatsAppReply({
          to: from,
          body: "Wat wil je aanpassen? Stuur je feedback.",
          accountSid: twilioSid,
          authToken: twilioToken,
          fromNumber: twilioFrom,
        });
      }
    } else {
      // ─── UNKNOWN ─────────────────────────────────────
      await sendWhatsAppReply({
        to: from,
        body: `Content wacht op goedkeuring (${pending.skill_name}).\n\nJA = publiceren\nNEE = weggooien\nAANPASSEN = opnieuw genereren`,
        accountSid: twilioSid,
        authToken: twilioToken,
        fromNumber: twilioFrom,
      });
    }

    // Twilio expects TwiML response (empty is fine)
    return new Response("<Response></Response>", {
      headers: { "Content-Type": "text/xml" },
    });
  } catch (e) {
    console.error("whatsapp-webhook error:", e);
    return new Response("<Response></Response>", {
      status: 500,
      headers: { "Content-Type": "text/xml" },
    });
  }
});
