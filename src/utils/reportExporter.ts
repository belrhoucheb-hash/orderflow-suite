/**
 * Report export utilities for PDF and CSV generation.
 *
 * PDF exports use jsPDF (already a project dependency via invoiceUtils).
 * CSV exports use semicolons and Dutch formatting for Excel compatibility.
 */

import { DEFAULT_COMPANY } from "@/lib/companyConfig";
import { formatCurrency, formatDateNL } from "@/lib/invoiceUtils";

// ─── Types ──────────────────────────────────────────────────────────

export interface ReportOrder {
  id: string;
  order_number?: string | number;
  created_at: string;
  status: string;
  client_name?: string | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
  weight_kg?: number | null;
  quantity?: number | null;
  vehicle_id?: string | null;
  updated_at?: string | null;
}

export interface ReportTrip {
  id: string;
  trip_number?: string | number;
  date: string;
  driver_name?: string | null;
  vehicle_name?: string | null;
  route?: string | null;
  stops?: number | null;
  distance_km?: number | null;
  cost?: number | null;
  revenue?: number | null;
  margin?: number | null;
}

export interface ReportInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  invoice_date: string;
  due_date?: string | null;
  subtotal: number;
  btw_amount: number;
  total: number;
  status: string;
}

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  title?: string;
}

// ─── Status labels (Dutch) ──────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nieuw",
  PENDING: "In behandeling",
  PLANNED: "Gepland",
  IN_TRANSIT: "Onderweg",
  DELIVERED: "Afgeleverd",
  CANCELLED: "Geannuleerd",
};

function dutchStatus(status: string): string {
  return STATUS_LABELS[status] || status;
}

// ─── Generic CSV export ─────────────────────────────────────────────

/**
 * Generate a semicolon-delimited CSV string with BOM for Excel.
 * Uses Dutch conventions (semicolons, comma decimals).
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  columns: { key: string; header: string }[],
  filename: string,
): void {
  const csv = generateCSVContent(data, columns);
  downloadCSVBlob(csv, filename);
}

/** Generate CSV content string (testable without DOM). */
export function generateCSVContent(
  data: Record<string, unknown>[],
  columns: { key: string; header: string }[],
): string {
  const header = columns.map((c) => c.header).join(";");
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const val = row[c.key];
        if (val == null) return "";
        if (typeof val === "number") return val.toFixed(2).replace(".", ",");
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(";"),
  );
  return [header, ...rows].join("\n");
}

