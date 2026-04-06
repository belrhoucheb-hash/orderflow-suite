import { describe, it, expect, beforeEach } from 'vitest';
import {
  detectPricingAnomalies,
  detectTimingAnomalies,
  detectComplianceAnomalies,
  detectPatternAnomalies,
  detectStaleOrders,
  detectDuplicateOrders,
  detectMarginAnomalies,
  runFullScan,
  _resetIdCounter,
} from '@/utils/anomalyDetector';
import type {
  OrderInput,
  ClientRate,
  TripInput,
  DriverInput,
  AIDecisionInput,
  InvoiceInput,
} from '@/utils/anomalyDetector';

beforeEach(() => {
  _resetIdCounter();
});

// ─── Pricing ─────────────────────────────────────────────────────

describe('detectPricingAnomalies', () => {
  const clientRates: ClientRate[] = [
    { client_id: 'c1', client_name: 'Klant A', average_price: 100 },
    { client_id: 'c2', client_name: 'Klant B', average_price: 200 },
  ];

  it('flags order with >20% price deviation', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', client_name: 'Klant A', calculated_price: 130 },
    ];
    const anomalies = detectPricingAnomalies(orders, clientRates);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('unusual_price');
    expect(anomalies[0].severity).toBe('warning');
  });

  it('flags critical for >50% deviation', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', client_name: 'Klant A', calculated_price: 200 },
    ];
    const anomalies = detectPricingAnomalies(orders, clientRates);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('does not flag order within 20%', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', client_name: 'Klant A', calculated_price: 110 },
    ];
    const anomalies = detectPricingAnomalies(orders, clientRates);
    expect(anomalies).toHaveLength(0);
  });

  it('skips orders without price or client', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1' },
      { id: 'o2', calculated_price: 999 },
    ];
    const anomalies = detectPricingAnomalies(orders, clientRates);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Timing ──────────────────────────────────────────────────────

