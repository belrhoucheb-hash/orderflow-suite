import { supabase } from "@/integrations/supabase/client";
import type { FormState } from "@/components/inbox/types";

// Store a correction when the dispatcher edits an AI-extracted field
export async function saveCorrection(orderId: string, clientName: string, field: string, aiValue: string, correctedValue: string, tenantId?: string) {
  if (!correctedValue || aiValue === correctedValue) return;
  try {
    // Resolve tenant_id: use provided value, or look up from the order
    let resolvedTenantId = tenantId;
    if (!resolvedTenantId) {
      const { data: order } = await supabase
        .from("orders")
        .select("tenant_id")
        .eq("id", orderId)
        .single();
      resolvedTenantId = order?.tenant_id ?? undefined;
    }

    await supabase.from("ai_corrections").insert({
      order_id: orderId,
      client_name: clientName,
      field_name: field,
      ai_value: aiValue,
      corrected_value: correctedValue,
      ...(resolvedTenantId ? { tenant_id: resolvedTenantId } : {}),
    });
  } catch (e) {
    console.error("Failed to save AI correction:", e);
  }
}

// Get recent corrections for a client to include in the AI prompt
export async function getClientCorrections(clientName: string): Promise<string> {
  if (!clientName) return "";
  try {
    const { data } = await supabase
      .from("ai_corrections")
      .select("field_name, ai_value, corrected_value, created_at")
      .ilike("client_name", `%${clientName}%`)
      .order("created_at", { ascending: false })
      .limit(10);

    if (!data || data.length === 0) return "";

    const lines = data.map(c =>
      `- Veld "${c.field_name}": AI zei "${c.ai_value}" → dispatcher corrigeerde naar "${c.corrected_value}"`
    );
    return `\n\nHISTORISCHE CORRECTIES VOOR DEZE KLANT (leer hiervan):\n${lines.join("\n")}`;
  } catch {
    return "";
  }
}

// Get general extraction patterns from recent successful orders
export async function getExtractionPatterns(): Promise<string> {
  try {
    const { data } = await supabase
      .from("orders")
      .select("client_name, pickup_address, delivery_address, quantity, unit, weight_kg, requirements")
      .not("confidence_score", "is", null)
      .gte("confidence_score", 80)
      .neq("status", "DRAFT")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!data || data.length < 3) return "";

    // Find common patterns
    const addressMap: Record<string, string[]> = {};
    data.forEach(o => {
      const name = o.client_name || "";
      if (!addressMap[name]) addressMap[name] = [];
      if (o.pickup_address) addressMap[name].push(`ophaal: ${o.pickup_address}`);
      if (o.delivery_address) addressMap[name].push(`lever: ${o.delivery_address}`);
    });

    const patterns = Object.entries(addressMap)
      .filter(([_, addrs]) => addrs.length >= 2)
      .slice(0, 5)
      .map(([name, addrs]) => `- ${name}: ${[...new Set(addrs)].slice(0, 3).join(", ")}`)
      .join("\n");

    if (!patterns) return "";
    return `\n\nBEKENDE KLANT-ADRESSEN (gebruik deze als de email vaag is):\n${patterns}`;
  } catch {
    return "";
  }
}

// Build the enhanced prompt context
export async function buildAIContext(clientName: string): Promise<string> {
  const [corrections, patterns] = await Promise.all([
    getClientCorrections(clientName),
    getExtractionPatterns(),
  ]);
  return corrections + patterns;
}