function downloadCSVBlob(csv: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ─── Orders CSV ─────────────────────────────────────────────────────

const ORDER_CSV_COLUMNS = [
  { key: "order_number", header: "Ordernummer" },
  { key: "created_at", header: "Aangemaakt" },
  { key: "status", header: "Status" },
  { key: "client_name", header: "Klant" },
  { key: "pickup_address", header: "Ophaaladres" },
  { key: "delivery_address", header: "Afleveradres" },
  { key: "weight_kg", header: "Gewicht (kg)" },
  { key: "quantity", header: "Aantal" },
];

export function exportOrdersCSV(orders: ReportOrder[]): void {
  const data = orders.map((o) => ({
    order_number: o.order_number ?? o.id,
    created_at: formatDateNL(o.created_at),
    status: dutchStatus(o.status),
    client_name: o.client_name ?? "",
    pickup_address: o.pickup_address ?? "",
    delivery_address: o.delivery_address ?? "",
    weight_kg: o.weight_kg ?? 0,
    quantity: o.quantity ?? 0,
  }));
  exportToCSV(data, ORDER_CSV_COLUMNS, `orders-export-${formatDateNL(new Date())}.csv`);
}

// ─── Trips CSV ──────────────────────────────────────────────────────

const TRIP_CSV_COLUMNS = [
  { key: "trip_number", header: "Ritnummer" },
  { key: "date", header: "Datum" },
  { key: "driver_name", header: "Chauffeur" },
  { key: "vehicle_name", header: "Voertuig" },
  { key: "route", header: "Route" },
  { key: "stops", header: "Stops" },
  { key: "distance_km", header: "Afstand (km)" },
  { key: "cost", header: "Kosten" },
  { key: "revenue", header: "Omzet" },
  { key: "margin", header: "Marge" },
];

export function exportTripsCSV(trips: ReportTrip[]): void {
  const data = trips.map((t) => ({
    trip_number: t.trip_number ?? t.id,
    date: formatDateNL(t.date),
    driver_name: t.driver_name ?? "",
    vehicle_name: t.vehicle_name ?? "",
    route: t.route ?? "",
    stops: t.stops ?? 0,
    distance_km: t.distance_km ?? 0,
    cost: t.cost ?? 0,
    revenue: t.revenue ?? 0,
    margin: t.margin ?? 0,
  }));
  exportToCSV(data, TRIP_CSV_COLUMNS, `ritten-export-${formatDateNL(new Date())}.csv`);
}

// ─── Invoices CSV ───────────────────────────────────────────────────

const INVOICE_CSV_COLUMNS = [
  { key: "invoice_number", header: "Factuurnummer" },
  { key: "client_name", header: "Klant" },
  { key: "invoice_date", header: "Factuurdatum" },
  { key: "due_date", header: "Vervaldatum" },
  { key: "subtotal", header: "Subtotaal" },
  { key: "btw_amount", header: "BTW" },
  { key: "total", header: "Totaal" },
  { key: "status", header: "Status" },
];

export function exportInvoicesCSV(invoices: ReportInvoice[]): void {
  const data = invoices.map((inv) => ({
    invoice_number: inv.invoice_number,
    client_name: inv.client_name,
    invoice_date: formatDateNL(inv.invoice_date),
    due_date: inv.due_date ? formatDateNL(inv.due_date) : "",
    subtotal: inv.subtotal,
    btw_amount: inv.btw_amount,
    total: inv.total,
    status: inv.status,
  }));
  exportToCSV(data, INVOICE_CSV_COLUMNS, `facturen-export-${formatDateNL(new Date())}.csv`);
}

// ─── PDF Helpers ────────────────────────────────────────────────────

interface JsPDFDoc {
  setFillColor: (...args: number[]) => void;
  setTextColor: (...args: number[]) => void;
  setDrawColor: (...args: number[]) => void;
  setFontSize: (size: number) => void;
  setFont: (name: string, style: string) => void;
  setLineWidth: (w: number) => void;
  text: (text: string | string[], x: number, y: number, opts?: Record<string, unknown>) => void;
  rect: (x: number, y: number, w: number, h: number, style: string) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  addPage: () => void;
  splitTextToSize: (text: string, maxWidth: number) => string[];
  internal: { getNumberOfPages: () => number; pages: unknown[] };
  setPage: (n: number) => void;
  output: (type: string) => Blob;
}

const PRIMARY: [number, number, number] = [15, 23, 42];
const ACCENT: [number, number, number] = [37, 99, 235];
const MUTED: [number, number, number] = [100, 116, 139];
const LIGHT_BG: [number, number, number] = [248, 250, 252];

function drawReportHeader(
  doc: JsPDFDoc,
  title: string,
  filters: ReportFilters,
): number {
  const pageWidth = 210;
  const ml = 20;

  // Header bar
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageWidth, 36, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(DEFAULT_COMPANY.name, ml, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(DEFAULT_COMPANY.address, ml, 23);

  // Title on the right
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, pageWidth - 20, 16, { align: "right" });

  // Date range
  if (filters.startDate || filters.endDate) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const range = `${filters.startDate ? formatDateNL(filters.startDate) : ""} - ${filters.endDate ? formatDateNL(filters.endDate) : ""}`;
    doc.text(range, pageWidth - 20, 24, { align: "right" });
  }

  // Generated timestamp
  doc.setTextColor(...MUTED);
  doc.setFontSize(7);
  doc.text(`Gegenereerd: ${formatDateNL(new Date())}`, pageWidth - 20, 31, {
    align: "right",
  });

  return 44; // next y position
}

function drawFooters(doc: JsPDFDoc): void {
  const pageWidth = 210;
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.line(20, 280, pageWidth - 20, 280);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(
      `${DEFAULT_COMPANY.legalName} | KVK ${DEFAULT_COMPANY.kvk} | BTW ${DEFAULT_COMPANY.btw}`,
      20,
      285,
    );
    doc.text(`Pagina ${i} / ${totalPages}`, pageWidth - 20, 285, {
      align: "right",
    });
  }
}

function drawTableHeader(
  doc: JsPDFDoc,
  columns: { label: string; x: number; align?: string }[],
  y: number,
  contentWidth: number,
  ml: number,
): number {
  doc.setFillColor(...LIGHT_BG);
  doc.rect(ml, y - 1, contentWidth, 8, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...MUTED);
  for (const col of columns) {
    doc.text(col.label, col.x, y + 4, col.align ? { align: col.align } : undefined);
  }
  return y + 12;
}

// ─── Order Report PDF ───────────────────────────────────────────────

