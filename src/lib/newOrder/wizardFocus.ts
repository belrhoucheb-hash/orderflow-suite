export type WizardFocusTarget =
  | "client"
  | "pickup"
  | "delivery"
  | "quantity"
  | "dimensions"
  | "weight"
  | "time"
  | "transport"
  | "security"
  | "pricing";

export const validationTargetByErrorKey: Record<string, WizardFocusTarget> = {
  client_name: "client",
  pickup_address: "pickup",
  pickup_structured: "pickup",
  delivery_address: "delivery",
  delivery_structured: "delivery",
  quantity: "quantity",
  unit: "quantity",
  weight_kg: "weight",
  afdeling: "transport",
  pickup_time_window: "time",
  delivery_time_window: "time",
  route_sequence: "time",
  route_duplicate: "delivery",
  vehicle_capacity: "transport",
  pmt_method: "security",
};
