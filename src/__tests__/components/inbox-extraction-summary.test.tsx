import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "./inbox-test-setup";
import { baseDraft, baseForm, QWrapper } from "./inbox-test-setup";

describe("ExtractionSummary", () => {
  it("renders extracted fields", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={baseForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Dit hebben we begrepen")).toBeInTheDocument();
    expect(screen.getByText("Amsterdam")).toBeInTheDocument();
    expect(screen.getByText("Rotterdam")).toBeInTheDocument();
    expect(screen.getByText("2 Pallets")).toBeInTheDocument();
    expect(screen.getByText("500 kg")).toBeInTheDocument();
  });

  it("shows only transport type when fields are empty", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const emptyForm = { ...baseForm, pickupAddress: "", deliveryAddress: "", quantity: 0, weight: "", dimensions: "", requirements: [], transportType: "direct" };
    render(
      <QWrapper>
        <ExtractionSummary order={{ ...baseDraft, client_name: null } as any} form={emptyForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });

  it("shows capacity section", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={baseForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Beschikbare capaciteit")).toBeInTheDocument();
  });

  it("still renders when only transport type is present", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const emptyForm = { ...baseForm, pickupAddress: "", deliveryAddress: "", quantity: 0, weight: "", dimensions: "", requirements: [], transportType: "" };
    render(
      <QWrapper>
        <ExtractionSummary order={{ ...baseDraft, client_name: null } as any} form={emptyForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Direct")).toBeInTheDocument();
  });

  it("renders warehouse-air transport type", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const airForm = { ...baseForm, transportType: "warehouse-air" };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={airForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/Warehouse/)).toBeInTheDocument();
  });

  it("renders requirements in summary", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const reqForm = { ...baseForm, requirements: ["Koeling", "ADR"] };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={reqForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText(/Koeling/)).toBeInTheDocument();
    expect(screen.getByText(/ADR/)).toBeInTheDocument();
  });

  it("renders dimensions when provided", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const dimForm = { ...baseForm, dimensions: "120x80x100" };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={dimForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("120x80x100")).toBeInTheDocument();
  });

  it("shows per-eenheid suffix for perUnit weight", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    const perUnitForm = { ...baseForm, perUnit: true };
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={perUnitForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("500 kg per eenheid")).toBeInTheDocument();
  });

  it("renders no matching vehicles message when capacity is empty", async () => {
    const { ExtractionSummary } = await import("@/components/inbox/InboxExtractionSummary");
    render(
      <QWrapper>
        <ExtractionSummary order={baseDraft as any} form={baseForm as any} />
      </QWrapper>,
    );
    expect(screen.getByText("Geen geschikte voertuigen gevonden")).toBeInTheDocument();
  });
});