export async function exportOrderReport(
  orders: ReportOrder[],
  filters: ReportFilters,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as unknown as JsPDFDoc;
  const pageWidth = 210;
  const ml = 20;
  const mr = 20;
  const cw = pageWidth - ml - mr;

  let y = drawReportHeader(doc, "Order Rapport", filters);

  // Summary KPIs
  const totalOrders = orders.length;
  const delivered = orders.filter((o) => o.status === "DELIVERED").length;
  const onTimePct = totalOrders > 0 ? Math.round((delivered / totalOrders) * 100) : 0;
  const totalWeight = orders.reduce((s, o) => s + (o.weight_kg ?? 0), 0);
  const avgWeight = totalOrders > 0 ? Math.round(totalWeight / totalOrders) : 0;

  doc.setFillColor(...LIGHT_BG);
  doc.rect(ml, y, cw, 18, "F");
  y += 6;

  const kpis = [
    { label: "Totaal orders", value: String(totalOrders) },
    { label: "Gem. gewicht (kg)", value: String(avgWeight) },
    { label: "Afgeleverd %", value: `${onTimePct}%` },
    { label: "Totaal gewicht (kg)", value: String(Math.round(totalWeight)) },
  ];

  const kpiSpacing = cw / kpis.length;
  kpis.forEach((kpi, i) => {
    const x = ml + kpiSpacing * i + kpiSpacing / 2;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text(kpi.value, x, y + 2, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, x, y + 7, { align: "center" });
  });

  y += 20;

  // Orders table
  const cols = [
    { label: "ORDER", x: ml },
    { label: "DATUM", x: ml + 25 },
    { label: "KLANT", x: ml + 55 },
    { label: "STATUS", x: ml + 110 },
    { label: "GEWICHT", x: pageWidth - mr, align: "right" },
  ];

  y = drawTableHeader(doc, cols, y, cw, ml);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PRIMARY);

  for (const order of orders) {
    if (y > 268) {
      doc.addPage();
      y = 20;
      y = drawTableHeader(doc, cols, y, cw, ml);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PRIMARY);
    }

    doc.setFontSize(8);
    doc.text(String(order.order_number ?? order.id).slice(0, 12), ml, y);
    doc.text(formatDateNL(order.created_at), ml + 25, y);
    doc.text((order.client_name ?? "—").slice(0, 25), ml + 55, y);
    doc.text(dutchStatus(order.status), ml + 110, y);
    doc.text(
      order.weight_kg != null ? `${order.weight_kg} kg` : "—",
      pageWidth - mr,
      y,
      { align: "right" },
    );

    y += 6;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.15);
    doc.line(ml, y - 2, pageWidth - mr, y - 2);
  }

  drawFooters(doc);

  const blob = doc.output("blob");
  triggerDownload(blob, `order-rapport-${formatDateNL(new Date())}.pdf`);
}

// ─── Trip Report PDF ────────────────────────────────────────────────

export async function exportTripReport(
  trips: ReportTrip[],
  filters: ReportFilters,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }) as unknown as JsPDFDoc;
  const pageWidth = 297;
  const ml = 15;
  const mr = 15;
  const cw = pageWidth - ml - mr;

  let y = drawReportHeader(doc, "Ritten Rapport", filters);

  const totalCost = trips.reduce((s, t) => s + (t.cost ?? 0), 0);
  const totalRevenue = trips.reduce((s, t) => s + (t.revenue ?? 0), 0);
  const totalMargin = totalRevenue - totalCost;

  // Summary
  doc.setFillColor(...LIGHT_BG);
  doc.rect(ml, y, cw, 14, "F");
  y += 5;

  const kpis = [
    { label: "Totaal ritten", value: String(trips.length) },
    { label: "Omzet", value: formatCurrency(totalRevenue) },
    { label: "Kosten", value: formatCurrency(totalCost) },
    { label: "Marge", value: formatCurrency(totalMargin) },
  ];

  const kpiSpacing = cw / kpis.length;
  kpis.forEach((kpi, i) => {
    const x = ml + kpiSpacing * i + kpiSpacing / 2;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text(kpi.value, x, y + 1, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, x, y + 6, { align: "center" });
  });

  y += 16;

  const cols = [
    { label: "RIT", x: ml },
    { label: "DATUM", x: ml + 25 },
    { label: "CHAUFFEUR", x: ml + 55 },
    { label: "VOERTUIG", x: ml + 95 },
    { label: "ROUTE", x: ml + 130 },
    { label: "STOPS", x: ml + 180 },
    { label: "KM", x: ml + 195 },
    { label: "KOSTEN", x: ml + 220, align: "right" },
    { label: "OMZET", x: ml + 245, align: "right" },
    { label: "MARGE", x: pageWidth - mr, align: "right" },
  ];

  y = drawTableHeader(doc, cols, y, cw, ml);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PRIMARY);

  for (const trip of trips) {
    if (y > 185) {
      doc.addPage();
      y = 20;
      y = drawTableHeader(doc, cols, y, cw, ml);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PRIMARY);
    }

    doc.setFontSize(7);
    doc.text(String(trip.trip_number ?? trip.id).slice(0, 12), ml, y);
    doc.text(formatDateNL(trip.date), ml + 25, y);
    doc.text((trip.driver_name ?? "—").slice(0, 18), ml + 55, y);
    doc.text((trip.vehicle_name ?? "—").slice(0, 15), ml + 95, y);
    doc.text((trip.route ?? "—").slice(0, 22), ml + 130, y);
    doc.text(String(trip.stops ?? 0), ml + 180, y);
    doc.text(String(trip.distance_km ?? 0), ml + 195, y);
    doc.text(formatCurrency(trip.cost ?? 0), ml + 220, y, { align: "right" });
    doc.text(formatCurrency(trip.revenue ?? 0), ml + 245, y, { align: "right" });
    doc.text(formatCurrency((trip.revenue ?? 0) - (trip.cost ?? 0)), pageWidth - mr, y, { align: "right" });

    y += 5.5;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.15);
    doc.line(ml, y - 2, pageWidth - mr, y - 2);
  }

  drawFooters(doc);

  const blob = doc.output("blob");
  triggerDownload(blob, `ritten-rapport-${formatDateNL(new Date())}.pdf`);
}

