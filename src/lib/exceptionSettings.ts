export type ExceptionSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AnomalyVisibilitySeverity = "info" | "warning" | "critical";

export interface ExceptionSettings {
  deliveryExceptionsEnabled: boolean;
  anomaliesEnabled: boolean;
  missingDataEnabled: boolean;
  slaEnabled: boolean;
  delayEnabled: boolean;
  capacityEnabled: boolean;
  delayThresholdHours: number;
  capacityUtilizationThreshold: number;
  anomalyMinSeverity: AnomalyVisibilitySeverity;
  deliveryTypes: {
    delay: boolean;
    missingData: boolean;
    capacity: boolean;
    slaBreach: boolean;
    predictedDelay: boolean;
  };
  deliverySeverities: {
    low: boolean;
    medium: boolean;
    high: boolean;
    critical: boolean;
  };
}

export const DEFAULT_EXCEPTION_SETTINGS: ExceptionSettings = {
  deliveryExceptionsEnabled: true,
  anomaliesEnabled: true,
  missingDataEnabled: true,
  slaEnabled: true,
  delayEnabled: true,
  capacityEnabled: true,
  delayThresholdHours: 24,
  capacityUtilizationThreshold: 95,
  anomalyMinSeverity: "warning",
  deliveryTypes: {
    delay: true,
    missingData: true,
    capacity: true,
    slaBreach: true,
    predictedDelay: true,
  },
  deliverySeverities: {
    low: false,
    medium: true,
    high: true,
    critical: true,
  },
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeExceptionSettings(raw: Record<string, unknown> | null | undefined): ExceptionSettings {
  const settings = raw ?? {};
  const deliveryTypes = (settings.deliveryTypes as Record<string, unknown> | undefined) ?? {};
  const deliverySeverities = (settings.deliverySeverities as Record<string, unknown> | undefined) ?? {};

  const anomalyMinSeverity = settings.anomalyMinSeverity;
  const normalizedAnomalySeverity: AnomalyVisibilitySeverity =
    anomalyMinSeverity === "info" || anomalyMinSeverity === "warning" || anomalyMinSeverity === "critical"
      ? anomalyMinSeverity
      : DEFAULT_EXCEPTION_SETTINGS.anomalyMinSeverity;

  return {
    deliveryExceptionsEnabled: asBool(settings.deliveryExceptionsEnabled, DEFAULT_EXCEPTION_SETTINGS.deliveryExceptionsEnabled),
    anomaliesEnabled: asBool(settings.anomaliesEnabled, DEFAULT_EXCEPTION_SETTINGS.anomaliesEnabled),
    missingDataEnabled: asBool(settings.missingDataEnabled, DEFAULT_EXCEPTION_SETTINGS.missingDataEnabled),
    slaEnabled: asBool(settings.slaEnabled, DEFAULT_EXCEPTION_SETTINGS.slaEnabled),
    delayEnabled: asBool(settings.delayEnabled, DEFAULT_EXCEPTION_SETTINGS.delayEnabled),
    capacityEnabled: asBool(settings.capacityEnabled, DEFAULT_EXCEPTION_SETTINGS.capacityEnabled),
    delayThresholdHours: clampInt(settings.delayThresholdHours, DEFAULT_EXCEPTION_SETTINGS.delayThresholdHours, 1, 168),
    capacityUtilizationThreshold: clampInt(
      settings.capacityUtilizationThreshold,
      DEFAULT_EXCEPTION_SETTINGS.capacityUtilizationThreshold,
      1,
      100,
    ),
    anomalyMinSeverity: normalizedAnomalySeverity,
    deliveryTypes: {
      delay: asBool(deliveryTypes.delay, DEFAULT_EXCEPTION_SETTINGS.deliveryTypes.delay),
      missingData: asBool(deliveryTypes.missingData, DEFAULT_EXCEPTION_SETTINGS.deliveryTypes.missingData),
      capacity: asBool(deliveryTypes.capacity, DEFAULT_EXCEPTION_SETTINGS.deliveryTypes.capacity),
      slaBreach: asBool(deliveryTypes.slaBreach, DEFAULT_EXCEPTION_SETTINGS.deliveryTypes.slaBreach),
      predictedDelay: asBool(deliveryTypes.predictedDelay, DEFAULT_EXCEPTION_SETTINGS.deliveryTypes.predictedDelay),
    },
    deliverySeverities: {
      low: asBool(deliverySeverities.low, DEFAULT_EXCEPTION_SETTINGS.deliverySeverities.low),
      medium: asBool(deliverySeverities.medium, DEFAULT_EXCEPTION_SETTINGS.deliverySeverities.medium),
      high: asBool(deliverySeverities.high, DEFAULT_EXCEPTION_SETTINGS.deliverySeverities.high),
      critical: asBool(deliverySeverities.critical, DEFAULT_EXCEPTION_SETTINGS.deliverySeverities.critical),
    },
  };
}

export function isDeliveryTypeEnabled(settings: ExceptionSettings, deliveryType: string): boolean {
  switch (deliveryType) {
    case "DELAY":
      return settings.deliveryTypes.delay;
    case "MISSING_DATA":
      return settings.deliveryTypes.missingData;
    case "CAPACITY":
      return settings.deliveryTypes.capacity;
    case "SLA_BREACH":
      return settings.deliveryTypes.slaBreach;
    case "PREDICTED_DELAY":
      return settings.deliveryTypes.predictedDelay;
    default:
      return true;
  }
}

export function isDeliverySeverityEnabled(settings: ExceptionSettings, severity: string): boolean {
  switch (severity) {
    case "LOW":
      return settings.deliverySeverities.low;
    case "MEDIUM":
      return settings.deliverySeverities.medium;
    case "HIGH":
      return settings.deliverySeverities.high;
    case "CRITICAL":
      return settings.deliverySeverities.critical;
    default:
      return true;
  }
}

export function anomalyPassesSeverity(settings: ExceptionSettings, severity: string): boolean {
  const rank: Record<string, number> = { info: 0, warning: 1, critical: 2 };
  return (rank[severity] ?? 0) >= rank[settings.anomalyMinSeverity];
}
