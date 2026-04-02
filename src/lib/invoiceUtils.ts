/**
 * Utility functions for invoice calculations and formatting.
 */

import jsPDF from "jspdf";
import type { Invoice, InvoiceLine } from "@/hooks/useInvoices";

// ─── PDF Generation ─────────────────────────────────────────────────

interface InvoiceWithLines extends Invoice {
  invoice_lines?: InvoiceLine[];
}

/**
 * Generate a professional PDF invoice and return it as a Blob.
 */
export function generateInvoicePDF(invoice: InvoiceWithLines): Blob {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;
  let y = 20;

  // ─── Colors ───
  const primaryColor: [number, number, number] = [15, 23, 42]; // slate-900
  const accentColor: [number, number, number] = [37, 99, 235]; // blue-600
  const mutedColor: [number, number, number] = [100, 116, 139]; // slate-500
  const lightBg: [number, number, number] = [248, 250, 252]; // slate-50

  // ─── Header: Company info ───
  doc.setFillColor(...accentColor);
  doc.rect(0, 0, pageWidth, 40, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text("Royalty Cargo", marginLeft, y + 8);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Transport & Logistiek", marginLeft, y + 14);
  doc.text("Industrieweg 42, 3044 AT Rotterdam", marginLeft, y + 19);

  // Invoice label on the right
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("FACTUUR", pageWidth - marginRight, y + 10, { align: "right" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(invoice.invoice_number, pageWidth - marginRight, y + 17, { align: "right" });

  y = 50;

  // ─── Invoice meta + Client info side by side ───
  // Left: client
  doc.setTextColor(...primaryColor);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("FACTUUR AAN", marginLeft, y);
  y += 5;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(invoice.client_name, marginLeft, y);
  y += 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedColor);

  if (invoice.client_address) {
    const addressLines = doc.splitTextToSize(invoice.client_address, contentWidth / 2);
    doc.text(addressLines, marginLeft, y);
    y += addressLines.length * 4;
  }

  if (invoice.client_btw_number) {
    doc.text(`BTW: ${invoice.client_btw_number}`, marginLeft, y);
    y += 4;
  }

  if (invoice.client_kvk_number) {
    doc.text(`KVK: ${invoice.client_kvk_number}`, marginLeft, y);
    y += 4;
  }

  // Right: invoice details
  const rightCol = pageWidth - marginRight;
  let metaY = 55;

  const metaItems = [
    { label: "Factuurnummer", value: invoice.invoice_number },
    { label: "Factuurdatum", value: formatDateNL(invoice.invoice_date) },
    { label: "Vervaldatum", value: invoice.due_date ? formatDateNL(invoice.due_date) : "N.v.t." },
    { label: "Status", value: invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1) },
  ];

  for (const item of metaItems) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...mutedColor);
    doc.text(item.label, rightCol - 50, metaY);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...primaryColor);
    doc.text(item.value, rightCol, metaY, { align: "right" });
    metaY += 6;
  }

  y = Math.max(y, metaY) + 10;

  // ─── Line items table ───
  const lines = invoice.invoice_lines ?? [];
  const colX = {
    desc: marginLeft,
    qty: marginLeft + contentWidth * 0.5,
    unit: marginLeft + contentWidth * 0.6,
    price: marginLeft + contentWidth * 0.73,
    total: pageWidth - marginRight,
  };

  // Table header
  doc.setFillColor(...lightBg);
  doc.rect(marginLeft, y - 1, contentWidth, 8, "F");

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...mutedColor);
  doc.text("OMSCHRIJVING", colX.desc, y + 4);
  doc.text("AANTAL", colX.qty, y + 4, { align: "right" });
  doc.text("EENHEID", colX.unit + 5, y + 4);
  doc.text("PRIJS", colX.price + 5, y + 4, { align: "right" });
  doc.text("TOTAAL", colX.total, y + 4, { align: "right" });

  y += 12;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...primaryColor);

  for (const line of lines) {
    // Check if we need a new page
    if (y > 260) {
      doc.addPage();
      y = 20;
    }

    doc.setFontSize(9);
    // Wrap long descriptions
    const descLines = doc.splitTextToSize(line.description, contentWidth * 0.48);
    doc.text(descLines, colX.desc, y);

    doc.text(String(line.quantity), colX.qty, y, { align: "right" });
    doc.text(line.unit, colX.unit + 5, y);
    doc.text(formatCurrency(line.unit_price), colX.price + 5, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(line.total), colX.total, y, { align: "right" });
    doc.setFont("helvetica", "normal");

    const lineHeight = Math.max(descLines.length * 4, 4);
    y += lineHeight + 3;

    // Subtle line separator
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, y - 1, pageWidth - marginRight, y - 1);
  }

  y += 5;

  // ─── Totals ───
  const totalsX = pageWidth - marginRight - 60;
  const totalsValX = pageWidth - marginRight;

  // Subtotal
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedColor);
  doc.text("Subtotaal", totalsX, y);
  doc.setTextColor(...primaryColor);
  doc.text(formatCurrency(invoice.subtotal), totalsValX, y, { align: "right" });
  y += 6;

  // BTW
  doc.setTextColor(...mutedColor);
  doc.text(`BTW (${invoice.btw_percentage}%)`, totalsX, y);
  doc.setTextColor(...primaryColor);
  doc.text(formatCurrency(invoice.btw_amount), totalsValX, y, { align: "right" });
  y += 8;

  // Total line
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.5);
  doc.line(totalsX - 5, y - 2, totalsValX, y - 2);

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...accentColor);
  doc.text("Totaal", totalsX, y + 3);
  doc.text(formatCurrency(invoice.total), totalsValX, y + 3, { align: "right" });

  y += 15;

  // ─── Notes ───
  if (invoice.notes) {
    if (y > 250) { doc.addPage(); y = 20; }

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...mutedColor);
    doc.text("OPMERKINGEN", marginLeft, y);
    y += 5;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...primaryColor);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth);
    doc.text(noteLines, marginLeft, y);
    y += noteLines.length * 4 + 5;
  }

  // ─── Payment details ───
  if (y > 250) { doc.addPage(); y = 20; }

  doc.setFillColor(...lightBg);
  doc.roundedRect(marginLeft, y, contentWidth, 30, 3, 3, "F");

  y += 7;
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...mutedColor);
  doc.text("BETAALGEGEVENS", marginLeft + 5, y);
  y += 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...primaryColor);
  doc.text("IBAN: NL00 INGB 0000 0000 00", marginLeft + 5, y);
  y += 4.5;
  doc.text("T.n.v. Royalty Cargo B.V.", marginLeft + 5, y);
  y += 4.5;
  doc.text(`Referentie: ${invoice.invoice_number}`, marginLeft + 5, y);

  // ─── Footer ───
  const footerY = 285;
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, footerY - 5, pageWidth - marginRight, footerY - 5);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mutedColor);
  doc.text(
    "Royalty Cargo B.V. | KVK 12345678 | BTW NL001234567B01 | info@royaltycargo.nl",
    pageWidth / 2,
    footerY,
    { align: "center" }
  );

  return doc.output("blob");
}

