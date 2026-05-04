import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/connectors/bundles", () => ({
  findBundle: () => ({
    id: "bundle-test",
    title: "Test Bundle",
    blurb: "Korte uitleg",
    slugs: ["alpha", "beta"],
    accent: "from-rose-50 to-amber-50",
    tagline: "Tagline",
    icon: "sparkles",
  }),
}));

vi.mock("@/lib/connectors/catalog", () => ({
  CATEGORY_LABELS: {
    boekhouding: "Boekhouding",
    telematica: "Telematica",
    communicatie: "Communicatie",
    webshop_erp: "Webshop & ERP",
    klantportaal: "Klantportalen",
    overig: "Overig",
  },
}));

vi.mock("@/hooks/useConnectors", () => ({
  useConnectorList: () => ({
    data: [
      {
        slug: "alpha",
        name: "Alpha",
        description: "alpha desc",
        category: "boekhouding",
        status: "live",
        brandColor: "111111",
        brandInitial: "A",
        capabilities: [],
        supportedEvents: [],
        enabled: false,
        hasCredentials: false,
        mappingKeys: [],
        setupHint: "",
        authType: "api_key",
      },
      {
        slug: "beta",
        name: "Beta",
        description: "beta desc",
        category: "boekhouding",
        status: "live",
        brandColor: "222222",
        brandInitial: "B",
        capabilities: [],
        supportedEvents: [],
        enabled: true,
        hasCredentials: true,
        mappingKeys: [],
        setupHint: "",
        authType: "api_key",
      },
    ],
    isLoading: false,
  }),
}));

import { BundleDetail } from "@/components/settings/BundleDetail";

function renderBundle() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BundleDetail bundleId="bundle-test" onBack={vi.fn()} onSelectConnector={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe("BundleDetail skip-pad", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("toont een Sla over-link voor niet-actieve stappen", () => {
    renderBundle();
    expect(screen.getByText("Sla over")).toBeInTheDocument();
  });

  it("schrijft skip-state naar localStorage en toont Overgeslagen-pill", () => {
    renderBundle();

    fireEvent.click(screen.getByText("Sla over"));

    expect(window.localStorage.getItem("orderflow_bundle_skipped_bundle-test_alpha")).toBe("1");
    expect(screen.getByText("Overgeslagen")).toBeInTheDocument();
    expect(screen.getByText("Toch verbinden")).toBeInTheDocument();
  });

  it("herstelt skip-state via Toch verbinden", () => {
    window.localStorage.setItem("orderflow_bundle_skipped_bundle-test_alpha", "1");
    renderBundle();

    expect(screen.getByText("Overgeslagen")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Toch verbinden"));

    expect(window.localStorage.getItem("orderflow_bundle_skipped_bundle-test_alpha")).toBeNull();
    expect(screen.getByText("Sla over")).toBeInTheDocument();
  });

  it("telt skipped-stappen mee in voortgangsbalk maar laat aparte counts zien", () => {
    window.localStorage.setItem("orderflow_bundle_skipped_bundle-test_alpha", "1");
    renderBundle();

    // beta = actief (1), alpha = overgeslagen (1), gepland = 0, totaal 2 -> 100%
    expect(screen.getByText(/1 \/ 2 actief · 100%/)).toBeInTheDocument();

    // Strong tags rond getallen, dus check label + nummer combinatie
    const counts = screen.getByText(/gepland:/).parentElement?.textContent ?? "";
    expect(counts).toMatch(/gepland:\s*0/);
    expect(counts).toMatch(/overgeslagen:\s*1/);
    expect(counts).toMatch(/actief:\s*1/);
  });
});
