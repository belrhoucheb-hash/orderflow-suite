// Analyze a pre-trip vehicle-check photo.
//
// Input:  { photo_url, side, baseline_photo_url?, baseline_description? }
// Output: { description, diff_vs_baseline, severity: 'none'|'minor'|'blocking', confidence }
//
// Strategy: ask Gemini 2.5 Flash to describe the photo en, als een baseline
// is meegegeven, de verschillen vs. die baseline te rapporteren. We houden de
// prompt strikt zodat het model alleen JSON teruggeeft. Zonder baseline (eerste
// check van een voertuig) is severity altijd 'none'. Gemini geeft ook een
// confidence (0..1) terug; bij lage zekerheid downgraden we een 'blocking'
// severity naar 'minor' om te voorkomen dat een onterechte blocking een hele
// dienst stilzet.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { getUserAuth, isServiceRoleToken } from "../_shared/auth.ts";

// Beperkt SSRF: alleen URLs van de eigen Supabase storage zijn toegestaan.
function isAllowedPhotoUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const supaUrl = Deno.env.get("SUPABASE_URL");
    if (!supaUrl) return false;
    const supaHost = new URL(supaUrl).host;
    return u.host === supaHost && u.pathname.startsWith("/storage/v1/");
  } catch {
    return false;
  }
}

// Retry helper met exponential backoff voor 429 en netwerk-errors.
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      if (resp.status === 429 && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`429 rate-limited, retry in ${Math.round(backoff)}ms (poging ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return resp;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`Netwerk-error, retry in ${Math.round(backoff)}ms (poging ${attempt + 1}/${maxRetries}):`, err);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw lastErr ?? new Error("fetchWithRetry: onverwachte toestand");
}

// API-key hoort niet in de URL, anders lekt hij in error-traces, access-logs
// en exception-stacks. Gemini ondersteunt `x-goog-api-key` als officiele header.
const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

function geminiApiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

async function fetchAsBase64(url: string): Promise<{ data: string; mime: string }> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Kon foto niet ophalen: ${url} (${resp.status})`);
  const mime = resp.headers.get("content-type") || "image/jpeg";
  const buf = await resp.arrayBuffer();
  const data = btoa(new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""));
  return { data, mime };
}

const SYSTEM_PROMPT = `Je bent een schadespecialist voor vrachtwagens. Je analyseert pre-trip voertuigcheck foto's.

BELANGRIJK. Valideer eerst of de foto überhaupt een vrachtwagen of laadruimte toont:
- Als de foto GEEN vrachtwagen, voertuig, laadruimte of cabine-interieur laat zien (bijvoorbeeld een persoon, gezicht, willekeurig object, landschap, plafond, huisdier, ander voertuigtype als personenauto), zet severity op "blocking" en in description "Foto toont geen vrachtwagen, opnieuw maken."
- Als de zichtbare zijde niet matcht met de opgevraagde zijde (bv. gevraagd "front" maar de foto toont duidelijk de achterkant of interieur): zet severity op "blocking" en vermeld de mismatch.

Daarna, als de foto wél een vrachtwagen van de juiste zijde toont:
1. Beschrijf de zichtbare staat (deuken, krassen, vuil, ontbrekende onderdelen, vloeistoflekken, bandenstaat, interieur).
2. Als er een baseline-foto of baseline-beschrijving is meegegeven, vergelijk en beschrijf ALLEEN de verschillen.
3. Bepaal severity:
   - "none": geen relevante verschillen of alleen vuil/stof
   - "minor": nieuwe kleine kras of deuk, cosmetisch, niet veiligheidsrelevant
   - "blocking": structurele schade, gebroken licht/ruit/spiegel, zichtbaar lek, lekke band, ontbrekende veiligheidsuitrusting, of iets dat verzekering/veiligheid raakt

Geef ook een confidence (0..1) die aangeeft hoe zeker je bent van de analyse. Gebruik een lage waarde (< 0.7) bij wazige, donkere of gedeeltelijk afgedekte foto's, of wanneer de schade moeilijk te beoordelen is. Gebruik een hoge waarde (>= 0.85) als de foto scherp is en de situatie duidelijk.

Antwoord ALLEEN als JSON: {"description": "...", "diff_vs_baseline": "..." of null, "severity": "none"|"minor"|"blocking", "confidence": 0.0..1.0}`;

serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req);

  try {
    if (!isServiceRoleToken(req)) {
      const auth = await getUserAuth(req);
      if (!auth.ok) {
        return new Response(JSON.stringify({ error: auth.error }), {
          status: auth.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { photo_url, side, baseline_photo_url, baseline_description } = await req.json();

    if (!photo_url || !side) {
      return new Response(JSON.stringify({ error: "photo_url en side zijn verplicht" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAllowedPhotoUrl(photo_url)) {
      return new Response(JSON.stringify({ error: "photo_url moet een Supabase storage URL zijn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (baseline_photo_url && !isAllowedPhotoUrl(baseline_photo_url)) {
      return new Response(JSON.stringify({ error: "baseline_photo_url moet een Supabase storage URL zijn" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts: any[] = [
      { text: `Zijde: ${side}` },
    ];

    const current = await fetchAsBase64(photo_url);
    parts.push({ text: "HUIDIGE FOTO:" });
    parts.push({ inline_data: { mime_type: current.mime, data: current.data } });

    if (baseline_photo_url) {
      const baseline = await fetchAsBase64(baseline_photo_url);
      parts.push({ text: "BASELINE FOTO (vorige OK-check):" });
      parts.push({ inline_data: { mime_type: baseline.mime, data: baseline.data } });
    } else if (baseline_description) {
      parts.push({ text: `BASELINE BESCHRIJVING (vorige OK-check): ${baseline_description}` });
    } else {
      parts.push({ text: "Geen baseline beschikbaar. Severity is altijd 'none' voor deze foto." });
    }

    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };

    const resp = await fetchWithRetry(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiApiKey(),
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Gemini error:", resp.status, errText);
      return new Response(JSON.stringify({ error: "AI-analyse mislukt", detail: errText }), {
        status: 502,
        headers: { ...corsFor(req), "Content-Type": "application/json" },
      });
    }

    const json = await resp.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text);

    // Normaliseer confidence naar een getal tussen 0 en 1.
    let confidence: number = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));
    parsed.confidence = confidence;

    // Geen baseline: severity 'none' voor normale slijtage/kras-detectie,
    // maar laat 'blocking' staan (foto is geen voertuig / verkeerde zijde /
    // veiligheidsrisico), die validatie is baseline-onafhankelijk.
    if (!baseline_photo_url && !baseline_description) {
      parsed.diff_vs_baseline = null;
      if (parsed.severity !== "blocking") {
        parsed.severity = "none";
      }
    }

    // Downgrade lage-zekerheid blocking naar minor zodat één onzekere call
    // geen hele dienst stilzet. Planner/chauffeur kan handmatig verifiëren.
    if (parsed.severity === "blocking" && confidence < 0.7) {
      parsed.severity = "minor";
      const note = "lage AI-zekerheid, controleer handmatig";
      parsed.diff_vs_baseline = parsed.diff_vs_baseline
        ? `${parsed.diff_vs_baseline} (${note})`
        : note;
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsFor(req), "Content-Type": "application/json" },
    });
  }
});
