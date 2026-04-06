// ─── Anomaly Detection Engine ────────────────────────────────────
// Pure-function detectors that scan orders, trips, invoices, drivers
// and return Anomaly objects. No Supabase dependency — easy to test.

import type { Anomaly, AnomalyCategory, AnomalyType } from '@/types/anomaly';

// ─── Shared helpers ──────────────────────────────────────────────

let _idCounter = 0;
function generateId(): string {
  _idCounter += 1;
  return `anomaly-${Date.now()}-${_idCounter}`;
}

/** Reset the counter (useful in tests) */
export function _resetIdCounter(): void {
  _idCounter = 0;
}

function makeAnomaly(
  partial: Omit<Anomaly, 'id' | 'tenantId' | 'autoResolved' | 'detectedAt'> & {
    tenantId?: string;
    detectedAt?: string;
  },
): Anomaly {
  return {
    id: generateId(),
    tenantId: partial.tenantId ?? '',
    autoResolved: false,
    detectedAt: partial.detectedAt ?? new Date().toISOString(),
    ...partial,
  };
}

// ─── Input types (lightweight, no coupling to DB schemas) ────────

export interface OrderInput {
  id: string;
  client_name?: string;
  client_id?: string;
  status?: string;
  created_at?: string;
  received_at?: string;
  calculated_price?: number;
  pickup_address?: string;
  delivery_address?: string;
  delivery_date?: string;
  order_number?: string;
}

export interface ClientRate {
  client_id: string;
  client_name: string;
  average_price: number;
}

export interface TripInput {
  id: string;
  status?: string;
  planned_departure?: string;
  planned_arrival?: string;
  actual_departure?: string;
  actual_arrival?: string;
  vehicle_id?: string;
  driver_id?: string;
  total_weight_kg?: number;
  vehicle_capacity_kg?: number;
  margin_pct?: number;
  pod_uploaded?: boolean;
  delivery_window_start?: string;
  delivery_window_end?: string;
}

export interface DriverInput {
  id: string;
  name?: string;
  current_drive_minutes?: number;
  current_shift_minutes?: number;
  max_drive_minutes?: number;   // EU 561: 540 (9h) per day
  max_shift_minutes?: number;   // EU 561: 780 (13h) per day
}

export interface AIDecisionInput {
  id: string;
  client_id?: string;
  client_name?: string;
  field: string;
  ai_value: string;
  corrected_value: string;
  created_at?: string;
}

export interface InvoiceInput {
  id: string;
  trip_id?: string;
  total_revenue?: number;
  total_cost?: number;
}

export interface ScanData {
  orders?: OrderInput[];
  clientRates?: ClientRate[];
  trips?: TripInput[];
  drivers?: DriverInput[];
  aiDecisions?: AIDecisionInput[];
  invoices?: InvoiceInput[];
  marginThresholdPct?: number;
  now?: Date;
}

// ─── Pricing anomalies ──────────────────────────────────────────

export function detectPricingAnomalies(
  orders: OrderInput[],
  clientRates: ClientRate[],
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const rateMap = new Map(clientRates.map((r) => [r.client_id, r]));

  for (const order of orders) {
    if (order.calculated_price == null || !order.client_id) continue;
    const rate = rateMap.get(order.client_id);
    if (!rate || rate.average_price === 0) continue;

    const deviation = Math.abs(order.calculated_price - rate.average_price) / rate.average_price;
    if (deviation > 0.2) {
      const pctStr = Math.round(deviation * 100);
      anomalies.push(
        makeAnomaly({
          category: 'pricing',
          type: 'unusual_price',
          severity: deviation > 0.5 ? 'critical' : 'warning',
          entityType: 'order',
          entityId: order.id,
          title: `Ongebruikelijke prijs voor ${order.client_name ?? 'klant'}`,
          description: `Berekende prijs wijkt ${pctStr}% af van het gemiddelde (${rate.average_price.toFixed(2)}).`,
          suggestedAction: 'Controleer prijsberekening en ratecard',
          autoResolvable: false,
          data: {
            calculated_price: order.calculated_price,
            average_price: rate.average_price,
            deviation_pct: pctStr,
          },
        }),
      );
    }
  }

  return anomalies;
}

// ─── Timing anomalies ───────────────────────────────────────────

