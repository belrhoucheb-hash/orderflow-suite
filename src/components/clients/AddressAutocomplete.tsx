import { useCallback, useEffect, useRef, useState } from "react";
import { Autocomplete, GoogleMap, Marker } from "@react-google-maps/api";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";
import { MapPin, Loader2 } from "lucide-react";

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
}

const NL_CENTER = { lat: 52.1326, lng: 5.2913 };

function parsePlace(place: google.maps.places.PlaceResult): Partial<AddressValue> {
  const components = place.address_components ?? [];
  const get = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name ?? "";
  const getShort = (type: string) =>
    components.find((c) => c.types.includes(type))?.short_name ?? "";

  const streetNumber = get("street_number");
  const numberMatch = streetNumber.match(/^(\d+)\s*(.*)$/);

  return {
    street: get("route"),
    house_number: numberMatch ? numberMatch[1] : streetNumber,
    house_number_suffix: numberMatch ? numberMatch[2].trim() : "",
    zipcode: get("postal_code"),
    city: get("locality") || get("postal_town") || get("administrative_area_level_2"),
    country: getShort("country") || "NL",
    lat: place.geometry?.location?.lat() ?? null,
    lng: place.geometry?.location?.lng() ?? null,
    coords_manual: false,
  };
}

export function AddressAutocomplete({ value, onChange, error }: Props) {
  const { isLoaded, loadError, missingKey } = useGoogleMaps();
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
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

  if (missingKey) {
    return (
      <div className="rounded border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
        VITE_GOOGLE_MAPS_API_KEY ontbreekt in de env. Neem contact op met de beheerder.
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
        Google Maps kon niet laden. Controleer je internetverbinding en probeer opnieuw.
      </div>
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
      <div>
        <label className="label-luxe">Zoek adres</label>
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
            placeholder="Typ straat + huisnummer, bijv. Winthontlaan 30B Utrecht"
            className="field-luxe w-full"
          />
        </Autocomplete>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>

      <div className="grid grid-cols-12 gap-2">
        <ReadField label="Straat" value={value.street} className="col-span-8" />
        <ReadField label="Nr." value={value.house_number} className="col-span-2" />
        <ReadField label="Bijvoegsel" value={value.house_number_suffix} className="col-span-2" />
        <ReadField label="Postcode" value={value.zipcode} className="col-span-4" />
        <ReadField label="Plaats" value={value.city} className="col-span-6" />
        <ReadField label="Land" value={value.country} className="col-span-2" />
        <ReadField
          label="Latitude"
          value={value.lat !== null ? value.lat.toFixed(7) : ""}
          className="col-span-6"
        />
        <ReadField
          label="Longitude"
          value={value.lng !== null ? value.lng.toFixed(7) : ""}
          className="col-span-6"
        />
      </div>

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

      {!hasCoords && (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Selecteer een adres uit de suggesties om de kaart te tonen.
        </p>
      )}
      {value.coords_manual && hasCoords && (
        <p className="text-xs text-[hsl(var(--gold-deep))]">
          Coordinaten handmatig aangepast. Chauffeurs navigeren naar deze exacte locatie.
        </p>
      )}
    </div>
  );
}

function ReadField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label-luxe">{label}</label>
      <div className="field-luxe flex min-h-[2.25rem] items-center bg-muted/30 text-sm text-foreground">
        {value || <span className="text-muted-foreground">—</span>}
      </div>
    </div>
  );
}
