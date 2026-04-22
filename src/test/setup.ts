import "@testing-library/jest-dom";
import React from "react";
import { vi } from "vitest";

// @react-google-maps/api is een grote bundle die bij module-parse de loader
// initialiseert en async ingeladen wordt. In unit-tests raakt die code nooit
// de DOM (we mocken useGoogleMaps), maar de import-cost van de library zelf
// voegt 1-2s toe aan elk testfile dat ClientDetailPanel of AddressAutocomplete
// dynamisch importeert. Vervangen door synchrone no-op componenten.
vi.mock("@react-google-maps/api", () => {
  const Noop = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    GoogleMap: Noop,
    Marker: () => null,
    Autocomplete: Noop,
    LoadScript: Noop,
    LoadScriptNext: Noop,
    useJsApiLoader: () => ({ isLoaded: false, loadError: undefined }),
    useLoadScript: () => ({ isLoaded: false, loadError: undefined }),
  };
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock scrollTo
window.scrollTo = vi.fn() as any;
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock URL.createObjectURL
URL.createObjectURL = vi.fn(() => "blob:mock-url");
URL.revokeObjectURL = vi.fn();