export function detectTimingAnomalies(trips: TripInput[], now?: Date): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const currentTime = now ?? new Date();

  for (const trip of trips) {
    // Late delivery: past window end and not arrived
    if (
      trip.delivery_window_end &&
      trip.status !== 'COMPLETED' &&
      trip.status !== 'DELIVERED'
    ) {
      const windowEnd = new Date(trip.delivery_window_end);
      if (currentTime > windowEnd) {
        const delayMs = currentTime.getTime() - windowEnd.getTime();
        const delayMin = Math.round(delayMs / 60000);
        anomalies.push(
          makeAnomaly({
            category: 'timing',
            type: 'late_delivery',
            severity: delayMin > 60 ? 'critical' : 'warning',
            entityType: 'trip',
            entityId: trip.id,
            title: `Late levering — ${delayMin} min te laat`,
            description: `Trip loopt ${delayMin} minuten achter op het tijdvenster.`,
            suggestedAction: 'Neem contact op met chauffeur / herplan',
            autoResolvable: false,
            data: { delivery_window_end: trip.delivery_window_end, delay_minutes: delayMin },
          }),
        );
      }
    }

    // Early delivery: arrived >2h before window start
    if (trip.delivery_window_start && trip.actual_arrival) {
      const windowStart = new Date(trip.delivery_window_start);
      const arrived = new Date(trip.actual_arrival);
      const earlyMs = windowStart.getTime() - arrived.getTime();
      const earlyMin = Math.round(earlyMs / 60000);
      if (earlyMin > 120) {
        anomalies.push(
          makeAnomaly({
            category: 'timing',
            type: 'early_delivery',
            severity: 'info',
            entityType: 'trip',
            entityId: trip.id,
            title: `Vroege levering — ${earlyMin} min te vroeg`,
            description: `Chauffeur is ${earlyMin} minuten voor het tijdvenster aangekomen.`,
            autoResolvable: true,
            data: { delivery_window_start: trip.delivery_window_start, early_minutes: earlyMin },
          }),
        );
      }
    }

    // Missing POD: trip marked complete but no POD uploaded
    if (
      (trip.status === 'COMPLETED' || trip.status === 'DELIVERED') &&
      trip.pod_uploaded === false
    ) {
      anomalies.push(
        makeAnomaly({
          category: 'compliance',
          type: 'missing_pod',
          severity: 'warning',
          entityType: 'trip',
          entityId: trip.id,
          title: 'Ontbrekende POD',
          description: 'Levering is voltooid maar er is geen bewijs van aflevering geüpload.',
          suggestedAction: 'Vraag chauffeur om POD te uploaden',
          autoResolvable: false,
          data: {},
        }),
      );
    }
  }

  return anomalies;
}

// ─── Compliance anomalies ───────────────────────────────────────

export function detectComplianceAnomalies(
  trips: TripInput[],
  drivers: DriverInput[],
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const driverMap = new Map(drivers.map((d) => [d.id, d]));

  // EU 561/2006: max 9h driving, max 13h shift
  const DEFAULT_MAX_DRIVE = 540;
  const DEFAULT_MAX_SHIFT = 780;

  for (const trip of trips) {
    if (!trip.driver_id) continue;
    const driver = driverMap.get(trip.driver_id);
    if (!driver) continue;

    const maxDrive = driver.max_drive_minutes ?? DEFAULT_MAX_DRIVE;
    const maxShift = driver.max_shift_minutes ?? DEFAULT_MAX_SHIFT;

    if (driver.current_drive_minutes != null && driver.current_drive_minutes > maxDrive * 0.9) {
      const isOver = driver.current_drive_minutes > maxDrive;
      anomalies.push(
        makeAnomaly({
          category: 'compliance',
          type: 'drive_time_violation',
          severity: isOver ? 'critical' : 'warning',
          entityType: 'driver',
          entityId: driver.id,
          title: isOver
            ? `Rijtijd overschreden — ${driver.name ?? 'chauffeur'}`
            : `Rijtijd bijna bereikt — ${driver.name ?? 'chauffeur'}`,
          description: `Huidige rijtijd: ${driver.current_drive_minutes} min (max ${maxDrive} min).`,
          suggestedAction: 'Plan rustpauze in of wissel chauffeur',
          autoResolvable: false,
          data: {
            current_drive_minutes: driver.current_drive_minutes,
            max_drive_minutes: maxDrive,
            driver_name: driver.name,
          },
        }),
      );
    }

    if (driver.current_shift_minutes != null && driver.current_shift_minutes > maxShift * 0.9) {
      const isOver = driver.current_shift_minutes > maxShift;
      anomalies.push(
        makeAnomaly({
          category: 'compliance',
          type: 'drive_time_violation',
          severity: isOver ? 'critical' : 'warning',
          entityType: 'driver',
          entityId: driver.id,
          title: isOver
            ? `Diensttijd overschreden — ${driver.name ?? 'chauffeur'}`
            : `Diensttijd bijna bereikt — ${driver.name ?? 'chauffeur'}`,
          description: `Huidige diensttijd: ${driver.current_shift_minutes} min (max ${maxShift} min).`,
          suggestedAction: 'Plan rustpauze in of wissel chauffeur',
          autoResolvable: false,
          data: {
            current_shift_minutes: driver.current_shift_minutes,
            max_shift_minutes: maxShift,
            driver_name: driver.name,
          },
        }),
      );
    }
  }

  // Capacity check on trips
  for (const trip of trips) {
    if (
      trip.total_weight_kg != null &&
      trip.vehicle_capacity_kg != null &&
      trip.vehicle_capacity_kg > 0
    ) {
      const ratio = trip.total_weight_kg / trip.vehicle_capacity_kg;
      if (ratio > 1) {
        anomalies.push(
          makeAnomaly({
            category: 'capacity',
            type: 'capacity_exceeded',
            severity: ratio > 1.1 ? 'critical' : 'warning',
            entityType: 'trip',
            entityId: trip.id,
            title: 'Voertuig overbeladen',
            description: `Gewicht ${trip.total_weight_kg} kg overschrijdt capaciteit ${trip.vehicle_capacity_kg} kg (${Math.round(ratio * 100)}%).`,
            suggestedAction: 'Verdeel lading over meerdere voertuigen',
            autoResolvable: false,
            data: {
              total_weight_kg: trip.total_weight_kg,
              vehicle_capacity_kg: trip.vehicle_capacity_kg,
              ratio_pct: Math.round(ratio * 100),
            },
          }),
        );
      }
    }
  }

  return anomalies;
}

