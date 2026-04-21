import { useJsApiLoader } from "@react-google-maps/api";

const LIBRARIES: ("places")[] = ["places"];

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

export function useGoogleMaps() {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "orderflow-google-maps",
    googleMapsApiKey: API_KEY ?? "",
    libraries: LIBRARIES,
    language: "nl",
    region: "NL",
  });

  return {
    isLoaded,
    loadError,
    missingKey: !API_KEY,
  };
}
