import type { TemplateVariables } from "@/types/notifications";

/**
 * Renders a notification template by replacing {{variable}} placeholders.
 * Unknown variables are left as-is. Empty values become empty string.
 */
export function renderTemplate(
  template: string,
  variables: Partial<TemplateVariables>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key as keyof TemplateVariables];
    return value !== undefined && value !== null ? String(value) : "";
  });
}

/**
 * Extracts all {{variable}} names from a template string.
 */
export function extractVariables(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))];
}

/**
 * Builds a track URL for a given order number and tenant slug.
 */
export function buildTrackUrl(
  orderNumber: number | string,
  tenantSlug?: string
): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/track?q=${orderNumber}`;
}
