import React, { useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Truck, AlertTriangle, Snowflake } from "lucide-react";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

interface CMRDocumentProps {
  order: any;
  tenantName?: string;
  tenantAddress?: string;
}

/**
 * CMR Vrachtbrief / Waybill Document
 * Follows the standard CMR convention layout with 24 numbered fields.
 * Optimized for A4 print.
 */
const CMRDocument: React.FC<CMRDocumentProps> = ({
  order,
  tenantName = DEFAULT_COMPANY.name,
  tenantAddress = `${DEFAULT_COMPANY.address}, ${DEFAULT_COMPANY.country}`,
}) => {
  const requirements = (order.requirements || []) as string[];
  const isADR = requirements.some(r => r.toUpperCase().includes("ADR"));
  const isKoel = requirements.some(r => r.toUpperCase().includes("KOELING"));

  const cmrNumber = order.cmr_number || `CMR-${new Date().getFullYear()}-${String(order.order_number).padStart(4, "0")}`;
  const shareUrl = `${window.location.origin}/orders/${order.id}`;
  const today = new Date().toLocaleDateString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric"
  });

  const totalWeight = useMemo(() => {
    if (!order.weight_kg) return 0;
    if (order.is_weight_per_unit && order.quantity) return order.weight_kg * order.quantity;
    return order.weight_kg;
  }, [order]);

  const instructions: string[] = [];
  if (isADR) instructions.push("ADR: Gevaarlijke stoffen — ADR-gecertificeerd vervoer vereist");
  if (isKoel) instructions.push("KOELING: Temperatuur gecontroleerd transport vereist (2-8°C)");
  if (order.internal_note && !order.internal_note.startsWith("[")) {
    instructions.push(order.internal_note);
  }

  return (
    <div className="print:block hidden">
      <div className="w-[210mm] min-h-[297mm] bg-white p-6 font-sans text-xs text-slate-900 mx-auto" style={{ pageBreakAfter: "always" }}>
        
        {/* Document Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3 mb-0">
          <div className="flex items-center gap-3">
            <div className="bg-[#dc2626] p-2 rounded-lg text-white">
              <Truck className="h-5 w-5" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight leading-none">CMR VRACHTBRIEF</h1>
              <p className="text-xs text-slate-500 font-semibold tracking-widest uppercase mt-0.5">
                International Consignment Note
              </p>
            </div>
          </div>
          <div className="text-right flex items-start gap-3">
            <div>
              <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">CMR Nr.</p>
              <p className="text-sm font-black text-[#dc2626] tracking-tight">{cmrNumber}</p>
              <p className="text-xs text-slate-400 mt-0.5">Datum: {today}</p>
            </div>
            <div className="border border-slate-200 rounded p-1">
              <QRCodeSVG value={shareUrl} size={56} level="M" />
            </div>
          </div>
        </div>

        {/* CMR Grid */}
        <div className="border border-slate-300">
          
          {/* Row 1: Afzender + Vervoerder */}
          <div className="grid grid-cols-2 border-b border-slate-300">
            {/* Veld 1: Afzender */}
            <div className="p-3 border-r border-slate-300">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">1</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Afzender / Sender</span>
              </div>
              <p className="font-bold text-sm">{order.client_name || "—"}</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{order.pickup_address || "—"}</p>
            </div>

            {/* Veld 16: Vervoerder */}
            <div className="p-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">16</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vervoerder / Carrier</span>
              </div>
              <p className="font-bold text-sm">{tenantName}</p>
              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{tenantAddress}</p>
            </div>
          </div>

          {/* Row 2: Geadresseerde + Opvolgende vervoerders */}
          <div className="grid grid-cols-2 border-b border-slate-300">
            {/* Veld 2: Geadresseerde */}
            <div className="p-3 border-r border-slate-300">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">2</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Geadresseerde / Consignee</span>
              </div>
              <p className="font-bold text-sm">{order.delivery_address || "—"}</p>
            </div>

            {/* Veld 17: Opvolgende vervoerders */}
            <div className="p-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">17</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Opvolgende vervoerders</span>
              </div>
              <p className="text-xs text-slate-400 italic">N.v.t. (direct vervoer)</p>
            </div>
          </div>

          {/* Row 3: Afleverplaats + Voorbehouden */}
          <div className="grid grid-cols-2 border-b border-slate-300">
            {/* Veld 3: Plaats van aflevering */}
            <div className="p-3 border-r border-slate-300">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">3</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Plaats van aflevering / Place of delivery</span>
              </div>
              <p className="font-bold text-sm">{order.delivery_address || "—"}</p>
              {order.time_window_start && order.time_window_end && (
                <p className="text-xs text-slate-500 mt-1">
                  Tijdvenster: {order.time_window_start} – {order.time_window_end}
                </p>
              )}
            </div>

            {/* Veld 18: Voorbehouden */}
            <div className="p-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">18</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Voorbehouden / Reservations</span>
              </div>
              <p className="text-xs text-slate-400 italic">Geen voorbehouden</p>
            </div>
          </div>

          {/* Row 4: Datum/Plaats opneming */}
          <div className="grid grid-cols-2 border-b border-slate-300">
            <div className="p-3 border-r border-slate-300">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">4</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Datum en plaats van inontvangstneming</span>
              </div>
              <p className="text-xs">
                <span className="font-semibold">{today}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span>{order.pickup_address || "—"}</span>
              </p>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">19</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bijzondere overeenkomsten</span>
              </div>
              <p className="text-xs text-slate-400 italic">Conform tariefovereenkomst klant</p>
            </div>
          </div>

          {/* Row 5: Documenten */}
          <div className="border-b border-slate-300 p-3">
            <div className="flex items-center gap-1 mb-1.5">
              <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">5</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Bijgevoegde documenten / Documents attached</span>
            </div>
            <p className="text-xs">
              {[
                "Pakbon",
                isADR ? "ADR-transportdocument" : null,
                order.invoice_ref ? `Factuurverwijzing: ${order.invoice_ref}` : null,
              ].filter(Boolean).join(" • ") || "Pakbon"}
            </p>
          </div>

          {/* Lading Table Header */}
          <div className="bg-slate-50 border-b border-slate-300">
            <div className="grid grid-cols-12 gap-0 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div className="col-span-1 p-2 border-r border-slate-200 text-center">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">6</span>
                <br />Merken
              </div>
              <div className="col-span-1 p-2 border-r border-slate-200 text-center">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">7</span>
                <br />Colli
              </div>
              <div className="col-span-3 p-2 border-r border-slate-200">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">8</span>
                <span className="ml-1">Aard verpakking</span>
              </div>
              <div className="col-span-3 p-2 border-r border-slate-200">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">9</span>
                <span className="ml-1">Omschrijving</span>
              </div>
              <div className="col-span-1 p-2 border-r border-slate-200 text-center">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">10</span>
                <br />Stat. Nr.
              </div>
              <div className="col-span-2 p-2 border-r border-slate-200 text-center">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">11</span>
                <br />Bruto (kg)
              </div>
              <div className="col-span-1 p-2 text-center">
                <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded bg-slate-200 text-xs font-black">12</span>
                <br />Vol. (m³)
              </div>
            </div>
          </div>

          {/* Lading Row */}
          <div className="border-b border-slate-300">
            <div className="grid grid-cols-12 gap-0 text-xs">
              <div className="col-span-1 p-2.5 border-r border-slate-200 text-center font-mono text-xs">
                {String(order.order_number).padStart(4, "0")}
              </div>
              <div className="col-span-1 p-2.5 border-r border-slate-200 text-center font-bold">
                {order.quantity || 1}
              </div>
              <div className="col-span-3 p-2.5 border-r border-slate-200">
                {order.unit || "Europallets"}
              </div>
              <div className="col-span-3 p-2.5 border-r border-slate-200">
                <span className="font-medium">Transport {order.client_name || "—"}</span>
                {requirements.length > 0 && (
                  <span className="flex items-center gap-1 mt-1">
                    {isADR && <AlertTriangle className="h-3 w-3 text-amber-500 inline" />}
                    {isKoel && <Snowflake className="h-3 w-3 text-blue-500 inline" />}
                    <span className="text-xs text-slate-500">{requirements.join(", ")}</span>
                  </span>
                )}
              </div>
              <div className="col-span-1 p-2.5 border-r border-slate-200 text-center text-xs text-slate-400">
                —
              </div>
              <div className="col-span-2 p-2.5 border-r border-slate-200 text-center font-bold">
                {totalWeight.toLocaleString()} kg
              </div>
              <div className="col-span-1 p-2.5 text-center text-xs text-slate-400">
                {order.dimensions || "—"}
              </div>
            </div>
          </div>

          {/* Empty rows for additional items */}
          {[1, 2].map(i => (
            <div key={i} className="border-b border-slate-200">
              <div className="grid grid-cols-12 gap-0 h-6">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div key={j} className={`${j < 6 ? "border-r border-slate-100" : ""} ${
                    j === 0 ? "col-span-1" : j === 1 ? "col-span-1" : j === 2 ? "col-span-3" : j === 3 ? "col-span-3" : j === 4 ? "col-span-1" : j === 5 ? "col-span-2" : "col-span-1"
                  }`} />
                ))}
              </div>
            </div>
          ))}

          {/* Row: Instructions */}
          <div className="border-b border-slate-300 p-3">
            <div className="flex items-center gap-1 mb-1.5">
              <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">13</span>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Instructies van de afzender / Sender's instructions</span>
            </div>
            {instructions.length > 0 ? (
              <ul className="space-y-0.5">
                {instructions.map((instr, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="inline-block h-1 w-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                    {instr}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 italic">Geen bijzondere instructies</p>
            )}
          </div>

          {/* Signature Blocks */}
          <div className="grid grid-cols-3">
            {/* Veld 22: Afzender */}
            <div className="p-3 border-r border-slate-300">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">22</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Afzender</span>
              </div>
              <div className="h-16 border border-dashed border-slate-200 rounded-lg flex items-end justify-center pb-1">
                <p className="text-xs text-slate-300">Handtekening afzender</p>
              </div>
              <p className="text-xs text-slate-400 mt-1 text-center">{today}</p>
            </div>

            {/* Veld 23: Vervoerder */}
            <div className="p-3 border-r border-slate-300">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">23</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vervoerder</span>
              </div>
              <div className="h-16 border border-dashed border-slate-200 rounded-lg flex items-end justify-center pb-1">
                <p className="text-xs text-slate-300">Stempel + handtekening</p>
              </div>
              <p className="text-xs text-slate-400 mt-1 text-center">{tenantName}</p>
            </div>

            {/* Veld 24: Geadresseerde */}
            <div className="p-3">
              <div className="flex items-center gap-1 mb-1.5">
                <span className="inline-flex items-center justify-center h-4 w-4 rounded bg-slate-100 text-xs font-black text-slate-600">24</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Geadresseerde</span>
              </div>
              <div className="h-16 border border-dashed border-slate-200 rounded-lg flex items-center justify-center overflow-hidden">
                {order.pod_signature_url ? (
                  <img src={order.pod_signature_url} alt="PoD" className="max-h-full max-w-full object-contain" />
                ) : (
                  <p className="text-xs text-slate-300">Handtekening ontvanger</p>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 text-center">
                {order.pod_signed_by || "Naam ontvanger"}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <p>Gegenereerd door OrderFlow TMS • {tenantName}</p>
          <p>Dit document is een digitale CMR vrachtbrief conform het CMR-verdrag (Genève, 1956)</p>
        </div>
      </div>
    </div>
  );
};

export default CMRDocument;
