import { describe, it, expect } from "vitest";
import { renderTemplate, extractVariables, buildTrackUrl } from "@/lib/notificationRenderer";

describe("renderTemplate", () => {
  it("replaces known variables", () => {
    const result = renderTemplate(
      "Beste {{client_name}}, uw order #{{order_number}} is bevestigd.",
      { client_name: "Bakkerij De Jong", order_number: "1042" }
    );
    expect(result).toBe("Beste Bakkerij De Jong, uw order #1042 is bevestigd.");
  });

  it("replaces missing variables with empty string", () => {
    const result = renderTemplate("ETA: {{eta}}", {});
    expect(result).toBe("ETA: ");
  });

  it("handles template with no variables", () => {
    const result = renderTemplate("Geen variabelen hier.", {});
    expect(result).toBe("Geen variabelen hier.");
  });

  it("handles multiple occurrences of the same variable", () => {
    const result = renderTemplate(
      "{{company_name}} — {{company_name}}",
      { company_name: "TestCo" }
    );
    expect(result).toBe("TestCo — TestCo");
  });
});

describe("extractVariables", () => {
  it("extracts unique variable names", () => {
    const vars = extractVariables("{{client_name}} - {{order_number}} - {{client_name}}");
    expect(vars).toEqual(["client_name", "order_number"]);
  });

  it("returns empty array for no variables", () => {
    expect(extractVariables("plain text")).toEqual([]);
  });
});

describe("buildTrackUrl", () => {
  it("creates a track URL with order number", () => {
    const url = buildTrackUrl(1042);
    expect(url).toContain("/track?q=1042");
  });
});
