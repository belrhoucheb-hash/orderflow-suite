/* eslint-disable react-refresh/only-export-components -- exports EMPTY_ADDRESS beside the component for form defaults. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Autocomplete, GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Crosshair, Loader2, MapPin } from "lucide-react";

export interface AddressValue {
  street: string;
  house_number: string;
  house_number_suffix: string;
  zipcode: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  coords_manual: boolean;
}

export const EMPTY_ADDRESS: AddressValue = {
  street: "",
  house_number: "",
  house_number_suffix: "",
  zipcode: "",
  city: "",
  country: "NL",
  lat: null,
  lng: null,
  coords_manual: false,
};

export interface AddressSuggestionOption {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
  value: AddressValue;
}

export interface AddressResolvedSelection {
  value: AddressValue;
  searchTerm: string;
  source: "google" | "quick_option";
  optionId?: string;
}

interface PlacesBusinessHit {
  place_id: string;
  name: string;
  description: string;
}

interface PlacesAddressHit {
  place_id: string;
  description: string;
}

interface PlacesBusinessDetails {
  name: string;
  formatted_address?: string;
  street: string;
  house_number: string;
  zipcode: string;
  city: string;
  country: string;
  phone: string;
  lat?: number | null;
  lng?: number | null;
}

interface FlowSuggestion {
  id: string;
  title: string;
  subtitle: string;
  source: "google" | "google_address" | "quick_option";
  badge?: string;
  option?: AddressSuggestionOption;
}

function addressFromGoogleDetails(
  current: AddressValue,
  details: PlacesBusinessDetails,
  fallbackAddress: string,
): AddressValue {
  const street = details.street || details.formatted_address || fallbackAddress;
  return {
    ...current,
    street,
    house_number: details.house_number || "",
    house_number_suffix: "",
    zipcode: details.zipcode || "",
    city: details.city || "",
    country: details.country || "NL",
    lat: typeof details.lat === "number" ? details.lat : null,
    lng: typeof details.lng === "number" ? details.lng : null,
    coords_manual: false,
  };
}

interface Props {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  error?: string;
  onBlur?: () => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  compactFlow?: boolean;
  quickOptions?: AddressSuggestionOption[];
  onQuickSelect?: (option: AddressSuggestionOption) => void;
  onSearchInputChange?: (value: string) => void;
  onResolvedSelection?: (selection: AddressResolvedSelection) => void;
  blockedAddresses?: string[];
  blockedMessage?: string;
}

const NL_CENTER = { lat: 52.1326, lng: 5.2913 };

function normalizeSuggestionText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function suggestionKey(suggestion: Pick<FlowSuggestion, "title" | "subtitle">): string {
  return normalizeSuggestionText(`${suggestion.title} ${suggestion.subtitle}`);
}

function parsePlace(place: google.maps.places.PlaceResult): Partial<AddressValue> {
  const components = place.address_components ?? [];
  const get = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name ?? "";
  const getShort = (type: string) =>
    components.find((c) => c.types.includes(type))?.short_name ?? "";

  const streetNumber = get("street_number");
  const subpremise = get("subpremise");
  // Google kan huisnummer-letter (bv. "19b") op twee manieren teruggeven:
  // inline in street_number ("19b") of als los subpremise-component ("b").
  const numberMatch = streetNumber.match(/^(\d+)\s*(.*)$/);
  const inlineSuffix = numberMatch ? numberMatch[2].trim() : "";

  return {
    street: get("route"),
    house_number: numberMatch ? numberMatch[1] : streetNumber,
    house_number_suffix: inlineSuffix || subpremise,
    zipcode: get("postal_code"),
    city: get("locality") || get("postal_town") || get("administrative_area_level_2"),
    country: getShort("country") || "NL",
    lat: place.geometry?.location?.lat() ?? null,
    lng: place.geometry?.location?.lng() ?? null,
    coords_manual: false,
  };
}

export function AddressAutocomplete({
  value,
  onChange,
  error,
  onBlur,
  searchLabel = "Zoek adres",
  searchPlaceholder = "Typ straat + huisnummer, bijv. Winthontlaan 30B Utrecht",
  compactFlow = false,
  quickOptions = [],
  onQuickSelect,
  onSearchInputChange,
  onResolvedSelection,
  blockedAddresses = [],
  blockedMessage = "Deze locatie is al gebruikt in de route.",
}: Props) {
  const { isLoaded, loadError, missingKey } = useGoogleMaps();
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const flowSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [flowSuggestionsOpen, setFlowSuggestionsOpen] = useState(false);
  const [flowGoogleSuggestions, setFlowGoogleSuggestions] = useState<PlacesBusinessHit[]>([]);
  const [flowAddressSuggestions, setFlowAddressSuggestions] = useState<PlacesAddressHit[]>([]);
  const [flowSearchLoading, setFlowSearchLoading] = useState(false);
  const [flowSearchError, setFlowSearchError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(() => {
    const parts = [value.street, value.house_number, value.house_number_suffix].filter(Boolean);
    return parts.join(" ");
  });

  const hasCoords = value.lat !== null && value.lng !== null;
  const mapCenter = hasCoords ? { lat: value.lat!, lng: value.lng! } : NL_CENTER;
  const shouldShowFlowError = Boolean(error) && (!compactFlow || manualMode || (!flowSuggestionsOpen && !flowSearchLoading));
  const blockedAddressKeys = useMemo(
    () => blockedAddresses.map(normalizeSuggestionText).filter(Boolean),
    [blockedAddresses],
  );

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place || !place.geometry) return;
    const parsed = parsePlace(place);
    const previousSearchTerm = searchInput.trim();
    const nextAddress = { ...value, ...parsed } as AddressValue;
    onChange(nextAddress);
    const parts = [parsed.street, parsed.house_number, parsed.house_number_suffix].filter(Boolean);
    const nextValue = parts.join(" ");
    setSearchInput(nextValue);
    onSearchInputChange?.(nextValue);
    onResolvedSelection?.({
      value: nextAddress,
      searchTerm: previousSearchTerm,
      source: "google",
    });
  }, [onChange, onResolvedSelection, onSearchInputChange, searchInput, value]);

  const onMarkerDragEnd = useCallback(
    async (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat == null || lng == null) return;
      const geocoder = new google.maps.Geocoder();
      try {
        const result = await geocoder.geocode({ location: { lat, lng } });
        const first = result.results[0];
        if (first) {
          const parsed = parsePlace(first as google.maps.places.PlaceResult);
          onChange({ ...value, ...parsed, lat, lng, coords_manual: true });
          const parts = [parsed.street, parsed.house_number, parsed.house_number_suffix].filter(Boolean);
          setSearchInput(parts.join(" "));
          return;
        }
      } catch {
        // reverse-geocode kan falen, we behouden coordinaten wel
      }
      onChange({ ...value, lat, lng, coords_manual: true });
    },
    [onChange, value]
  );

  useEffect(() => {
    const parts = [value.street, value.house_number, value.house_number_suffix].filter(Boolean);
    const composed = parts.join(" ");
    if (composed && composed !== searchInput) {
      setSearchInput(composed);
      onSearchInputChange?.(composed);
    }
  }, [value.street, value.house_number, value.house_number_suffix]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!compactFlow) return undefined;
    const handler = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setFlowSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [compactFlow]);

  const filteredQuickOptions = quickOptions
    .filter((option) => {
      const term = searchInput.trim().toLowerCase();
      if (!term) return true;
      return `${option.title} ${option.subtitle} ${option.badge ?? ""}`.toLowerCase().includes(term);
    })
    .slice(0, 4);

  const knownFlowSuggestions: FlowSuggestion[] = filteredQuickOptions.map((option) => ({
      id: `quick-${option.id}`,
      title: option.title,
      subtitle: option.subtitle,
      badge: option.badge,
      source: "quick_option" as const,
      option,
  }));

  const googleFlowSuggestions: FlowSuggestion[] = (() => {
    const raw: FlowSuggestion[] = [
      ...flowGoogleSuggestions
        .filter((hit) => {
          const haystack = normalizeSuggestionText(`${hit.name} ${hit.description}`);
          return !filteredQuickOptions.some((option) => {
            const optionKey = normalizeSuggestionText(option.subtitle || option.title);
            return haystack === optionKey || haystack.includes(optionKey);
          });
        })
        .map((hit) => ({
          id: `google-${hit.place_id}`,
          title: hit.name,
          subtitle: hit.description,
          source: "google" as const,
        })),
      ...flowAddressSuggestions
        .filter((hit) => {
          const normalized = normalizeSuggestionText(hit.description);
          return !filteredQuickOptions.some((option) => normalized === normalizeSuggestionText(option.subtitle)) &&
            !flowGoogleSuggestions.some((business) => normalized === normalizeSuggestionText(business.description));
        })
        .map((hit) => {
          const [title, ...rest] = hit.description.split(",").map((part) => part.trim()).filter(Boolean);
          return {
            id: `google-address-${hit.place_id || hit.description}`,
            title: title || hit.description,
            subtitle: rest.join(", ") || hit.description,
            source: "google_address" as const,
          };
        }),
    ];
    const seen = new Set<string>();
    return raw.filter((suggestion) => {
      const key = suggestionKey(suggestion);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 5);
  })();

  const flowSuggestions = [...knownFlowSuggestions, ...googleFlowSuggestions];
  const isFlowSuggestionBlocked = useCallback((suggestion: FlowSuggestion) => {
    if (blockedAddressKeys.length === 0) return false;
    const key = suggestionKey(suggestion);
    return blockedAddressKeys.some((blocked) => key === blocked || key.includes(blocked) || blocked.includes(key));
  }, [blockedAddressKeys]);

  const quickBadgeLabel = (badge?: string) => {
    if (!badge) return "bekend";
    if (badge.toLowerCase() === "recent") return "eerder gebruikt";
    if (badge.toLowerCase().includes("klant")) return "klant";
    return badge.toLowerCase();
  };

  const searchGoogleBusiness = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setFlowGoogleSuggestions([]);
      setFlowAddressSuggestions([]);
      setFlowSearchError(null);
      setFlowSearchLoading(false);
      setFlowSuggestionsOpen(filteredQuickOptions.length > 0);
      return;
    }

    setFlowSearchLoading(true);
    setFlowSearchError(null);
    try {
      const [businessResult, addressResult] = await Promise.allSettled([
        supabase.functions.invoke("google-places-business", {
          body: { mode: "search", query: trimmed },
        }),
        supabase.functions.invoke("google-places", {
          body: { input: trimmed },
        }),
      ]);
      const errors: string[] = [];

      if (businessResult.status === "fulfilled" && !businessResult.value.error) {
        const data = businessResult.value.data as { results?: PlacesBusinessHit[]; error?: string };
        if (data.error) {
          errors.push(data.error);
          setFlowGoogleSuggestions([]);
        } else {
          setFlowGoogleSuggestions((data.results ?? []).slice(0, 5));
        }
      } else {
        errors.push("Bedrijfszoeker niet bereikbaar");
        setFlowGoogleSuggestions([]);
      }

      if (addressResult.status === "fulfilled" && !addressResult.value.error) {
        const data = addressResult.value.data as { predictions?: PlacesAddressHit[]; error?: string };
        if (data.error) {
          errors.push(data.error);
          setFlowAddressSuggestions([]);
        } else {
          setFlowAddressSuggestions((data.predictions ?? []).slice(0, 5));
        }
      } else {
        errors.push("Adreszoeker niet bereikbaar");
        setFlowAddressSuggestions([]);
      }
      if (errors.length >= 2) {
        setFlowSearchError("Google suggesties zijn nu niet bereikbaar. Gebruik handmatig of controleer de edge function.");
      }
      setFlowSuggestionsOpen(true);
    } catch {
      setFlowGoogleSuggestions([]);
      setFlowAddressSuggestions([]);
      setFlowSearchError("Google suggesties zijn nu niet bereikbaar.");
      setFlowSuggestionsOpen(filteredQuickOptions.length > 0);
    } finally {
      setFlowSearchLoading(false);
    }
  }, [filteredQuickOptions.length]);

  const selectFlowSuggestion = useCallback(async (suggestion: FlowSuggestion) => {
    if (isFlowSuggestionBlocked(suggestion)) {
      setFlowSearchError(blockedMessage);
      return;
    }

    const previousSearchTerm = searchInput.trim();
    setFlowSuggestionsOpen(false);
    setFlowSearchError(null);

    if (suggestion.source === "quick_option" && suggestion.option) {
      onChange(suggestion.option.value);
      setSearchInput(suggestion.option.title);
      onSearchInputChange?.(suggestion.option.title);
      onQuickSelect?.(suggestion.option);
      onResolvedSelection?.({
        value: suggestion.option.value,
        searchTerm: previousSearchTerm,
        source: "quick_option",
        optionId: suggestion.option.id,
      });
      return;
    }

    if (suggestion.source === "google_address") {
      const description = suggestion.subtitle && suggestion.subtitle !== suggestion.title
        ? `${suggestion.title}, ${suggestion.subtitle}`
        : suggestion.title;
      const placeId = suggestion.id.replace(/^google-address-/, "");
      if (placeId && placeId !== description) {
        setFlowSearchLoading(true);
        try {
          const { data, error } = await supabase.functions.invoke("google-places-business", {
            body: { mode: "details", place_id: placeId },
          });
          if (error) throw new Error(error.message);
          if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
          const details = (data as { result?: PlacesBusinessDetails | null })?.result;
          if (details) {
            const nextAddress = addressFromGoogleDetails(value, details, description);
            onChange(nextAddress);
            setSearchInput(suggestion.title);
            onSearchInputChange?.(suggestion.title);
            onResolvedSelection?.({
              value: nextAddress,
              searchTerm: previousSearchTerm,
              source: "google",
            });
            return;
          }
        } catch {
          setFlowSearchError("Google gaf geen GPS-details terug. Probeer de suggestie opnieuw of gebruik handmatig.");
        } finally {
          setFlowSearchLoading(false);
        }
      }
      const nextAddress: AddressValue = {
        ...value,
        street: description,
        house_number: "",
        house_number_suffix: "",
        zipcode: "",
        city: "",
        country: "NL",
        lat: null,
        lng: null,
        coords_manual: false,
      };
      onChange(nextAddress);
      setSearchInput(suggestion.title);
      onSearchInputChange?.(suggestion.title);
      onResolvedSelection?.({
        value: nextAddress,
        searchTerm: previousSearchTerm,
        source: "google",
      });
      return;
    }

    const placeId = suggestion.id.replace(/^google-/, "");
    setFlowSearchLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-places-business", {
        body: { mode: "details", place_id: placeId },
      });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const details = (data as { result?: PlacesBusinessDetails | null })?.result;
      if (!details) throw new Error("Geen adresdetails gevonden");
      const nextAddress = addressFromGoogleDetails(value, details, suggestion.subtitle || suggestion.title);
      onChange(nextAddress);
      setSearchInput(suggestion.title);
      onSearchInputChange?.(suggestion.title);
      onResolvedSelection?.({
        value: nextAddress,
        searchTerm: previousSearchTerm,
        source: "google",
      });
    } catch {
      setSearchInput(suggestion.subtitle || suggestion.title);
      setFlowSearchError("Adresdetails ontbreken. Gebruik handmatige invoer als dit klopt.");
    } finally {
      setFlowSearchLoading(false);
    }
  }, [blockedMessage, isFlowSuggestionBlocked, onChange, onQuickSelect, onResolvedSelection, onSearchInputChange, searchInput, value]);

  if (compactFlow) {
    return (
      <div ref={wrapperRef} className="space-y-3">
        {!manualMode && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
            <label className="mb-2 block text-sm font-medium text-muted-foreground">{searchLabel}</label>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
              >
                Handmatig
              </button>
            </div>
            <div className="relative mt-1">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => {
                  const nextValue = e.target.value;
                  setSearchInput(nextValue);
                  onSearchInputChange?.(nextValue);
                  setFlowSuggestionsOpen(true);
                  if (flowSearchDebounceRef.current) clearTimeout(flowSearchDebounceRef.current);
                  flowSearchDebounceRef.current = setTimeout(() => searchGoogleBusiness(nextValue), 250);
                }}
                onFocus={() => {
                  if (flowSuggestions.length > 0 || searchInput.trim().length >= 2) {
                    setFlowSuggestionsOpen(true);
                    if (searchInput.trim().length >= 2) searchGoogleBusiness(searchInput);
                  }
                }}
                onBlur={onBlur}
                placeholder={searchPlaceholder}
                className="h-14 w-full rounded-2xl border border-[hsl(var(--gold)_/_0.22)] bg-white px-4 pr-10 text-base shadow-[inset_0_1px_0_hsl(var(--gold)_/_0.10),0_12px_34px_-30px_hsl(var(--gold-deep)_/_0.65)] outline-none transition placeholder:text-muted-foreground/70 focus:border-[hsl(var(--gold)_/_0.62)] focus:ring-4 focus:ring-[hsl(var(--gold)_/_0.18)]"
              />
              {flowSearchLoading && (
                <Loader2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
              {flowSuggestionsOpen && flowSuggestions.length > 0 && (
                <div className="mt-2 max-h-72 overflow-y-auto rounded-2xl border border-[hsl(var(--gold)_/_0.22)] bg-white shadow-[0_20px_45px_rgba(15,23,42,0.16),0_0_0_1px_hsl(var(--gold)_/_0.08)]">
                  {knownFlowSuggestions.length > 0 && (
                    <div className="border-b border-[hsl(var(--gold)_/_0.14)] bg-[hsl(var(--gold-soft)_/_0.28)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
                      Slim voorgesteld
                    </div>
                  )}
                  {knownFlowSuggestions.map((suggestion) => {
                    const blocked = isFlowSuggestionBlocked(suggestion);
                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        aria-disabled={blocked}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void selectFlowSuggestion(suggestion)}
                        className={[
                          "flex w-full items-start gap-3 border-b border-[hsl(var(--gold)_/_0.10)] px-4 py-3 text-left transition-colors last:border-b-0",
                          blocked ? "cursor-not-allowed bg-red-50/70 text-red-700" : "hover:bg-[hsl(var(--gold-soft)_/_0.35)]",
                        ].join(" ")}
                      >
                        <span className="mt-0.5 rounded-full bg-[hsl(var(--gold-soft)/0.7)] p-1.5 text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)_/_0.22)]">
                          <Building2 className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {suggestion.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {suggestion.subtitle}
                          </span>
                          {blocked && (
                            <span className="mt-1 block text-[11px] font-medium text-red-600">
                              Zelfde als ophaaladres
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.22)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--gold-deep))]">
                          {quickBadgeLabel(suggestion.badge)}
                        </span>
                      </button>
                    );
                  })}
                  {googleFlowSuggestions.length > 0 && (
                    <div className="border-b border-[hsl(var(--gold)_/_0.14)] bg-white px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))]">
                      Google
                    </div>
                  )}
                  {googleFlowSuggestions.map((suggestion) => {
                    const blocked = isFlowSuggestionBlocked(suggestion);
                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        aria-disabled={blocked}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void selectFlowSuggestion(suggestion)}
                        className={[
                          "flex w-full items-start gap-3 border-b border-[hsl(var(--gold)_/_0.10)] px-4 py-3 text-left transition-colors last:border-b-0",
                          blocked ? "cursor-not-allowed bg-red-50/70 text-red-700" : "hover:bg-[hsl(var(--gold-soft)_/_0.35)]",
                        ].join(" ")}
                      >
                        <span className="mt-0.5 rounded-full bg-[hsl(var(--gold-soft)/0.7)] p-1.5 text-[hsl(var(--gold-deep))] ring-1 ring-[hsl(var(--gold)_/_0.22)]">
                          <Building2 className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {suggestion.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {suggestion.subtitle}
                          </span>
                          {blocked && (
                            <span className="mt-1 block text-[11px] font-medium text-red-600">
                              Zelfde als ophaaladres
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 rounded-full border border-[hsl(var(--gold)_/_0.18)] bg-[hsl(var(--gold-soft)_/_0.22)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[hsl(var(--gold-deep))]">
                          google
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {flowSuggestionsOpen && searchInput.trim().length >= 2 && !flowSearchLoading && flowSuggestions.length === 0 && (
                <div className="mt-2 rounded-2xl border border-[hsl(var(--gold)_/_0.22)] bg-white p-4 shadow-[0_20px_45px_rgba(15,23,42,0.16),0_0_0_1px_hsl(var(--gold)_/_0.08)]">
                  <div className="text-sm font-semibold text-foreground">Geen bekende adressen</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Google zoekt mee. Geen match? Gebruik handmatig.
                  </div>
                </div>
              )}
            </div>
            {flowSearchError && <p className="mt-1 text-xs text-destructive">{flowSearchError}</p>}
            {shouldShowFlowError && <p className="mt-1 text-xs text-destructive">{error}</p>}
          </div>
        )}

        {manualMode && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.25)] px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Handmatige adresinvoer</p>
                <p className="text-xs text-muted-foreground">Gebruik dit als de locatie niet in de zoekresultaten staat.</p>
              </div>
              <button
                type="button"
                onClick={() => setManualMode(false)}
                className="text-[11px] font-medium text-[hsl(var(--gold-deep))] underline-offset-4 hover:underline"
              >
                Terug naar zoeken
              </button>
            </div>
            <ManualAddressFields value={value} onChange={onChange} error={error} onBlur={onBlur} />
          </div>
        )}
      </div>
    );
  }

  if (missingKey || loadError) {
    return (
      <ManualAddressFields value={value} onChange={onChange} error={error} onBlur={onBlur} />
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center gap-2 rounded border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Kaart laden...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!manualMode && (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="label-luxe">{searchLabel}</label>
          {!compactFlow && (
            <button
              type="button"
              onClick={() => setManualMode(true)}
              className="text-[11px] font-medium text-[hsl(var(--gold-deep))] underline-offset-4 hover:underline"
            >
              Handmatig invoeren
            </button>
          )}
        </div>
        <Autocomplete
          onLoad={(ac) => {
            autocompleteRef.current = ac;
            ac.setFields(["address_components", "geometry", "formatted_address"]);
            ac.setComponentRestrictions({ country: ["nl", "be", "de", "lu", "fr"] });
          }}
          onPlaceChanged={onPlaceChanged}
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              onSearchInputChange?.(e.target.value);
            }}
            onBlur={onBlur}
            placeholder={searchPlaceholder}
            className="field-luxe w-full"
          />
        </Autocomplete>
        {!compactFlow && (
          <p className="mt-1 text-xs text-muted-foreground">
            Zoekt via Google op bedrijfsnaam, straat en volledig adres.
          </p>
        )}
        {!manualMode && filteredQuickOptions.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-xl border border-border/60 bg-white">
            {filteredQuickOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const previousSearchTerm = searchInput.trim();
                  onChange(option.value);
                  setSearchInput(option.title);
                  onSearchInputChange?.(option.title);
                  onQuickSelect?.(option);
                  onResolvedSelection?.({
                    value: option.value,
                    searchTerm: previousSearchTerm,
                    source: "quick_option",
                    optionId: option.id,
                  });
                }}
                className="flex w-full items-start justify-between gap-3 border-b border-border/40 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-[hsl(var(--gold-soft)_/_0.25)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{option.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{option.subtitle}</div>
                </div>
                {option.badge && (
                  <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {option.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {shouldShowFlowError && <p className="mt-1 text-xs text-destructive">{error}</p>}
        {compactFlow && (
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="mt-2 text-[11px] font-medium text-muted-foreground underline-offset-4 transition hover:text-foreground hover:underline"
          >
            Geen match? Handmatig invoeren
          </button>
        )}
      </div>
      )}

      {manualMode && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.25)] px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Handmatige adresinvoer</p>
              <p className="text-xs text-muted-foreground">Gebruik dit als de locatie niet in de zoekresultaten staat.</p>
            </div>
            <button
              type="button"
              onClick={() => setManualMode(false)}
              className="text-[11px] font-medium text-[hsl(var(--gold-deep))] underline-offset-4 hover:underline"
            >
              Terug naar zoeken
            </button>
          </div>
          <ManualAddressFields value={value} onChange={onChange} error={error} onBlur={onBlur} />
        </div>
      )}

      {!manualMode && !compactFlow && (
      <div className="grid grid-cols-12 gap-2">
        <InputField
          label="Straat"
          value={value.street}
          onChange={(v) => onChange({ ...value, street: v })}
          className="col-span-8"
        />
        <InputField
          label="Nr."
          value={value.house_number}
          onChange={(v) => onChange({ ...value, house_number: v })}
          className="col-span-2"
        />
        <InputField
          label="Bijvoegsel"
          value={value.house_number_suffix}
          onChange={(v) => onChange({ ...value, house_number_suffix: v })}
          className="col-span-2"
        />
        <InputField
          label="Postcode"
          value={value.zipcode}
          onChange={(v) => onChange({ ...value, zipcode: v })}
          className="col-span-4"
        />
        <InputField
          label="Plaats"
          value={value.city}
          onChange={(v) => onChange({ ...value, city: v })}
          className="col-span-6"
        />
        <InputField
          label="Land"
          value={value.country}
          onChange={(v) => onChange({ ...value, country: v })}
          className="col-span-2"
        />
      </div>
      )}

      {!manualMode && !compactFlow && (
      <div className="overflow-hidden rounded border border-border">
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "260px" }}
          center={mapCenter}
          zoom={hasCoords ? 17 : 7}
          options={{
            streetViewControl: false,
            mapTypeControl: true,
            fullscreenControl: false,
            clickableIcons: false,
          }}
        >
          {hasCoords && (
            <Marker
              position={{ lat: value.lat!, lng: value.lng! }}
              draggable
              onDragEnd={onMarkerDragEnd}
            />
          )}
        </GoogleMap>
      </div>
      )}

      {!manualMode && !compactFlow && !hasCoords && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Selecteer een adres uit de suggesties om de kaart te tonen.
        </p>
      )}
      {!manualMode && !compactFlow && value.coords_manual && hasCoords && (
        <p className="text-xs text-[hsl(var(--gold-deep))]">
          Coordinaten handmatig aangepast. Chauffeurs navigeren naar deze exacte locatie.
        </p>
      )}
    </div>
  );
}

function ManualAddressFields({
  value,
  onChange,
  error,
  onBlur,
}: {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  error?: string;
  onBlur?: () => void;
}) {
  const update = <K extends keyof AddressValue>(key: K, next: AddressValue[K]) => {
    onChange({ ...value, [key]: next, lat: null, lng: null, coords_manual: false });
  };

  const updateCoordinate = (key: "lat" | "lng", next: string) => {
    const parsed = next.trim() === "" ? null : Number(next);
    onChange({
      ...value,
      [key]: Number.isFinite(parsed) ? parsed : null,
      coords_manual:
        key === "lat"
          ? Number.isFinite(parsed) && value.lng != null
          : value.lat != null && Number.isFinite(parsed),
    });
  };

  return (
    <div className="space-y-3" onBlur={onBlur}>
      <div className="rounded-xl border border-[hsl(var(--gold)/0.35)] bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.45),hsl(var(--background)))] p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-[hsl(var(--gold-soft)/0.8)] p-2 text-[hsl(var(--gold-deep))]">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-[hsl(var(--gold-deep))]">
              Handmatige adresinvoer actief
            </p>
            <p className="text-xs text-[hsl(var(--gold-deep))]">
              Google Maps is hier nu niet beschikbaar. Je kunt het adres volledig invullen en desgewenst meteen coordinaten meegeven voor exacte navigatie.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2">
        <InputField
          label="Straat"
          value={value.street}
          onChange={(v) => update("street", v)}
          className="col-span-8"
        />
        <InputField
          label="Nr."
          value={value.house_number}
          onChange={(v) => update("house_number", v)}
          className="col-span-2"
        />
        <InputField
          label="Bijvoegsel"
          value={value.house_number_suffix}
          onChange={(v) => update("house_number_suffix", v)}
          className="col-span-2"
        />
        <InputField
          label="Postcode"
          value={value.zipcode}
          onChange={(v) => update("zipcode", v)}
          className="col-span-4"
        />
        <InputField
          label="Plaats"
          value={value.city}
          onChange={(v) => update("city", v)}
          className="col-span-6"
        />
        <InputField
          label="Land"
          value={value.country}
          onChange={(v) => update("country", v)}
          className="col-span-2"
        />
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
          <p className="text-sm font-medium text-foreground">Exacte locatie</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Optioneel: vul latitude en longitude in als de chauffeur exact naar een dock, magazijnpoort of achteringang moet navigeren.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <InputField
            label="Latitude"
            value={value.lat?.toString() ?? ""}
            onChange={(v) => updateCoordinate("lat", v)}
          />
          <InputField
            label="Longitude"
            value={value.lng?.toString() ?? ""}
            onChange={(v) => updateCoordinate("lng", v)}
          />
        </div>
        {value.lat != null && value.lng != null && (
          <p className="text-xs text-[hsl(var(--gold-deep))]">
            Coordinaten opgeslagen. Chauffeurs navigeren naar deze exacte locatie.
          </p>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label-luxe">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-luxe w-full"
      />
    </div>
  );
}
