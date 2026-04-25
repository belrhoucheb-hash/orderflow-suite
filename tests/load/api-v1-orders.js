// k6 load-test voor de publieke REST API v1.
//
// Vereist environment-vars:
//   API_BASE_URL  https://<project>.supabase.co/functions/v1/api-v1
//   API_TOKEN     ofs_... (read-only token, scope orders:read)
//
// Lokaal: k6 run -e API_BASE_URL=... -e API_TOKEN=... tests/load/api-v1-orders.js
// CI:     gebruik nightly.yml met repo-secrets API_BASE_URL en API_TOKEN.
//
// Drempels (p95):
//   GET /orders         < 600ms
//   GET /orders/:id     < 400ms
// Foutpercentage moet < 1% blijven.

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const ordersListLatency = new Trend("orders_list_latency_ms", true);
const ordersGetLatency = new Trend("orders_get_latency_ms", true);

export const options = {
  scenarios: {
    steady_load: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 },
        { duration: "2m", target: 5 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    "http_req_failed": ["rate<0.01"],
    "errors": ["rate<0.01"],
    "orders_list_latency_ms": ["p(95)<600"],
    "orders_get_latency_ms": ["p(95)<400"],
  },
};

const BASE = __ENV.API_BASE_URL;
const TOKEN = __ENV.API_TOKEN;

if (!BASE || !TOKEN) {
  throw new Error("API_BASE_URL en API_TOKEN moeten via -e ingesteld worden.");
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

export default function () {
  const list = http.get(`${BASE}/orders?limit=50`, { headers, tags: { name: "list_orders" } });
  ordersListLatency.add(list.timings.duration);
  const listOk = check(list, {
    "list status 200": (r) => r.status === 200,
    "list heeft data array": (r) => Array.isArray(r.json("data")),
  });
  errorRate.add(!listOk);

  if (listOk) {
    const items = list.json("data");
    if (Array.isArray(items) && items.length > 0) {
      const id = items[0].id;
      const single = http.get(`${BASE}/orders/${id}`, { headers, tags: { name: "get_order" } });
      ordersGetLatency.add(single.timings.duration);
      const singleOk = check(single, {
        "get status 200": (r) => r.status === 200,
        "get returnt zelfde id": (r) => r.json("data.id") === id,
      });
      errorRate.add(!singleOk);
    }
  }

  sleep(1);
}