// ─── Pattern anomalies (AI learning) ────────────────────────────

export function detectPatternAnomalies(aiDecisions: AIDecisionInput[]): Anomaly[] {
  const anomalies: Anomaly[] = [];

  // Group corrections by client + field
  const groups = new Map<string, AIDecisionInput[]>();
  for (const d of aiDecisions) {
    if (d.ai_value === d.corrected_value) continue; // not a correction
    const key = `${d.client_id ?? 'unknown'}::${d.field}`;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  for (const [key, corrections] of groups) {
    if (corrections.length >= 3) {
      const [clientId, field] = key.split('::');
      const clientName = corrections[0].client_name ?? clientId;
      anomalies.push(
        makeAnomaly({
          category: 'pattern',
          type: 'repeat_correction',
          severity: corrections.length >= 5 ? 'critical' : 'warning',
          entityType: 'order',
          entityId: corrections[corrections.length - 1].id,
          title: `Herhaalde AI-correctie: ${field} voor ${clientName}`,
          description: `AI is ${corrections.length}x gecorrigeerd op veld "${field}" voor klant ${clientName}. Model moet bijgetraind worden.`,
          suggestedAction: 'Voeg klant-specifieke regel toe aan AI-model',
          autoResolvable: false,
          data: {
            client_id: clientId,
            field,
            correction_count: corrections.length,
          },
        }),
      );
    }
  }

  return anomalies;
}

// ─── Stale orders ───────────────────────────────────────────────

export function detectStaleOrders(orders: OrderInput[], now?: Date): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const currentTime = now ?? new Date();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;

  for (const order of orders) {
    if (order.status !== 'DRAFT') continue;
    const createdAt = order.received_at ?? order.created_at;
    if (!createdAt) continue;

    const ageMs = currentTime.getTime() - new Date(createdAt).getTime();
    if (ageMs > twentyFourHoursMs) {
      const ageHours = Math.round(ageMs / (60 * 60 * 1000));
      anomalies.push(
        makeAnomaly({
          category: 'timing',
          type: 'stale_order',
          severity: ageHours > 48 ? 'critical' : 'warning',
          entityType: 'order',
          entityId: order.id,
          title: `Order al ${ageHours}u in DRAFT`,
          description: `Order ${order.order_number ?? order.id} staat al ${ageHours} uur in DRAFT-status.`,
          suggestedAction: 'Verwerk order of markeer als geannuleerd',
          autoResolvable: false,
          data: { age_hours: ageHours, client_name: order.client_name },
        }),
      );
    }
  }

  return anomalies;
}

// ─── Duplicate orders ───────────────────────────────────────────

