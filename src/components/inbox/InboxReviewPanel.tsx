import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  AlertTriangle,
  Check,
  HelpCircle,
  MapPin,
  Package,
  ClipboardCheck,
  Paperclip,
  Sparkles,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { OrderDraft, FormState } from "./types";
import { requirementOptions } from "./types";
import {
  getFilledCount,
  getTotalFields,
  getRequiredFilledCount,
  getFormErrors,
  isAddressIncomplete,
  computeFieldConfidence,
} from "./utils";

interface Props {
  selected: OrderDraft;
  form: FormState;
  isCreatePending: boolean;
  addressSuggestions: any;
  onUpdateField: (field: keyof FormState, value: any) => void;
  onToggleRequirement: (req: string) => void;
  onAutoSave: () => void;
  onCreateOrder: () => void;
  onDelete: () => void;
}

function useFieldHoverLinkage(field: string) {
  return {
    onMouseEnter: () => {
      document
        .querySelectorAll(`.inbox-hl[data-field="${field}"]`)
        .forEach((el) => el.classList.add("inbox-field-linked"));
    },
    onMouseLeave: () => {
      document
        .querySelectorAll(`.inbox-hl[data-field="${field}"]`)
        .forEach((el) => el.classList.remove("inbox-field-linked"));
    },
    "data-inbox-field": field,
  } as const;
}

function ChapterHead({
  badge,
  title,
  sub,
}: {
  badge: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span
        className="shrink-0 grid place-items-center w-6 h-6 rounded-full text-[10px] font-semibold"
        style={{
          fontFamily: "'Space Grotesk', sans-serif",
          color: "hsl(var(--gold-deep))",
          background: "hsl(var(--gold-soft) / 0.7)",
          border: "1px solid hsl(var(--gold) / 0.3)",
        }}
      >
        {badge}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {title}
        </p>
        {sub && <p className="text-[12px] text-foreground mt-[2px]">{sub}</p>}
      </div>
    </div>
  );
}