// ─── Financial Report PDF ───────────────────────────────────────────

export async function exportFinancialReport(
  invoices: ReportInvoice[],
  filters: ReportFilters,
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }) as unknown as JsPDFDoc;
  const pageWidth = 210;
  const ml = 20;
  const mr = 20;
  const cw = pageWidth - ml - mr;

  let y = drawReportHeader(doc, "Financieel Rapport", filters);

  const totalRevenue = invoices.reduce((s, inv) => s + inv.total, 0);
  const totalBTW = invoices.reduce((s, inv) => s + inv.btw_amount, 0);
  const totalSubtotal = invoices.reduce((s, inv) => s + inv.subtotal, 0);
  const paidCount = invoices.filter((inv) => inv.status === "paid" || inv.status === "betaald").length;

  doc.setFillColor(...LIGHT_BG);
  doc.rect(ml, y, cw, 18, "F");
  y += 6;

  const kpis = [
    { label: "Facturen", value: String(invoices.length) },
    { label: "Subtotaal", value: formatCurrency(totalSubtotal) },
    { label: "BTW", value: formatCurrency(totalBTW) },
    { label: "Totaal omzet", value: formatCurrency(totalRevenue) },
  ];

  const kpiSpacing = cw / kpis.length;
  kpis.forEach((kpi, i) => {
    const x = ml + kpiSpacing * i + kpiSpacing / 2;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...PRIMARY);
    doc.text(kpi.value, x, y + 2, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(kpi.label, x, y + 7, { align: "center" });
  });

  y += 20;

  // Betaald indicator
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`Betaald: ${paidCount} van ${invoices.length}`, ml, y);
  y += 8;

  // Table
  const cols = [
    { label: "FACTUUR", x: ml },
    { label: "KLANT", x: ml + 30 },
    { label: "DATUM", x: ml + 80 },
    { label: "SUBTOTAAL", x: ml + 115, align: "right" },
    { label: "BTW", x: ml + 140, align: "right" },
    { label: "TOTAAL", x: pageWidth - mr, align: "right" },
  ];

  y = drawTableHeader(doc, cols, y, cw, ml);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PRIMARY);

  for (const inv of invoices) {
    if (y > 268) {
      doc.addPage();
      y = 20;
      y = drawTableHeader(doc, cols, y, cw, ml);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PRIMARY);
    }

    doc.setFontSize(8);
    doc.text(inv.invoice_number, ml, y);
    doc.text(inv.client_name.slice(0, 22), ml + 30, y);
    doc.text(formatDateNL(inv.invoice_date), ml + 80, y);
    doc.text(formatCurrency(inv.subtotal), ml + 115, y, { align: "right" });
    doc.text(formatCurrency(inv.btw_amount), ml + 140, y, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency(inv.total), pageWidth - mr, y, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += 6;
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.15);
    doc.line(ml, y - 2, pageWidth - mr, y - 2);
  }

  // Grand total line
  y += 4;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(ml + 100, y - 2, pageWidth - mr, y - 2);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...ACCENT);
  doc.text("Totaal", ml + 100, y + 2);
  doc.text(formatCurrency(totalRevenue), pageWidth - mr, y + 2, {
    align: "right",
  });

  drawFooters(doc);

  const blob = doc.output("blob");
  triggerDownload(blob, `financieel-rapport-${formatDateNL(new Date())}.pdf`);
}

// ─── Download helper ────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

