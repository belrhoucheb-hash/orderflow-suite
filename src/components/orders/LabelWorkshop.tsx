import React, { useState } from "react";
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, 
  DialogFooter, DialogTrigger 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Printer, ScrollText, Copy, Check, Info, Package, 
  ArrowRight, Download, Barcode 
} from "lucide-react";
import { toast } from "sonner";
import { generateZplLabel } from "@/utils/zplGenerator";
import { generateSscc18 } from "@/utils/ssccUtils";
import SmartLabel from "./SmartLabel";

interface LabelWorkshopProps {
  order: any;
  /** Override de trigger-knop styling. Bv. om als DropdownMenuItem te renderen. */
  triggerClassName?: string;
  /** Vervang de trigger-inhoud (bv. icoon + tekst-elementen) met custom JSX. */
  triggerChildren?: React.ReactNode;
}

const LabelWorkshop: React.FC<LabelWorkshopProps> = ({ order, triggerClassName, triggerChildren }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [quantity, setQuantity] = useState(order.quantity || 1);
  const [startSequence, setStartSequence] = useState(1);
  const [copiedZpl, setCopiedZpl] = useState(false);

  // Generate ZPL for the first piece as a preview
  const handleCopyZpl = () => {
    const sscc = generateSscc18(order.order_number * 1000 + startSequence);
    const zpl = generateZplLabel({
      orderNumber: order.order_number,
      pieceNumber: startSequence,
      totalPieces: quantity,
      pickup: order.pickup_address,
      delivery: order.delivery_address,
      weight: Math.round(order.weight_kg / quantity),
      quantity: 1, // Individual label
      unit: order.unit || "Colli",
      sscc: sscc,
      qrUrl: `${window.location.origin}/chauffeur?orderId=${order.id}`,
      requirements: order.requirements
    });

    navigator.clipboard.writeText(zpl);
    setCopiedZpl(true);
    toast.success("ZPL Code gekopieerd!", {
      description: "Plak dit in de Zebra printer software of een ZPL viewer."
    });
    setTimeout(() => setCopiedZpl(false), 2000);
  };

  const handlePrintPdf = () => {
    toast.info("Print preview wordt voorbereid...", {
      description: `Gegeneerd voor ${quantity} labels.`
    });
    setTimeout(() => window.print(), 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName ?? "btn-luxe"}>
          {triggerChildren ?? (
            <>
              <Barcode className="h-4 w-4" />
              Label workshop
            </>
          )}
        </button>
      </DialogTrigger>
      
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <Barcode className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl font-display font-bold">Label Workshop</DialogTitle>
          <DialogDescription>
            Genereer verzendlabels voor order <strong>#{order.order_number}</strong>. 
            Configureer het aantal colli en kies je uitvoerformaat.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
          {/* Settings */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qty" className="text-xs font-bold uppercase tracking-wider text-slate-500">Aantal Labels (Colli)</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="qty" 
                  type="number" 
                  value={quantity} 
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="font-bold text-lg h-12"
                />
                <Badge variant="secondary" className="h-12 px-3 text-xs">
                  Totaal: {order.quantity} {order.unit || "Colli"}
                </Badge>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seq" className="text-xs font-bold uppercase tracking-wider text-slate-500">Start Volgnummer</Label>
              <Input 
                id="seq" 
                type="number" 
                value={startSequence} 
                onChange={(e) => setStartSequence(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="rounded-xl border bg-slate-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Info className="h-3.5 w-3.5 text-primary" />
                <span>SSCC-18 Configuratie</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Elk label krijgt een uniek Serial Shipping Container Code.
                Het systeem berekent automatisch de check-digit.
              </p>
              <div className="font-mono text-xs bg-white border rounded p-2 text-center select-all">
                (00) 0 8712345 {String(order.order_number * 1000 + startSequence).padStart(9, '0')} X
              </div>
            </div>
          </div>

          {/* Preview / Formats */}
          <div className="flex flex-col gap-3">
            <Label className="text-xs font-bold uppercase tracking-wider text-slate-500">Selecteer Formaat</Label>
            
            {/* PDF / Browser Option */}
            <button 
              onClick={handlePrintPdf}
              className="flex items-start gap-4 p-4 rounded-xl border-2 border-slate-100 hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
            >
              <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <Printer className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900">PDF / Browser Print</h4>
                <p className="text-xs text-slate-500 mt-0.5">Perfect voor standaard kantoorprinters (A4 of 10x15).</p>
              </div>
            </button>

            {/* ZPL / Zebra Option */}
            <button 
              onClick={handleCopyZpl}
              className="flex items-start gap-4 p-4 rounded-xl border-2 border-slate-100 hover:border-blue-500/50 hover:bg-blue-50 transition-all text-left group"
            >
              <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                <ScrollText className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900">ZPL Code (Zebra)</h4>
                  {copiedZpl && <Badge className="bg-emerald-500 text-xs h-4">Copied</Badge>}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Raw code voor industriële labelprinters.</p>
              </div>
            </button>

            <div className="mt-auto border border-dashed rounded-xl p-4 flex items-center gap-3 bg-primary/5">
              <Package className="h-8 w-8 text-primary/40" />
              <div className="text-xs">
                <p className="font-bold text-slate-700">Totaal {quantity} labels</p>
                <p className="text-slate-500">Klaar voor verwerking</p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t pt-4">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Annuleren</Button>
          <Button onClick={handlePrintPdf} className="gap-2 px-6">
            <Printer className="h-4 w-4" />
            Start Afdruk
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Hidden printable labels area */}
      <div className="print:block hidden bg-white">
        {Array.from({ length: quantity }).map((_, i) => (
          <SmartLabel 
            key={i} 
            order={order} 
            pieceNumber={startSequence + i} 
            totalPieces={quantity} 
          />
        ))}
      </div>
    </Dialog>
  );
};

export default LabelWorkshop;
