// src/types/timeWindows.ts

// ─── Slot Booking ──────────────────────────────────────────

export type SlotBookingStatus = "GEBOEKT" | "BEVESTIGD" | "GEANNULEERD" | "VERLOPEN";
export const SLOT_BOOKING_STATUSES: SlotBookingStatus[] = ["GEBOEKT", "BEVESTIGD", "GEANNULEERD", "VERLOPEN"];

export const SLOT_BOOKING_STATUS_LABELS: Record<SlotBookingStatus, { label: string; color: string }> = {
  GEBOEKT: { label: "Geboekt", color: "bg-blue-100 text-blue-700" },
  BEVESTIGD: { label: "Bevestigd", color: "bg-green-100 text-green-700" },
  GEANNULEERD: { label: "Geannuleerd", color: "bg-gray-100 text-gray-600" },
  VERLOPEN: { label: "Verlopen", color: "bg-red-100 text-red-700" },
};

// ─── Window Status (on trip_stops) ─────────────────────────

export type WindowStatus = "ONBEKEND" | "OP_TIJD" | "TE_VROEG" | "TE_LAAT" | "GEMIST";
export const WINDOW_STATUSES: WindowStatus[] = ["ONBEKEND", "OP_TIJD", "TE_VROEG", "TE_LAAT", "GEMIST"];

export const WINDOW_STATUS_LABELS: Record<WindowStatus, { label: string; color: string }> = {
  ONBEKEND: { label: "Onbekend", color: "bg-gray-100 text-gray-600" },
  OP_TIJD: { label: "Op tijd", color: "bg-green-100 text-green-700" },
  TE_VROEG: { label: "Te vroeg", color: "bg-amber-100 text-amber-700" },
  TE_LAAT: { label: "Te laat", color: "bg-red-100 text-red-700" },
  GEMIST: { label: "Gemist", color: "bg-red-200 text-red-800" },
};

// ─── Interfaces ────────────────────────────────────────────

export interface LocationTimeWindow {
  id: string;
  client_location_id: string;
  tenant_id: string;
  day_of_week: number; // 0=mon, 1=tue, ..., 6=sun
  open_time: string;   // "HH:mm"
  close_time: string;  // "HH:mm"
  slot_duration_min: number;
  max_concurrent_slots: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlotBooking {
  id: string;
  tenant_id: string;
  client_location_id: string;
  order_id: string | null;
  trip_stop_id: string | null;
  slot_date: string;    // "YYYY-MM-DD"
  slot_start: string;   // "HH:mm"
  slot_end: string;     // "HH:mm"
  status: SlotBookingStatus;
  booked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  order?: { order_number: number; client_name: string };
  location?: { label: string; address: string };
}

// ─── UI Helper Types ───────────────────────────────────────

export interface TimeSlot {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

export interface SlotAvailability {
  slot: TimeSlot;
  totalCapacity: number;
  bookedCount: number;
  available: number;
}