function normalizeAddress(addr?: string): string {
  if (!addr) return '';
  return addr.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function detectDuplicateOrders(orders: OrderInput[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const seen = new Map<string, OrderInput>();

  for (const order of orders) {
    if (!order.client_id || !order.delivery_date) continue;

    const key = [
      order.client_id,
      order.delivery_date,
      normalizeAddress(order.delivery_address),
    ].join('::');

    const existing = seen.get(key);
    if (existing) {
      anomalies.push(
        makeAnomaly({
          category: 'pattern',
          type: 'duplicate_order',
          severity: 'warning',
          entityType: 'order',
          entityId: order.id,
          title: `Mogelijke duplicaat order`,
          description: `Order ${order.order_number ?? order.id} lijkt op order ${existing.order_number ?? existing.id} (zelfde klant, datum en adres).`,
          suggestedAction: 'Verifieer of dit een duplicaat is',
          autoResolvable: false,
          data: {
            original_order_id: existing.id,
            client_name: order.client_name,
            delivery_date: order.delivery_date,
          },
        }),
      );
    } else {
      seen.set(key, order);
    }
  }

  return anomalies;
}

// ─── Margin anomalies ───────────────────────────────────────────

export function detectMarginAnomalies(
  trips: TripInput[],
  invoices: InvoiceInput[],
  thresholdPct: number = 10,
): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const invoiceByTrip = new Map<string, InvoiceInput>();
  for (const inv of invoices) {
    if (inv.trip_id) invoiceByTrip.set(inv.trip_id, inv);
  }

  for (const trip of trips) {
    // Check trip's own margin_pct first
    if (trip.margin_pct != null && trip.margin_pct < thresholdPct) {
      anomalies.push(
        makeAnomaly({
          category: 'pricing',
          type: 'margin_below_threshold',
          severity: trip.margin_pct < 0 ? 'critical' : 'warning',
          entityType: 'trip',
          entityId: trip.id,
          title: `Lage marge: ${trip.margin_pct.toFixed(1)}%`,
          description: `Trip marge (${trip.margin_pct.toFixed(1)}%) ligt onder de drempel van ${thresholdPct}%.`,
          suggestedAction: 'Controleer kosten en facturatie',
          autoResolvable: false,
          data: { margin_pct: trip.margin_pct, threshold_pct: thresholdPct },
        }),
      );
      continue;
    }

    // Fallback: calculate from invoice
    const inv = invoiceByTrip.get(trip.id);
    if (inv && inv.total_revenue != null && inv.total_cost != null && inv.total_revenue > 0) {
      const margin = ((inv.total_revenue - inv.total_cost) / inv.total_revenue) * 100;
      if (margin < thresholdPct) {
        anomalies.push(
          makeAnomaly({
            category: 'pricing',
            type: 'margin_below_threshold',
            severity: margin < 0 ? 'critical' : 'warning',
            entityType: 'trip',
            entityId: trip.id,
            title: `Lage marge: ${margin.toFixed(1)}%`,
            description: `Berekende marge (${margin.toFixed(1)}%) ligt onder de drempel van ${thresholdPct}%.`,
            suggestedAction: 'Controleer kosten en facturatie',
            autoResolvable: false,
            data: {
              calculated_margin: margin,
              threshold_pct: thresholdPct,
              revenue: inv.total_revenue,
              cost: inv.total_cost,
            },
          }),
        );
      }
    }
  }

  return anomalies;
}

// ─── Full scan (runs all detectors) ─────────────────────────────

export function runFullScan(data: ScanData): Anomaly[] {
  const anomalies: Anomaly[] = [];

  if (data.orders && data.clientRates) {
    anomalies.push(...detectPricingAnomalies(data.orders, data.clientRates));
  }

  if (data.trips) {
    anomalies.push(...detectTimingAnomalies(data.trips, data.now));
  }

  if (data.trips && data.drivers) {
    anomalies.push(...detectComplianceAnomalies(data.trips, data.drivers));
  }

  if (data.aiDecisions) {
    anomalies.push(...detectPatternAnomalies(data.aiDecisions));
  }

  if (data.orders) {
    anomalies.push(...detectStaleOrders(data.orders, data.now));
    anomalies.push(...detectDuplicateOrders(data.orders));
  }

  if (data.trips) {
    anomalies.push(
      ...detectMarginAnomalies(
        data.trips,
        data.invoices ?? [],
        data.marginThresholdPct ?? 10,
      ),
    );
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  anomalies.sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9),
  );

  return anomalies;
}
