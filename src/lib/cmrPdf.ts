/**
 * On-device CMR-vrachtbrief generator. Genereert een eenvoudig A4-portrait PDF
 * met de essentiele velden, embedded handtekening en eventuele foto's. Bedoeld
 * als formele aanvulling op de bestaande POD-flow zodat we direct na onder-
 * tekening een leesbaar document hebben dat we kunnen archiveren.
 *
 * De generator draait volledig in de browser (jsPDF). Faalt iets, dan moet de
 * caller fail-soft zijn: een ontbrekende CMR-PDF mag de POD-submit niet blokkeren.
 */
import { jsPDF } from "jspdf";

export interface CmrPdfInput {
  orderId: string;
  recipientName: string;
  signatureDataUrl: string;
  photoUrls?: string[];
  vehicle?: { name?: string | null; plate?: string | null } | null;
  driver?: { name?: string | null } | null;
  pickup?: { address?: string | null } | null;
  delivery?: { address?: string | null } | null;
  weightKg?: number | null;
  palletCount?: number | null;
  signedAt: string;
  notes?: string | null;
  reference?: string | null;
  carrierName?: string | null;
}

const MARGIN = 14; // mm
const PAGE_WIDTH = 210; // A4 portrait
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function safeText(value: unknown, fallback = "-"): string {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s.length === 0 ? fallback : s;
}

function detectImageFormat(dataUrl: string): "PNG" | "JPEG" {
  const header = dataUrl.slice(0, 30).toLowerCase();
  return header.includes("image/png") ? "PNG" : "JPEG";
}

/**
 * Render een formele CMR-stijl vrachtbrief op A4-portret en geef een PDF-blob terug.
 */
export async function generateCmrPdf(input: CmrPdfInput): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  let y = MARGIN;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("CMR Vrachtbrief", MARGIN, y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Referentie: ${safeText(input.reference ?? input.orderId)}`, MARGIN, y);
  doc.text(`Datum: ${formatDate(input.signedAt)}`, PAGE_WIDTH - MARGIN, y, { align: "right" });
  y += 4;

  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 6;

  // Sectie helper
  const section = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(title, MARGIN, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
  };

  const labelValue = (label: string, value: string) => {
    const wrapped = doc.splitTextToSize(value, CONTENT_WIDTH - 38);
    doc.setTextColor(110);
    doc.text(label, MARGIN, y);
    doc.setTextColor(20);
    doc.text(wrapped, MARGIN + 38, y);
    y += Math.max(5, wrapped.length * 5);
  };

  // Vervoerder
  section("Vervoerder");
  labelValue("Bedrijf:", safeText(input.carrierName));
  labelValue("Chauffeur:", safeText(input.driver?.name));
  labelValue(
    "Voertuig:",
    [safeText(input.vehicle?.name, ""), safeText(input.vehicle?.plate, "")]
      .filter((v) => v.length > 0)
      .join(" / ") || "-",
  );
  y += 2;

  // Ophalen
  section("Ophalen");
  labelValue("Adres:", safeText(input.pickup?.address));
  y += 2;

  // Leveren
  section("Leveren");
  labelValue("Adres:", safeText(input.delivery?.address));
  y += 2;

  // Lading
  section("Lading");
  const weightLabel = input.weightKg !== null && input.weightKg !== undefined
    ? `${input.weightKg} kg`
    : "-";
  const palletLabel = input.palletCount !== null && input.palletCount !== undefined
    ? String(input.palletCount)
    : "-";
  labelValue("Gewicht:", weightLabel);
  labelValue("Pallets:", palletLabel);
  if (input.notes && input.notes.trim().length > 0) {
    labelValue("Opmerkingen:", input.notes);
  }
  y += 2;

  // Ontvanger + handtekening
  section("Ontvanger");
  labelValue("Naam:", safeText(input.recipientName));
  labelValue("Getekend op:", formatDate(input.signedAt));
  y += 2;

  if (input.signatureDataUrl) {
    doc.setFont("helvetica", "bold");
    doc.text("Handtekening:", MARGIN, y);
    y += 3;
    try {
      const fmt = detectImageFormat(input.signatureDataUrl);
      const sigW = 70;
      const sigH = 30;
      doc.addImage(input.signatureDataUrl, fmt, MARGIN, y, sigW, sigH, undefined, "FAST");
      doc.setDrawColor(200);
      doc.rect(MARGIN, y, sigW, sigH);
      y += sigH + 4;
    } catch {
      // Handtekening niet renderbaar; sla over zonder de PDF te breken.
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text("(handtekening niet beschikbaar)", MARGIN, y);
      y += 5;
    }
  }

  // Voettekst
  const footerY = 287;
  doc.setDrawColor(180);
  doc.line(MARGIN, footerY - 6, PAGE_WIDTH - MARGIN, footerY - 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Dit document is digitaal gegenereerd op basis van de afleverbevestiging in OrderFlow.",
    MARGIN,
    footerY,
  );

  const blob = doc.output("blob");
  return blob;
}