export function InboxReviewPanel({
  selected,
  form,
  isCreatePending,
  onUpdateField,
  onToggleRequirement,
  onAutoSave,
  onCreateOrder,
  onDelete,
}: Props) {
  const formErrors = getFormErrors(form);
  const filledCount = getFilledCount(form);
  const totalFields = getTotalFields();
  const conf = computeFieldConfidence(form);
  const requiredFilled = getRequiredFilledCount(form);
  const totalRequired = 4;

  const [dept, setDept] = useState<"export" | "operations">("operations");
  const [cargoEdit, setCargoEdit] = useState(false);
  const [showConfDetail, setShowConfDetail] = useState(false);

  useEffect(() => {
    setCargoEdit(false);
  }, [selected.id]);

  const receivedAgo = selected.received_at
    ? Math.floor((Date.now() - new Date(selected.received_at).getTime()) / 3600000)
    : 0;

  const pickupLinkage = useFieldHoverLinkage("pickup");
  const deliveryLinkage = useFieldHoverLinkage("delivery");
  const qtyLinkage = useFieldHoverLinkage("qty");
  const weightLinkage = useFieldHoverLinkage("weight");
  const dimsLinkage = useFieldHoverLinkage("dims");
  const pickupTimeLinkage = useFieldHoverLinkage("pickup-time");
  const deliveryTimeLinkage = useFieldHoverLinkage("delivery-time");
  const reqLinkage = useFieldHoverLinkage("req");

  const confColor = conf >= 80 ? "hsl(var(--gold-deep))" : conf >= 60 ? "hsl(32 70% 45%)" : "hsl(0 60% 50%)";

  const possibleDuplicate = (selected as any).possible_duplicate as boolean | undefined;
  const anomalies = selected.anomalies || [];
  const weightAnomaly = anomalies.find((a) => a.field === "weight_kg");

  const totalKg = form.weight
    ? form.perUnit
      ? Number(form.weight) * form.quantity
      : Number(form.weight)
    : 0;

  return (
    <div
      className="relative flex flex-col h-full"
      style={{ minWidth: 0, overflow: "hidden", background: "hsl(var(--background))" }}
    >
      <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
        <div className="px-5 pt-5 pb-40">
          {/* Header block */}
          <div className="flex items-start justify-between mb-3 gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-[10px] font-semibold tabular-nums px-[8px] py-[2px] rounded-full"
                  style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: "hsl(var(--gold-deep))",
                    background: "hsl(var(--gold-soft))",
                  }}
                >
                  ORD-{selected.order_number}
                </span>
                <span
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  Order-review
                </span>
              </div>
              <h2
                className="text-[22px] font-semibold leading-tight truncate"
                style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}
              >
                {selected.client_name || "Onbekende klant"}
              </h2>
              <button
                onClick={() => setDept((d) => (d === "export" ? "operations" : "export"))}
                className={cn(
                  "inline-flex items-center gap-1.5 mt-2 px-2.5 py-[3px] rounded-full text-[11px] font-medium border transition-colors",
                )}
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  background: dept === "export" ? "hsl(var(--gold-soft) / 0.6)" : "hsl(var(--muted) / 0.5)",
                  borderColor: dept === "export" ? "hsl(var(--gold) / 0.4)" : "hsl(var(--border))",
                  color: dept === "export" ? "hsl(var(--gold-deep))" : "hsl(var(--muted-foreground))",
                }}
                title="Klik om afdeling te wisselen"
              >
                <span
                  className="w-[5px] h-[5px] rounded-full"
                  style={{
                    background: dept === "export" ? "hsl(var(--gold))" : "hsl(var(--muted-foreground))",
                  }}
                />
                {dept === "export" ? "Export" : "Operations"}
              </button>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <span
                className="text-[10px] tabular-nums text-muted-foreground mb-2 px-2 py-[2px] rounded-full"
                style={{ background: "hsl(var(--muted) / 0.5)" }}
              >
                {receivedAgo > 0 ? `${receivedAgo}u geleden` : "zojuist"}
              </span>
              {/* Confidence ring */}
              <div
                className="relative cursor-help"
                style={{ width: 68, height: 68 }}
                onMouseEnter={() => setShowConfDetail(true)}
                onMouseLeave={() => setShowConfDetail(false)}
              >
                <svg className="w-[68px] h-[68px] -rotate-90" viewBox="0 0 68 68">
                  <circle cx="34" cy="34" r="28" fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
                  <circle
                    cx="34"
                    cy="34"
                    r="28"
                    fill="none"
                    stroke={confColor}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 28}
                    strokeDashoffset={2 * Math.PI * 28 * (1 - conf / 100)}
                    className="transition-all duration-500"
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold tabular-nums"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: confColor }}
                >
                  {conf}%
                </span>
                {showConfDetail && (
                  <div
                    className="absolute top-full right-0 mt-1 w-52 rounded-lg py-2 px-2 z-30 shadow-lg"
                    style={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--gold) / 0.25)",
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-1 px-1">
                      Zekerheid per veld
                    </p>
                    {[
                      { label: "Ophaaladres", key: "pickup_address" },
                      { label: "Afleveradres", key: "delivery_address" },
                      { label: "Aantal", key: "quantity" },
                      { label: "Gewicht", key: "weight_kg" },
                      { label: "Afmetingen", key: "dimensions" },
                    ].map((f) => {
                      const raw = (form.fieldConfidence || {})[f.key];
                      const v = raw == null ? null : raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
                      return (
                        <div key={f.key} className="flex justify-between text-[11px] py-[2px] px-1">
                          <span>{f.label}</span>
                          <span
                            className="tabular-nums font-semibold"
                            style={{
                              color:
                                v == null
                                  ? "hsl(var(--muted-foreground))"
                                  : v >= 80
                                    ? "hsl(var(--gold-deep))"
                                    : v >= 60
                                      ? "hsl(32 70% 45%)"
                                      : "hsl(0 60% 50%)",
                            }}
                          >
                            {v == null ? "—" : `${v}%`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <HelpCircle className="h-3 w-3" strokeWidth={1.75} />
                Waarom?
              </button>
            </div>
          </div>

          {/* Duplicate warning */}
          {possibleDuplicate && (
            <div
              className="callout--luxe mb-4"
              style={{
                background: "linear-gradient(135deg, hsl(var(--card)) 0%, hsl(32 85% 92% / 0.5) 100%)",
                borderColor: "hsl(32 70% 55% / 0.4)",
              }}
            >
              <AlertTriangle className="callout--luxe__icon h-4 w-4" style={{ color: "hsl(32 70% 45%)" }} />
              <div>
                <p className="callout--luxe__title">Mogelijke duplicaat</p>
                <p className="callout--luxe__body">Deze aanvraag lijkt op een recente order van dezelfde klant.</p>
              </div>
            </div>
          )}

          <div className="hairline my-4" />

          {/* I · AI-extractie */}
          <section className="mb-5">
            <ChapterHead
              badge="I"
              title="AI-extractie"
              sub={`${conf}% zekerheid, ${filledCount}/${totalFields} velden herkend`}
            />
            <div className="card--luxe p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                <span
                  className="text-[11px] font-medium"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: "hsl(var(--gold-deep))" }}
                >
                  Automatisch geëxtraheerd
                </span>
                <span className="ml-auto text-[11px] tabular-nums font-semibold" style={{ color: confColor }}>
                  {conf}%
                </span>
              </div>
              <div
                className="w-full h-[6px] rounded-full overflow-hidden"
                style={{ background: "hsl(var(--gold-soft) / 0.5)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${conf}%`,
                    background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--gold-deep)))",
                  }}
                />
              </div>
              <p className="text-[10.5px] text-muted-foreground mt-2">
                {selected.attachments?.length
                  ? `Uit e-mail plus ${selected.attachments.length} bijlage${selected.attachments.length > 1 ? "n" : ""}`
                  : "Uit e-mailtekst"}
              </p>
            </div>
          </section>

          {/* II · Route */}
          <section className="mb-5">
            <ChapterHead badge="II" title="Route" sub="Ophalen en afleveren" />
            <div className="card--luxe p-4">
              <div className="relative pl-6 space-y-4">
                <div
                  className="absolute top-2 bottom-2"
                  style={{
                    left: "9px",
                    borderLeft: "1px dashed hsl(var(--gold) / 0.4)",
                  }}
                />
                {/* Pickup */}
                <div className="relative" {...pickupLinkage}>
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: "-15px",
                      top: 5,
                      width: 10,
                      height: 10,
                      background: "hsl(var(--gold))",
                      border: "2px solid hsl(var(--card))",
                      boxShadow: "0 0 0 1px hsl(var(--gold) / 0.3)",
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 mb-[2px]">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Ophalen
                      </span>
                    </div>
                    <AddressAutocomplete
                      value={form.pickupAddress}
                      onChange={(v) => onUpdateField("pickupAddress", v)}
                      onBlur={onAutoSave}
                      placeholder="Ophaaladres..."
                      className={cn(
                        "h-auto border-0 shadow-none p-0 text-[13px] font-medium bg-transparent focus-visible:ring-1 focus-visible:ring-[hsl(var(--gold)/0.4)] focus-visible:bg-white focus-visible:rounded focus-visible:px-1",
                        !form.pickupAddress && "text-destructive italic font-normal",
                      )}
                    />
                    {form.pickupAddress && isAddressIncomplete(form.pickupAddress) && (
                      <p className="text-[10.5px] text-[hsl(32_70%_40%)] mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} /> Adres onvolledig, straat en nummer nodig
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2" {...pickupTimeLinkage}>
                      <input
                        type="date"
                        className="picker text-[11.5px] px-2 py-1 rounded-md"
                        style={{ minWidth: 0 }}
                      />
                      <input
                        type="time"
                        value={selected.pickup_time_from || ""}
                        readOnly
                        className="picker text-[11.5px] px-2 py-1 rounded-md"
                        style={{ width: 75 }}
                      />
                      <span className="text-[11px] text-muted-foreground">tot</span>
                      <input
                        type="time"
                        value={selected.pickup_time_to || ""}
                        readOnly
                        className="picker text-[11.5px] px-2 py-1 rounded-md"
                        style={{ width: 75 }}
                      />
                    </div>
                  </div>
                </div>

                {/* Delivery */}
                <div className="relative" {...deliveryLinkage}>
                  <div
                    className="absolute rounded-full"
                    style={{
                      left: "-15px",
                      top: 5,
                      width: 10,
                      height: 10,
                      background: "hsl(var(--gold-deep))",
                      border: "2px solid hsl(var(--card))",
                      boxShadow: "0 0 0 1px hsl(var(--gold-deep) / 0.3)",
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 mb-[2px]">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Afleveren
                      </span>
                    </div>
                    <AddressAutocomplete
                      value={form.deliveryAddress}
                      onChange={(v) => onUpdateField("deliveryAddress", v)}
                      onBlur={onAutoSave}
                      placeholder="Afleveradres..."
                      className={cn(
                        "h-auto border-0 shadow-none p-0 text-[13px] font-medium bg-transparent focus-visible:ring-1 focus-visible:ring-[hsl(var(--gold)/0.4)] focus-visible:bg-white focus-visible:rounded focus-visible:px-1",
                        !form.deliveryAddress && "text-destructive italic font-normal",
                      )}
                    />
                    {form.deliveryAddress && isAddressIncomplete(form.deliveryAddress) && (
                      <p className="text-[10.5px] text-[hsl(32_70%_40%)] mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} /> Adres onvolledig, straat en nummer nodig
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2" {...deliveryTimeLinkage}>
                      <input
                        type="date"
                        className="picker text-[11.5px] px-2 py-1 rounded-md"
                        style={{ minWidth: 0 }}
                      />
                      <input
                        type="time"
                        value={selected.delivery_time_from || ""}
                        readOnly
                        className="picker text-[11.5px] px-2 py-1 rounded-md"
                        style={{ width: 75 }}
                      />
                      <span className="text-[11px] text-muted-foreground">tot</span>
                      <input
                        type="time"
                        value={selected.delivery_time_to || ""}
                        readOnly
                        className="picker text-[11.5px] px-2 py-1 rounded-md"
                        style={{ width: 75 }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                className="mt-4 inline-flex items-center gap-1 text-[11.5px] font-medium hover:underline"
                style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  color: "hsl(var(--gold-deep))",
                }}
              >
                <Plus className="h-3 w-3" strokeWidth={1.75} />
                Tussenstop toevoegen
              </button>
            </div>
          </section>

          {/* III · Lading */}
          <section className="mb-5">
            <ChapterHead
              badge="III"
              title="Lading"
              sub={`${form.quantity || 0} ${form.unit || "stuks"}, ${totalKg > 0 ? `${totalKg.toLocaleString("nl-NL")} kg` : "gewicht onbekend"}`}
            />
            <div className="card--luxe p-0 overflow-hidden">
              {/* Read-only row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Package className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                  <div className="min-w-0" {...qtyLinkage}>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="text-[14px] font-semibold tabular-nums"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {form.quantity || 0}
                      </span>
                      <span className="text-[12.5px] text-muted-foreground">{form.unit || "Pallets"}</span>
                    </div>
                    {form.dimensions && (
                      <span className="text-[11px] text-muted-foreground tabular-nums" {...dimsLinkage}>
                        {form.dimensions} cm
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[12.5px] tabular-nums" {...weightLinkage}>
                    {totalKg > 0 ? `${totalKg.toLocaleString("nl-NL")} kg` : "— kg"}
                  </span>
                  <button
                    onClick={() => setCargoEdit((v) => !v)}
                    className="h-7 w-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    aria-label={cargoEdit ? "Sluit bewerken" : "Bewerk"}
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>

              {cargoEdit && (
                <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "hsl(var(--border) / 0.5)" }}>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Aantal</span>
                      <Input
                        type="number"
                        value={form.quantity}
                        onChange={(e) => onUpdateField("quantity", Number(e.target.value))}
                        onBlur={onAutoSave}
                        className="h-8 mt-1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Eenheid</span>
                      <Select
                        value={form.unit}
                        onValueChange={(v) => {
                          onUpdateField("unit", v);
                          setTimeout(onAutoSave, 0);
                        }}
                      >
                        <SelectTrigger className="h-8 mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pallets">Pallets</SelectItem>
                          <SelectItem value="Europallets">Europallets</SelectItem>
                          <SelectItem value="Colli">Colli</SelectItem>
                          <SelectItem value="Box">Box</SelectItem>
                          <SelectItem value="Container">Container</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  </div>

                  <label className="block">
                    <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                      Afmetingen, L × B × H (cm)
                    </span>
                    <Input
                      value={form.dimensions}
                      onChange={(e) => onUpdateField("dimensions", e.target.value)}
                      onBlur={onAutoSave}
                      placeholder="120x80x145"
                      className="h-8 mt-1"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
                      Gewicht {form.perUnit ? "(per eenheid)" : "(totaal)"}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={form.weight}
                        onChange={(e) => onUpdateField("weight", e.target.value)}
                        onBlur={onAutoSave}
                        placeholder="—"
                        className="h-8"
                      />
                      <span className="text-[12px] text-muted-foreground">kg</span>
                    </div>
                  </label>

                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.perUnit}
                      onChange={(e) => {
                        onUpdateField("perUnit", e.target.checked);
                        setTimeout(onAutoSave, 0);
                      }}
                    />
                    <span className="text-[12px]">Gewicht per eenheid</span>
                  </label>
                </div>
              )}

              {/* Totals footer */}
              <div
                className="px-4 py-2 flex items-center justify-between text-[11.5px] border-t"
                style={{
                  borderColor: "hsl(var(--border) / 0.5)",
                  background: "hsl(var(--gold-soft) / 0.2)",
                }}
              >
                <span className="text-muted-foreground">Totaal</span>
                <span
                  className="font-semibold tabular-nums"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {form.quantity || 0} × {totalKg > 0 ? `${totalKg.toLocaleString("nl-NL")} kg` : "— kg"}
                </span>
              </div>
            </div>

            {weightAnomaly && (
              <div
                className="mt-2 rounded-lg px-3 py-2 flex items-start gap-2"
                style={{
                  background: "hsl(32 85% 95%)",
                  border: "1px solid hsl(32 70% 55% / 0.35)",
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-[2px]" style={{ color: "hsl(32 70% 42%)" }} strokeWidth={1.75} />
                <p className="text-[11.5px]" style={{ color: "hsl(32 55% 30%)" }}>
                  {weightAnomaly.message}
                </p>
              </div>
            )}
          </section>

          {/* IV · Vereisten */}
          <section className="mb-5">
            <ChapterHead
              badge="IV"
              title="Vereisten"
              sub={form.requirements.length > 0 ? form.requirements.join(", ") : "Geen speciale vereisten"}
            />
            <div className="flex flex-wrap gap-2" {...reqLinkage}>
              {requirementOptions.map((req) => {
                const active = form.requirements.includes(req.id);
                return (
                  <button
                    key={req.id}
                    onClick={() => onToggleRequirement(req.id)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-[5px] rounded-full text-[11.5px] font-medium border transition-colors",
                    )}
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      background: active ? "hsl(var(--gold-soft) / 0.6)" : "hsl(var(--card))",
                      borderColor: active ? "hsl(var(--gold) / 0.5)" : "hsl(var(--border))",
                      color: active ? "hsl(var(--gold-deep))" : "hsl(var(--muted-foreground))",
                    }}
                  >
                    <span
                      className="w-[5px] h-[5px] rounded-full"
                      style={{
                        background: active ? "hsl(var(--gold))" : "hsl(var(--border))",
                      }}
                    />
                    {req.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* V · Bijlagen */}
          {selected.attachments && selected.attachments.length > 0 && (
            <section className="mb-5">
              <ChapterHead badge="V" title="Bijlagen" sub={`${selected.attachments.length} bestand${selected.attachments.length > 1 ? "en" : ""}`} />
              <div className="flex flex-wrap gap-2">
                {selected.attachments.map((att: any, i: number) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-[5px] rounded-full text-[11.5px] border hover:border-[hsl(var(--gold)/0.5)] transition-colors"
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      borderColor: "hsl(var(--border))",
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    <Paperclip className="h-3 w-3" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                    <span className="truncate max-w-[180px]">{att.name}</span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      {/* Sticky CTA footer */}
      <div
        className="absolute bottom-0 left-0 right-0 p-4 z-20"
        style={{
          background: "hsl(var(--card) / 0.95)",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid hsl(var(--gold) / 0.25)",
          boxShadow: "0 -8px 30px rgb(0 0 0 / 0.06)",
        }}
      >
        <div
          className="hairline"
          style={{ marginBottom: 10 }}
        />
        <div className="flex items-center gap-2 mb-2">
          <ClipboardCheck
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            style={{ color: formErrors ? "hsl(32 70% 45%)" : "hsl(var(--gold-deep))" }}
          />
          <p className="text-[11px] text-muted-foreground">
            {formErrors
              ? `${requiredFilled} van ${totalRequired} verplichte velden ingevuld`
              : "Alle verplichte velden gecontroleerd"}
          </p>
        </div>
        <button
          onClick={onCreateOrder}
          disabled={isCreatePending || formErrors}
          className={cn(
            "w-full h-11 rounded-xl font-semibold text-[13px] transition-all inline-flex items-center justify-center gap-2",
          )}
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "0.02em",
            background: formErrors
              ? "hsl(var(--muted))"
              : "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
            color: formErrors ? "hsl(var(--muted-foreground))" : "white",
            boxShadow: formErrors ? undefined : "0 4px 12px -2px hsl(var(--gold) / 0.4)",
            cursor: formErrors ? "not-allowed" : "pointer",
          }}
        >
          {isCreatePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Check className="h-4 w-4" strokeWidth={2} />
              Maak order aan
            </>
          )}
        </button>
        <div className="mt-2 text-center">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Afwijzen en archiveren
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>E-mail afwijzen?</AlertDialogTitle>
                <AlertDialogDescription>
                  Weet je zeker dat je deze e-mail wilt afwijzen en archiveren? Deze actie kan niet ongedaan worden gemaakt.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuleren</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Verwijderen
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