describe('detectTimingAnomalies', () => {
  const now = new Date('2026-04-06T14:00:00Z');

  it('flags late delivery when past window end', () => {
    const trips: TripInput[] = [
      {
        id: 't1',
        status: 'IN_TRANSIT',
        delivery_window_end: '2026-04-06T13:00:00Z',
      },
    ];
    const anomalies = detectTimingAnomalies(trips, now);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('late_delivery');
    expect(anomalies[0].data.delay_minutes).toBe(60);
  });

  it('flags critical when >60 min late', () => {
    const trips: TripInput[] = [
      {
        id: 't1',
        status: 'IN_TRANSIT',
        delivery_window_end: '2026-04-06T12:00:00Z',
      },
    ];
    const anomalies = detectTimingAnomalies(trips, now);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('does not flag completed trips', () => {
    const trips: TripInput[] = [
      {
        id: 't1',
        status: 'COMPLETED',
        delivery_window_end: '2026-04-06T12:00:00Z',
      },
    ];
    const anomalies = detectTimingAnomalies(trips, now);
    expect(anomalies.filter((a) => a.type === 'late_delivery')).toHaveLength(0);
  });

  it('flags early delivery >2h before window', () => {
    const trips: TripInput[] = [
      {
        id: 't1',
        status: 'DELIVERED',
        delivery_window_start: '2026-04-06T16:00:00Z',
        actual_arrival: '2026-04-06T12:00:00Z',
        pod_uploaded: true,
      },
    ];
    const anomalies = detectTimingAnomalies(trips, now);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('early_delivery');
    expect(anomalies[0].severity).toBe('info');
  });

  it('flags missing POD on completed trip', () => {
    const trips: TripInput[] = [
      {
        id: 't1',
        status: 'COMPLETED',
        pod_uploaded: false,
      },
    ];
    const anomalies = detectTimingAnomalies(trips, now);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('missing_pod');
  });
});

// ─── Compliance ──────────────────────────────────────────────────

describe('detectComplianceAnomalies', () => {
  it('flags drive time violation when >90% of max', () => {
    const trips: TripInput[] = [{ id: 't1', driver_id: 'd1' }];
    const drivers: DriverInput[] = [
      { id: 'd1', name: 'Jan', current_drive_minutes: 500, max_drive_minutes: 540 },
    ];
    const anomalies = detectComplianceAnomalies(trips, drivers);
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].type).toBe('drive_time_violation');
    expect(anomalies[0].severity).toBe('warning');
  });

  it('flags critical when exceeding max drive time', () => {
    const trips: TripInput[] = [{ id: 't1', driver_id: 'd1' }];
    const drivers: DriverInput[] = [
      { id: 'd1', name: 'Jan', current_drive_minutes: 600, max_drive_minutes: 540 },
    ];
    const anomalies = detectComplianceAnomalies(trips, drivers);
    const driveAnomaly = anomalies.find((a) => a.title.includes('overschreden'));
    expect(driveAnomaly).toBeDefined();
    expect(driveAnomaly!.severity).toBe('critical');
  });

  it('flags capacity exceeded', () => {
    const trips: TripInput[] = [
      { id: 't1', total_weight_kg: 12000, vehicle_capacity_kg: 10000 },
    ];
    const anomalies = detectComplianceAnomalies(trips, []);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('capacity_exceeded');
  });

  it('does not flag when within capacity', () => {
    const trips: TripInput[] = [
      { id: 't1', total_weight_kg: 8000, vehicle_capacity_kg: 10000 },
    ];
    const anomalies = detectComplianceAnomalies(trips, []);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Pattern anomalies ──────────────────────────────────────────

describe('detectPatternAnomalies', () => {
  it('flags repeated AI corrections (>=3) on same client+field', () => {
    const decisions: AIDecisionInput[] = [
      { id: '1', client_id: 'c1', client_name: 'Klant A', field: 'delivery_address', ai_value: 'A', corrected_value: 'B' },
      { id: '2', client_id: 'c1', client_name: 'Klant A', field: 'delivery_address', ai_value: 'A', corrected_value: 'C' },
      { id: '3', client_id: 'c1', client_name: 'Klant A', field: 'delivery_address', ai_value: 'A', corrected_value: 'D' },
    ];
    const anomalies = detectPatternAnomalies(decisions);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('repeat_correction');
    expect(anomalies[0].data.correction_count).toBe(3);
  });

  it('does not flag if fewer than 3 corrections', () => {
    const decisions: AIDecisionInput[] = [
      { id: '1', client_id: 'c1', field: 'delivery_address', ai_value: 'A', corrected_value: 'B' },
      { id: '2', client_id: 'c1', field: 'delivery_address', ai_value: 'A', corrected_value: 'C' },
    ];
    const anomalies = detectPatternAnomalies(decisions);
    expect(anomalies).toHaveLength(0);
  });

  it('flags critical when >=5 corrections', () => {
    const decisions: AIDecisionInput[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      client_id: 'c1',
      client_name: 'Klant A',
      field: 'weight',
      ai_value: '10',
      corrected_value: `${20 + i}`,
    }));
    const anomalies = detectPatternAnomalies(decisions);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('ignores non-corrections (ai_value === corrected_value)', () => {
    const decisions: AIDecisionInput[] = Array.from({ length: 5 }, (_, i) => ({
      id: `${i}`,
      client_id: 'c1',
      field: 'weight',
      ai_value: '10',
      corrected_value: '10',
    }));
    const anomalies = detectPatternAnomalies(decisions);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Stale orders ───────────────────────────────────────────────

describe('detectStaleOrders', () => {
  const now = new Date('2026-04-06T12:00:00Z');

  it('flags DRAFT orders older than 24h', () => {
    const orders: OrderInput[] = [
      { id: 'o1', status: 'DRAFT', created_at: '2026-04-04T12:00:00Z', order_number: 'ORD-001' },
    ];
    const anomalies = detectStaleOrders(orders, now);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('stale_order');
    expect(anomalies[0].data.age_hours).toBe(48);
  });

  it('flags critical for >48h stale orders', () => {
    const orders: OrderInput[] = [
      { id: 'o1', status: 'DRAFT', created_at: '2026-04-03T12:00:00Z' },
    ];
    const anomalies = detectStaleOrders(orders, now);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('does not flag recent DRAFT orders', () => {
    const orders: OrderInput[] = [
      { id: 'o1', status: 'DRAFT', created_at: '2026-04-06T10:00:00Z' },
    ];
    const anomalies = detectStaleOrders(orders, now);
    expect(anomalies).toHaveLength(0);
  });

  it('does not flag non-DRAFT orders', () => {
    const orders: OrderInput[] = [
      { id: 'o1', status: 'CONFIRMED', created_at: '2026-04-01T12:00:00Z' },
    ];
    const anomalies = detectStaleOrders(orders, now);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Duplicate orders ───────────────────────────────────────────

describe('detectDuplicateOrders', () => {
  it('flags orders with same client + date + address', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', delivery_date: '2026-04-06', delivery_address: 'Keizersgracht 1, Amsterdam', order_number: 'ORD-001' },
      { id: 'o2', client_id: 'c1', delivery_date: '2026-04-06', delivery_address: 'Keizersgracht 1, Amsterdam', order_number: 'ORD-002' },
    ];
    const anomalies = detectDuplicateOrders(orders);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('duplicate_order');
    expect(anomalies[0].entityId).toBe('o2');
  });

  it('is case-insensitive for addresses', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', delivery_date: '2026-04-06', delivery_address: 'Keizersgracht 1' },
      { id: 'o2', client_id: 'c1', delivery_date: '2026-04-06', delivery_address: 'keizersgracht 1' },
    ];
    const anomalies = detectDuplicateOrders(orders);
    expect(anomalies).toHaveLength(1);
  });

  it('does not flag different clients', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', delivery_date: '2026-04-06', delivery_address: 'Keizersgracht 1' },
      { id: 'o2', client_id: 'c2', delivery_date: '2026-04-06', delivery_address: 'Keizersgracht 1' },
    ];
    const anomalies = detectDuplicateOrders(orders);
    expect(anomalies).toHaveLength(0);
  });

  it('does not flag different dates', () => {
    const orders: OrderInput[] = [
      { id: 'o1', client_id: 'c1', delivery_date: '2026-04-06', delivery_address: 'Keizersgracht 1' },
      { id: 'o2', client_id: 'c1', delivery_date: '2026-04-07', delivery_address: 'Keizersgracht 1' },
    ];
    const anomalies = detectDuplicateOrders(orders);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Margin anomalies ───────────────────────────────────────────

describe('detectMarginAnomalies', () => {
  it('flags trip with margin below threshold', () => {
    const trips: TripInput[] = [{ id: 't1', margin_pct: 5 }];
    const anomalies = detectMarginAnomalies(trips, [], 10);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].type).toBe('margin_below_threshold');
    expect(anomalies[0].severity).toBe('warning');
  });

  it('flags critical for negative margin', () => {
    const trips: TripInput[] = [{ id: 't1', margin_pct: -3 }];
    const anomalies = detectMarginAnomalies(trips, [], 10);
    expect(anomalies[0].severity).toBe('critical');
  });

  it('calculates margin from invoice when trip has no margin_pct', () => {
    const trips: TripInput[] = [{ id: 't1' }];
    const invoices: InvoiceInput[] = [
      { id: 'i1', trip_id: 't1', total_revenue: 100, total_cost: 95 },
    ];
    const anomalies = detectMarginAnomalies(trips, invoices, 10);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].data.calculated_margin).toBeCloseTo(5);
  });

  it('does not flag when margin is above threshold', () => {
    const trips: TripInput[] = [{ id: 't1', margin_pct: 15 }];
    const anomalies = detectMarginAnomalies(trips, [], 10);
    expect(anomalies).toHaveLength(0);
  });
});

// ─── Severity classification ─────────────────────────────────────

describe('severity classification', () => {
  it('pricing: warning for 20-50%, critical for >50%', () => {
    const rates: ClientRate[] = [{ client_id: 'c1', client_name: 'A', average_price: 100 }];

    const warning = detectPricingAnomalies(
      [{ id: 'o1', client_id: 'c1', calculated_price: 130 }],
      rates,
    );
    expect(warning[0].severity).toBe('warning');

    const critical = detectPricingAnomalies(
      [{ id: 'o2', client_id: 'c1', calculated_price: 200 }],
      rates,
    );
    expect(critical[0].severity).toBe('critical');
  });

  it('timing: warning for <=60min late, critical for >60min', () => {
    const now = new Date('2026-04-06T14:00:00Z');

    const warning = detectTimingAnomalies(
      [{ id: 't1', status: 'IN_TRANSIT', delivery_window_end: '2026-04-06T13:30:00Z' }],
      now,
    );
    expect(warning[0].severity).toBe('warning');

    const critical = detectTimingAnomalies(
      [{ id: 't2', status: 'IN_TRANSIT', delivery_window_end: '2026-04-06T12:00:00Z' }],
      now,
    );
    expect(critical[0].severity).toBe('critical');
  });

  it('stale: warning for 24-48h, critical for >48h', () => {
    const now = new Date('2026-04-06T12:00:00Z');

    const warning = detectStaleOrders(
      [{ id: 'o1', status: 'DRAFT', created_at: '2026-04-05T06:00:00Z' }],
      now,
    );
    expect(warning[0].severity).toBe('warning');

    const critical = detectStaleOrders(
      [{ id: 'o2', status: 'DRAFT', created_at: '2026-04-03T12:00:00Z' }],
      now,
    );
    expect(critical[0].severity).toBe('critical');
  });
});

// ─── Auto-resolve logic ──────────────────────────────────────────

describe('auto-resolve logic', () => {
  it('marks early delivery as autoResolvable', () => {
    const trips: TripInput[] = [
      {
        id: 't1',
        status: 'DELIVERED',
        delivery_window_start: '2026-04-06T16:00:00Z',
        actual_arrival: '2026-04-06T12:00:00Z',
        pod_uploaded: true,
      },
    ];
    const anomalies = detectTimingAnomalies(trips, new Date('2026-04-06T14:00:00Z'));
    const earlyDelivery = anomalies.find((a) => a.type === 'early_delivery');
    expect(earlyDelivery).toBeDefined();
    expect(earlyDelivery!.autoResolvable).toBe(true);
    expect(earlyDelivery!.severity).toBe('info');
  });

  it('does not mark critical anomalies as autoResolvable', () => {
    const trips: TripInput[] = [
      { id: 't1', status: 'IN_TRANSIT', delivery_window_end: '2026-04-06T12:00:00Z' },
    ];
    const anomalies = detectTimingAnomalies(trips, new Date('2026-04-06T14:00:00Z'));
    expect(anomalies[0].autoResolvable).toBe(false);
  });
});

// ─── runFullScan ─────────────────────────────────────────────────

describe('runFullScan', () => {
  it('combines anomalies from all detectors and sorts by severity', () => {
    const now = new Date('2026-04-06T14:00:00Z');
    const result = runFullScan({
      orders: [
        { id: 'o1', client_id: 'c1', client_name: 'A', calculated_price: 200 },
        { id: 'o2', status: 'DRAFT', created_at: '2026-04-04T12:00:00Z' },
      ],
      clientRates: [{ client_id: 'c1', client_name: 'A', average_price: 100 }],
      trips: [
        { id: 't1', status: 'IN_TRANSIT', delivery_window_end: '2026-04-06T12:00:00Z' },
      ],
      drivers: [],
      aiDecisions: [],
      invoices: [],
      now,
    });

    expect(result.length).toBeGreaterThanOrEqual(3);
    // Verify sorted: critical before warning before info
    for (let i = 1; i < result.length; i++) {
      const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
      expect(order[result[i].severity]).toBeGreaterThanOrEqual(order[result[i - 1].severity]);
    }
  });

  it('returns empty array when no data', () => {
    const result = runFullScan({});
    expect(result).toHaveLength(0);
  });
});
