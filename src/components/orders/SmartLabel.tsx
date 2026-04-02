import React from "react";
import { QRCodeSVG } from "qrcode.react";
import { Truck, AlertTriangle, Snowflake, ArrowUp, Package, Shield, Globe, Barcode } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateSscc18 } from "@/utils/ssccUtils";

interface SmartLabelProps {
  order: any;
  pieceNumber?: number;
  totalPieces?: number;
}

const SmartLabel: React.FC<SmartLabelProps> = ({ order, pieceNumber = 1, totalPieces = 1 }) => {
  const requirements = (order.requirements || []) as string[];
  const isADR = requirements.includes("ADR");
  const isKoel = requirements.includes("KOELING");
  const isBreekbaar = requirements.includes("BREEKBAAR");

  // Generate SSCC-18 for this piece
  // Using order_number + pieceNumber as a unique serial
  const sscc = generateSscc18(order.order_number * 1000 + pieceNumber);
  const ssccFormatted = `(00) ${sscc.slice(0, 1)} ${sscc.slice(1, 8)} ${sscc.slice(8, 17)} ${sscc.slice(17)}`;

  // Deep link for the Chauffeur App
  const shareUrl = `${window.location.origin}/chauffeur?orderId=${order.id}`;

  return (
    <div className="print:block hidden">
      <div className="w-[10cm] h-[15cm] bg-white border border-slate-200 p-4 flex flex-col font-sans text-slate-950 mx-auto overflow-hidden">
        {/* Header - Brand */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="bg-[#dc2626] p-1.5 rounded text-white shadow-sm">
              <Truck className="h-4 w-4" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-xs font-bold leading-none tracking-tight">Royalty Cargo</p>
              <p className="text-xs font-bold text-[#dc2626] tracking-[0.1em] uppercase">TMS Platform</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-mono">ID: {order.id.slice(0, 8).toUpperCase()}</p>
            <p className="text-xs font-bold">Piece {pieceNumber}/{order.quantity || totalPieces}</p>
          </div>
        </div>

        {/* QR & Basic Info */}
        <div className="flex gap-4 mb-4">
          <div className="shrink-0 p-1 border border-slate-100 rounded">
            <QRCodeSVG value={shareUrl} size={100} level="H" />
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">Order Number</p>
            <p className="text-2xl font-black leading-tight">#{order.order_number}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Package className="h-3 w-3 text-slate-400" />
              <p className="text-xs font-semibold">{order.quantity} {order.unit || "Colli"}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="h-3 w-3 text-slate-400" />
              <p className="text-xs font-semibold">{order.weight_kg} kg</p>
            </div>
          </div>
        </div>

        {/* Addresses */}
        <div className="space-y-4 flex-1">
          {/* FROM */}
          <div className="relative pl-6 before:absolute before:left-2 before:top-1.5 before:w-1.5 before:h-1.5 before:bg-slate-300 before:rounded-full after:absolute after:left-[11px] after:top-[1.2rem] after:bottom-[-1.2rem] after:w-0.5 after:bg-slate-100">
            <p className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-0.5">Origin (FROM)</p>
            <p className="text-xs font-bold leading-snug line-clamp-2 uppercase">
              {order.pickup_address || "TBA"}
            </p>
          </div>

          {/* TO */}
          <div className="relative pl-6 before:absolute before:left-2 before:top-1.5 before:w-1.5 before:h-1.5 before:bg-[#dc2626] before:rounded-full">
            <p className="text-xs text-[#dc2626] uppercase font-bold tracking-widest mb-0.5">Destination (TO)</p>
            <p className="text-sm font-black leading-snug uppercase">
              {order.delivery_address || "TBA"}
            </p>
            <div className="mt-1 flex items-center gap-1">
              <Globe className="h-3 w-3 text-slate-300" />
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">International Cargo</p>
            </div>
          </div>
        </div>

        {/* Requirements & Handling Symbols */}
        <div className="mt-4 pt-3 border-t-2 border-slate-900 border-dashed grid grid-cols-4 gap-2">
          {isADR && (
            <div className="flex flex-col items-center gap-1 border border-slate-200 rounded p-1.5">
              <AlertTriangle className="h-6 w-6 text-amber-500 fill-amber-50" />
              <p className="text-xs font-black uppercase tracking-widest">ADR</p>
            </div>
          )}
          {isKoel && (
            <div className="flex flex-col items-center gap-1 border border-slate-200 rounded p-1.5">
              <Snowflake className="h-6 w-6 text-blue-500" />
              <p className="text-xs font-black uppercase tracking-widest">Koel</p>
            </div>
          )}
          <div className="flex flex-col items-center gap-1 border border-slate-200 rounded p-1.5">
            <ArrowUp className="h-6 w-6 text-slate-900" />
            <p className="text-xs font-black uppercase tracking-widest text-center leading-none">This Side UP</p>
          </div>
          {isBreekbaar && (
            <div className="flex flex-col items-center gap-1 border border-slate-200 rounded p-1.5">
              <div className="h-6 w-6 flex items-center justify-center font-bold text-lg text-slate-900 leading-none">Y</div>
              <p className="text-xs font-black uppercase tracking-widest text-center leading-none">Fragile</p>
            </div>
          )}
        </div>

        {/* SSCC-18 Barcode Placeholder */}
        <div className="mt-auto pt-4 flex flex-col items-center">
          <div className="w-full h-12 bg-slate-100 border border-slate-200 rounded flex items-center justify-center relative overflow-hidden group">
            <div className="flex gap-[1px] opacity-30">
              {Array.from({ length: 60 }).map((_, i) => (
                <div key={i} className="bg-slate-900" style={{ width: Math.random() > 0.5 ? '2px' : '4px', height: '40px' }} />
              ))}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-white/40 backdrop-blur-[1px]">
              <Barcode className="h-4 w-4 text-slate-400 mr-2" />
              <span className="text-xs font-mono font-bold tracking-[0.2em]">{ssccFormatted}</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1 uppercase font-bold tracking-widest leading-none">Serial Shipping Container Code (SSCC)</p>
        </div>

        {/* Footer */}
        <div className="mt-3 text-center">
          <p className="text-xs text-slate-400 font-medium">Auto-generated by OrderFlow TMS • {new Date().toLocaleDateString("nl-NL")}</p>
        </div>
      </div>
    </div>
  );
};

export default SmartLabel;
