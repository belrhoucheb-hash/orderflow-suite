export interface OrderDraft {
  id: string;
  order_number: number;
  status: string;
  source_email_from: string | null;
  source_email_subject: string | null;
  source_email_body: string | null;
  confidence_score: number | null;
  transport_type: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  quantity: number | null;
  unit: string | null;
  weight_kg: number | null;
  is_weight_per_unit: boolean;
  dimensions: string | null;
  requirements: string[] | null;
  client_name: string | null;
  received_at: string | null;
  created_at: string;
  attachments: { name: string; url: string; type: string }[] | null;
  pickup_time_from: string | null;
  pickup_time_to: string | null;
  delivery_time_from: string | null;
  delivery_time_to: string | null;
  internal_note: string | null;
  missing_fields: string[] | null;
  follow_up_draft: string | null;
  follow_up_sent_at: string | null;
  thread_type: string;
  parent_order_id: string | null;
  changes_detected: { field: string; old_value: string; new_value: string }[] | null;
  anomalies: { field: string; value: number; avg_value: number; message: string }[] | null;
}

export type FieldSource = "email" | "pdf" | "both";
export type FieldSources = Record<string, FieldSource>;

export interface FormState {
  transportType: string;
  pickupAddress: string;
  deliveryAddress: string;
  quantity: number;
  unit: string;
  weight: string;
  dimensions: string;
  requirements: string[];
  perUnit: boolean;
  internalNote: string;
  fieldSources: FieldSources;
}

export interface ClientRecord {
  id: string;
  name: string;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  country: string;
}

export const THREAD_TYPE_CONFIG: Record<string, { label: string; color: string; icon: any; listLabel: string; listColor: string }> = {
  new: { label: "Nieuw", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "Plus", listLabel: "Nieuw", listColor: "text-emerald-700 bg-emerald-500/15 border-emerald-500/25" },
  update: { label: "Wijziging", color: "bg-blue-50 text-blue-700 border-blue-200", icon: "ArrowLeft", listLabel: "Update", listColor: "text-violet-700 bg-violet-500/15 border-violet-500/25" },
  cancellation: { label: "Annulering", color: "bg-destructive/10 text-destructive border-destructive/20", icon: "Trash2", listLabel: "Annulering", listColor: "text-destructive bg-destructive/10 border-destructive/20" },
  confirmation: { label: "Bevestiging", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "CheckCircle2", listLabel: "Bevestiging", listColor: "text-emerald-700 bg-emerald-500/15 border-emerald-500/25" },
  question: { label: "Vraag", color: "bg-violet-50 text-violet-700 border-violet-200", icon: "CircleAlert", listLabel: "Vraag", listColor: "text-violet-700 bg-violet-500/15 border-violet-500/25" },
};

import { ThermometerSnowflake, AlertTriangle, Truck, FileCheck } from "lucide-react";

export const requirementOptions = [
  { id: "Koeling", label: "Koeling", icon: ThermometerSnowflake, color: "text-sky-600 bg-sky-50 border-sky-200" },
  { id: "ADR", label: "ADR", icon: AlertTriangle, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { id: "Laadklep", label: "Laadklep", icon: Truck, color: "text-violet-600 bg-violet-50 border-violet-200" },
  { id: "Douane", label: "Douane", icon: FileCheck, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
];
