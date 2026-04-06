// ─── Real-time Replanning Types ─────────────────────────────

export type DisruptionType =
  | 'traffic_delay'
  | 'vehicle_breakdown'
  | 'order_cancelled'
  | 'new_urgent_order'
  | 'driver_unavailable'
  | 'time_window_breach';

export interface Disruption {
  id: string;
  type: DisruptionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedTripId?: string;
  affectedOrderId?: string;
  affectedVehicleId?: string;
  description: string;
  detectedAt: Date;
  resolvedAt?: Date;
  autoResolved: boolean;
}

export interface ReplanSuggestion {
  id: string;
  disruptionId: string;
  description: string;
  confidence: number; // 0-100
  impact: {
    timeSavedMinutes: number;
    costDelta: number;
    affectedStops: number;
  };
  actions: ReplanAction[];
  status: 'pending' | 'approved' | 'rejected' | 'auto_applied';
}

export interface ReplanAction {
  type: 'reassign_order' | 'reorder_stops' | 'swap_vehicle' | 'delay_delivery' | 'split_route';
  fromTripId?: string;
  toTripId?: string;
  orderId?: string;
  details: Record<string, unknown>;
}
