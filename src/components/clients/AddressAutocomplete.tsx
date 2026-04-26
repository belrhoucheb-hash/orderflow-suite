import { useCallback, useEffect, useRef, useState } from "react";
import { Autocomplete, GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { MapPin, Loader2, Crosshair } from "lucide-react";

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

interface Props {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  error?: string;
  onBlur?: () => void;
  searchLabel?: string;
  searchPlaceholder?: string;
}

const NL_CENTER = { lat: 52.1326, lng: 5.2913 };

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
}: Props) {
  const { isLoaded, loadError, missingKey } = useGoogleMaps();
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [searchInput, setSearchInput] = useState(() => {
    const parts = [value.street, value.house_number, value.house_number_suffix].filter(Boolean);
    return parts.join(" ");
  });

  const hasCoords = value.lat !== null && value.lng !== null;
  const mapCenter = hasCoords ? { lat: value.lat!, lng: value.lng! } : NL_CENTER;

  const onPlaceChanged = useCallback(() => {
    const place = autocompleteRef.current?.getPlace();
    if (!place || !place.geometry) return;
    const parsed = parsePlace(place);
    onChange({ ...value, ...parsed } as AddressValue);
    const parts = [parsed.street, parsed.house_number, parsed.house_number_suffix].filter(Boolean);
    setSearchInput(parts.join(" "));
  }, [onChange, value]);

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
    }
  }, [value.street, value.house_number, value.house_number_suffix]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="text-[11px] font-medium text-[hsl(var(--gold-deep))] underline-offset-4 hover:underline"
          >
            Handmatig invoeren
          </button>
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
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={onBlur}
            placeholder={searchPlaceholder}
            className="field-luxe w-full"
          />
        </Autocomplete>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
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

      {!manualMode && (
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

      {!manualMode && (
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

      {!manualMode && !hasCoords && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Selecteer een adres uit de suggesties om de kaart te tonen.
        </p>
      )}
      {!manualMode && value.coords_manual && hasCoords && (
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