/**
 * Generate and trigger a browser download for an invoice PDF.
 */
export function downloadInvoicePDF(invoice: InvoiceWithLines): void {
  const blob = generateInvoicePDF(invoice);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Factuur-${invoice.invoice_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Calculate line total from quantity and unit price.
 * Rounds to 2 decimal places.
 */
export function calculateLineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

/**
 * Calculate invoice totals (subtotal, BTW, total) from line items.
 */
export function calculateInvoiceTotals(
  lines: { total: number }[],
  btwPercentage: number
): {
  subtotal: number;
  btwAmount: number;
  total: number;
} {
  const subtotal = Math.round(lines.reduce((sum, line) => sum + line.total, 0) * 100) / 100;
  const btwAmount = Math.round(subtotal * (btwPercentage / 100) * 100) / 100;
  const total = Math.round((subtotal + btwAmount) * 100) / 100;
  return { subtotal, btwAmount, total };
}

/**
 * Generate invoice lines from an order and associated client rates.
 *
 * Supported rate types:
 *   per_rit, per_pallet, per_km,
 *   toeslag_adr, toeslag_koel, toeslag_weekend, toeslag_spoed
 */
export function generateInvoiceLines(
  order: {
    order_number?: string;
    weight_kg?: number;
    quantity?: number;
    transport_type?: string;
    pickup_address?: string;
    delivery_address?: string;
  },
  rates: { rate_type: string; amount: number; description?: string }[]
): {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}[] {
  const lines: {
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    total: number;
  }[] = [];

  const rateMap = new Map(rates.map((r) => [r.rate_type, r]));

  // Per-rit (per trip) rate
  const perRit = rateMap.get("per_rit");
  if (perRit) {
    const pickup = order.pickup_address ?? "Ophaaladres";
    const delivery = order.delivery_address ?? "Afleveradres";
    const desc = perRit.description ?? `Transport ${pickup} → ${delivery}`;
    lines.push({
      description: desc,
      quantity: 1,
      unit: "rit",
      unitPrice: perRit.amount,
      total: calculateLineTotal(1, perRit.amount),
    });
  }

  // Per-pallet rate
  const perPallet = rateMap.get("per_pallet");
  if (perPallet && order.quantity && order.quantity > 0) {
    const desc = perPallet.description ?? "Palletvervoer";
    lines.push({
      description: desc,
      quantity: order.quantity,
      unit: "pallet",
      unitPrice: perPallet.amount,
      total: calculateLineTotal(order.quantity, perPallet.amount),
    });
  }

  // Per-km rate
  const perKm = rateMap.get("per_km");
  if (perKm) {
    // Default distance estimate when actual distance is not available
    const estimatedKm = 100;
    const desc = perKm.description ?? `Kilometervergoeding (geschat ${estimatedKm} km)`;
    lines.push({
      description: desc,
      quantity: estimatedKm,
      unit: "km",
      unitPrice: perKm.amount,
      total: calculateLineTotal(estimatedKm, perKm.amount),
    });
  }

  // Surcharges
  const surcharges: { type: string; label: string }[] = [
    { type: "toeslag_adr", label: "Toeslag ADR (gevaarlijke stoffen)" },
    { type: "toeslag_koel", label: "Toeslag koeltransport" },
    { type: "toeslag_weekend", label: "Toeslag weekend" },
    { type: "toeslag_spoed", label: "Toeslag spoed" },
  ];

  for (const surcharge of surcharges) {
    const rate = rateMap.get(surcharge.type);
    if (rate) {
      lines.push({
        description: rate.description ?? surcharge.label,
        quantity: 1,
        unit: "stuks",
        unitPrice: rate.amount,
        total: calculateLineTotal(1, rate.amount),
      });
    }
  }

  return lines;
}

/**
 * Format a number as Dutch currency: "€ 1.234,56"
 */
export function formatCurrency(amount: number): string {
  const fixed = Math.abs(amount).toFixed(2);
  const [intPart, decPart] = fixed.split(".");

  // Add thousand separators (dots) to the integer part
  const withSeparators = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const formatted = `€ ${withSeparators},${decPart}`;
  return amount < 0 ? `- ${formatted}` : formatted;
}

/**
 * Format a date string or Date object as "dd-mm-yyyy" (Dutch format).
 */
export function formatDateNL(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
