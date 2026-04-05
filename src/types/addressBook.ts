/** A learned address alias for a specific client */
export interface ClientAddressEntry {
  id: string;
  tenant_id: string;
  client_id: string;
  alias: string;
  resolved_address: string;
  resolved_lat: number | null;
  resolved_lng: number | null;
  usage_count: number;
  last_used_at: string;
  created_at: string;
}

/** Result of attempting to resolve a raw address string against the client address book */
export interface AddressResolveResult {
  /** The full resolved address */
  resolved_address: string;
  /** Latitude if known */
  resolved_lat: number | null;
  /** Longitude if known */
  resolved_lng: number | null;
  /** The alias that was matched */
  matched_alias: string;
  /** The address book entry ID */
  entry_id: string;
  /** How the match was made */
  match_type: "exact" | "fuzzy";
}
