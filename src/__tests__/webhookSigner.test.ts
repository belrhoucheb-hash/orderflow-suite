import { describe, it, expect } from "vitest";
import {
  signPayload,
  buildWebhookHeaders,
  generateWebhookSecret,
} from "../../supabase/functions/_shared/webhook-signer";
import {
  mapStatusToEvent,
  genericStatusEvent,
  KNOWN_EVENT_TYPES,
} from "../../supabase/functions/_shared/webhook-events";

describe("signPayload", () => {
  it("geeft een stabiele HMAC-SHA256 voor vaste input", async () => {
    const sig = await signPayload("topsecret", '{"hello":"world"}', 1700000000);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("geeft verschillende signatures voor verschillende timestamps", async () => {
    const a = await signPayload("s", "body", 1);
    const b = await signPayload("s", "body", 2);
    expect(a).not.toEqual(b);
  });

  it("geeft verschillende signatures voor verschillende bodies", async () => {
    const a = await signPayload("s", "body-a", 1);
    const b = await signPayload("s", "body-b", 1);
    expect(a).not.toEqual(b);
  });

  it("geeft verschillende signatures voor verschillende secrets", async () => {
    const a = await signPayload("secret-a", "body", 1);
    const b = await signPayload("secret-b", "body", 1);
    expect(a).not.toEqual(b);
  });
});

describe("buildWebhookHeaders", () => {
  it("levert alle verplichte headers aan", async () => {
    const headers = await buildWebhookHeaders({
      secret: "abc",
      eventType: "order.created",
      deliveryId: "11111111-2222-3333-4444-555555555555",
      body: '{"x":1}',
      timestamp: 1700000000,
    });
    expect(headers["X-OrderFlow-Event"]).toBe("order.created");
    expect(headers["X-OrderFlow-Delivery-Id"]).toBe("11111111-2222-3333-4444-555555555555");
    expect(headers["X-OrderFlow-Timestamp"]).toBe("1700000000");
    expect(headers["X-OrderFlow-Signature"]).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toMatch(/OrderFlow-Webhook/);
  });
});

describe("generateWebhookSecret", () => {
  it("geeft een base64url-string van minstens 32 karakters", () => {
    const s = generateWebhookSecret();
    expect(s.length).toBeGreaterThanOrEqual(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("geeft telkens een andere waarde", () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).not.toEqual(b);
  });
});

describe("mapStatusToEvent", () => {
  it("mapt order-statussen correct", () => {
    expect(mapStatusToEvent("order", "DRAFT")).toBe("order.created");
    expect(mapStatusToEvent("order", "PENDING")).toBe("order.created");
    expect(mapStatusToEvent("order", "CONFIRMED")).toBe("order.confirmed");
    expect(mapStatusToEvent("order", "PLANNED")).toBeNull();
  });

  it("mapt trip-statussen correct", () => {
    expect(mapStatusToEvent("trip", "PLANNED")).toBe("trip.planned");
    expect(mapStatusToEvent("trip", "VERZONDEN")).toBe("trip.dispatched");
    expect(mapStatusToEvent("trip", "DISPATCHED")).toBe("trip.dispatched");
    expect(mapStatusToEvent("trip", "COMPLETED")).toBe("trip.completed");
  });

  it("mapt invoice-statussen correct", () => {
    expect(mapStatusToEvent("invoice", "concept")).toBe("invoice.created");
    expect(mapStatusToEvent("invoice", "verzonden")).toBe("invoice.sent");
    expect(mapStatusToEvent("invoice", "betaald")).toBe("invoice.paid");
    expect(mapStatusToEvent("invoice", "paid")).toBe("invoice.paid");
  });

  it("geeft null voor onbekende statussen", () => {
    expect(mapStatusToEvent("order", "UNKNOWN_STATUS")).toBeNull();
  });
});

describe("genericStatusEvent", () => {
  it("geeft alleen order een generiek event in v1", () => {
    expect(genericStatusEvent("order")).toBe("order.status_changed");
    expect(genericStatusEvent("trip")).toBeNull();
    expect(genericStatusEvent("invoice")).toBeNull();
  });
});

describe("KNOWN_EVENT_TYPES contract", () => {
  it("bevat alle v1-events die we publiceren", () => {
    const required = [
      "order.created",
      "order.confirmed",
      "order.status_changed",
      "trip.planned",
      "trip.dispatched",
      "trip.completed",
      "invoice.created",
      "invoice.sent",
      "invoice.paid",
      "webhook.test",
    ];
    for (const r of required) {
      expect(KNOWN_EVENT_TYPES as readonly string[]).toContain(r);
    }
  });
});
