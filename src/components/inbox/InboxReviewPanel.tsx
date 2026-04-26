import { useState, useEffect } from "react";
import {
  Loader2,
  Plus,
  AlertTriangle,
  Check,
  HelpCircle,
  MessageSquare,
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
import type { AutoConfirmAssessment } from "@/lib/autoConfirm";
import { FollowUpPanel } from "@/components/inbox/InboxFollowUpPanel";
import { getRecommendedFollowUpAction } from "@/lib/followUpDraft";
import { getFollowUpStatus } from "@/lib/followUpStatus";
import type { InboxCaseSummary } from "@/lib/inboxCase";
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
  autoConfirmAssessment: AutoConfirmAssessment;
  caseSummary: InboxCaseSummary;
  onUpdateField: (field: keyof FormState, value: any) => void;
  onToggleRequirement: (req: string) => void;
  onAutoSave: () => void;
  onCreateOrder: () => void;
  onAutoConfirm: () => void;
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
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
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
        {sub && <p className="mt-[2px] text-[11.5px] leading-[1.45] text-foreground/80">{sub}</p>}
      </div>
    </div>
  );
}

type ReviewFieldTone = "ok" | "review" | "missing";

function normaliseConfidence(raw?: number | null) {
  if (raw == null || Number.isNaN(raw)) return null;
  return raw <= 1 ? Math.round(raw * 100) : Math.round(raw);
}

function FieldStatePill({ tone, label }: { tone: ReviewFieldTone; label: string }) {
  const tones: Record<ReviewFieldTone, string> = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    review: "border-amber-200 bg-amber-50 text-amber-800",
    missing: "border-red-200 bg-red-50 text-red-700",
  };

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-semibold", tones[tone])}>
      {label}
    </span>
  );
}

export function InboxReviewPanel({
  selected,
  form,
  isCreatePending,
  autoConfirmAssessment,
  caseSummary,
  onUpdateField,
  onToggleRequirement,
  onAutoSave,
  onCreateOrder,
  onAutoConfirm,
  onDelete,
}: Props) {
  const formErrors = getFormErrors(form);
  const filledCount = getFilledCount(form);
  const totalFields = getTotalFields();
  const extractionConfidence = computeFieldConfidence(form);
  const requiredFilled = getRequiredFilledCount(form);
  const totalRequired = 4;
  const autoConfirmConfidence = normaliseConfidence(autoConfirmAssessment.confidence) ?? 0;

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

  const confColor =
    extractionConfidence >= 80
      ? "hsl(var(--gold-deep))"
      : extractionConfidence >= 60
        ? "hsl(32 70% 45%)"
        : "hsl(0 60% 50%)";
  const autoConfirmColor =
    autoConfirmConfidence >= 95
      ? "hsl(145 63% 34%)"
      : autoConfirmConfidence >= 80
        ? "hsl(var(--gold-deep))"
        : autoConfirmConfidence > 0
          ? "hsl(32 70% 45%)"
          : "hsl(0 60% 50%)";

  const possibleDuplicate = (selected as any).possible_duplicate as boolean | undefined;
  const anomalies = selected.anomalies || [];
  const weightAnomaly = anomalies.find((a) => a.field === "weight_kg");
  const followUpStatus = getFollowUpStatus(selected);
  const missingFieldsCount = (selected.missing_fields || []).length;
  const missingFieldSet = new Set((selected.missing_fields || []).map((field) => field.toLowerCase()));
  const fieldAliases: Record<string, string[]> = {
    pickupAddress: ["pickup_address", "pickup_time_window"],
    deliveryAddress: ["delivery_address", "delivery_time_window"],
    quantity: ["quantity"],
    weight: ["weight", "weight_kg"],
    unit: ["unit"],
    dimensions: ["dimensions"],
    requirements: ["requirements"],
    transportType: ["transport_type"],
  };
  const hasMissingField = (key: keyof typeof fieldAliases) => fieldAliases[key].some((alias) => missingFieldSet.has(alias));
  const pickupNeedsAttention = hasMissingField("pickupAddress") || !form.pickupAddress || isAddressIncomplete(form.pickupAddress);
  const deliveryNeedsAttention = hasMissingField("deliveryAddress") || !form.deliveryAddress || isAddressIncomplete(form.deliveryAddress);
  const pickupTimeNeedsAttention =
    missingFieldSet.has("pickup_time_window") ||
    missingFieldSet.has("pickup_date") ||
    missingFieldSet.has("pickup_time") ||
    (!!selected.pickup_time_from && !selected.pickup_time_to) ||
    (!selected.pickup_time_from && !!selected.pickup_time_to);
  const deliveryTimeNeedsAttention =
    missingFieldSet.has("delivery_time_window") ||
    missingFieldSet.has("delivery_date") ||
    missingFieldSet.has("delivery_time") ||
    (!!selected.delivery_time_from && !selected.delivery_time_to) ||
    (!selected.delivery_time_from && !!selected.delivery_time_to);
  const quantityMissing = hasMissingField("quantity") || !form.quantity;
  const weightMissing = hasMissingField("weight") || !form.weight;
  const unitMissing = hasMissingField("unit") || !form.unit;
  const dimensionsMissing = hasMissingField("dimensions") || !form.dimensions;
  const requirementsMissing = hasMissingField("requirements");
  const routeNeedsAttention =
    pickupNeedsAttention || deliveryNeedsAttention || pickupTimeNeedsAttention || deliveryTimeNeedsAttention;
  const cargoNeedsAttention = quantityMissing || weightMissing || dimensionsMissing || !!weightAnomaly;
  const requirementsNeedAttention = requirementsMissing;
  const topBlockers = caseSummary.blockers.slice(0, 4);
  const recommendedFollowUpAction = getRecommendedFollowUpAction(selected);
  const needsFollowUpGuidance =
    !autoConfirmAssessment.eligible &&
    ["request_missing_info", "verify_anomaly", "review_update", "review_cancellation", "answer_question"].includes(
      recommendedFollowUpAction.key,
    );

  const primaryActionLabel = autoConfirmAssessment.eligible
    ? "Auto-confirm en maak order aan"
    : needsFollowUpGuidance
      ? recommendedFollowUpAction.label
      : "Maak order aan";

  const primaryActionDescription = formErrors
    ? `${requiredFilled} van ${totalRequired} verplichte velden ingevuld`
    : autoConfirmAssessment.eligible
      ? autoConfirmAssessment.reason
      : needsFollowUpGuidance
        ? recommendedFollowUpAction.description
        : topBlockers.length > 0
          ? `${caseSummary.nextStep} - ${topBlockers[0].label}`
          : autoConfirmAssessment.reason;

  const handoffSummary = (() => {
    switch (caseSummary.status.key) {
      case "auto_confirm_ready":
        return {
          title: "Klaar voor directe doorstroom",
          description: "Deze intake is compleet genoeg om direct te bevestigen en door te zetten.",
          tone: "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.96),rgba(255,255,255,0.98))] text-emerald-900",
        };
      case "ready_for_order":
        return {
          title: "Klaar om order te maken",
          description: "Na aanmaak kan deze order direct naar confirm of planning.",
          tone: "border-[hsl(var(--gold)/0.18)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.18),rgba(255,255,255,0.98))] text-foreground",
        };
      case "response_received":
        return {
          title: "Nieuwe reactie verwerkt",
          description: topBlockers.length > 0
            ? "Werk de nieuwe informatie door en rond daarna de intake af."
            : "De reactie vult de intake aan; rond nu de order af.",
          tone: "border-sky-200 bg-[linear-gradient(180deg,rgba(239,246,255,0.96),rgba(255,255,255,0.98))] text-sky-900",
        };
      default:
        return null;
    }
  })();

  const totalKg = form.weight
    ? form.perUnit
      ? Number(form.weight) * form.quantity
      : Number(form.weight)
    : 0;

  const handlePrimaryAction = () => {
    if (autoConfirmAssessment.eligible) {
      onAutoConfirm();
      return;
    }

    if (needsFollowUpGuidance) {
      document.getElementById("follow-up-workflow")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    onCreateOrder();
  };

  const ctaVisual = (() => {
    if (autoConfirmAssessment.eligible) {
      return {
        icon: Check,
        background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
        shadow: "0 4px 12px -2px hsl(var(--gold) / 0.4)",
        iconColor: "hsl(var(--gold-deep))",
      };
    }

    switch (recommendedFollowUpAction.key) {
      case "request_missing_info":
      case "answer_question":
        return {
          icon: MessageSquare,
          background: "linear-gradient(180deg, hsl(220 82% 59%) 0%, hsl(221 70% 47%) 100%)",
          shadow: "0 4px 12px -2px hsl(220 82% 59% / 0.35)",
          iconColor: "hsl(220 82% 45%)",
        };
      case "verify_anomaly":
      case "review_cancellation":
        return {
          icon: AlertTriangle,
          background: "linear-gradient(180deg, hsl(25 95% 58%) 0%, hsl(18 84% 46%) 100%)",
          shadow: "0 4px 12px -2px hsl(25 95% 58% / 0.35)",
          iconColor: "hsl(24 90% 42%)",
        };
      case "review_update":
        return {
          icon: Pencil,
          background: "linear-gradient(180deg, hsl(267 76% 62%) 0%, hsl(262 64% 49%) 100%)",
          shadow: "0 4px 12px -2px hsl(267 76% 62% / 0.35)",
          iconColor: "hsl(262 64% 45%)",
        };
      default:
        return {
          icon: Check,
          background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
          shadow: "0 4px 12px -2px hsl(var(--gold) / 0.4)",
          iconColor: "hsl(var(--gold-deep))",
        };
    }
  })();

  const PrimaryActionIcon = ctaVisual.icon;

  return (
    <div
      className="relative flex flex-col h-full"
      style={{ minWidth: 0, overflow: "hidden", background: "hsl(var(--background))" }}
    >
      <ScrollArea className="flex-1" style={{ minWidth: 0 }}>
        <div className="px-4 pt-4 pb-40 md:px-5 md:pt-5">
          {/* Header block */}
          <div className="mb-4 rounded-[28px] border border-[hsl(var(--gold)/0.1)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.12),white)] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
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
                className="max-w-[22rem] text-[18px] font-semibold leading-tight sm:text-[19px] md:max-w-none md:text-[22px]"
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
              {followUpStatus && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-medium", followUpStatus.tone)}>
                    {followUpStatus.label}
                  </span>
                  {missingFieldsCount > 0 && (
                    <span className="text-[11px] text-muted-foreground">
                      {missingFieldsCount} veld{missingFieldsCount > 1 ? "en" : ""} wachten op klantinfo
                    </span>
                  )}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-medium", caseSummary.status.tone)}>
                  {caseSummary.status.label}
                </span>
                <span className="text-[11px] text-muted-foreground">Volgende stap: {caseSummary.nextStep}</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-row items-center gap-3 self-start md:flex-col md:items-center md:gap-0">
              <span
                className="mb-0 rounded-full px-2 py-[2px] text-[10px] tabular-nums text-muted-foreground md:mb-2"
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
                    strokeDashoffset={2 * Math.PI * 28 * (1 - extractionConfidence / 100)}
                    className="transition-all duration-500"
                  />
                </svg>
                <span
                  className="absolute inset-0 flex items-center justify-center text-[14px] font-semibold tabular-nums"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: confColor }}
                >
                  {extractionConfidence}%
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
                className="mt-0 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground md:mt-1"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                <HelpCircle className="h-3 w-3" strokeWidth={1.75} />
                Waarom?
              </button>
            </div>
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

          {handoffSummary && (
            <div className={cn("mb-4 rounded-2xl border px-4 py-3", handoffSummary.tone)}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Handoff</p>
              <p className="mt-2 text-[13px] font-semibold">{handoffSummary.title}</p>
              <p className="mt-1 text-[11.5px] leading-[1.55] text-current/80">{handoffSummary.description}</p>
            </div>
          )}

          <div className="hairline my-4 opacity-60" />

          {/* I · AI-extractie */}
          <section className="mb-5">
            <ChapterHead
              badge="I"
              title="AI-extractie"
              sub={`${extractionConfidence}% extractiezekerheid, ${filledCount}/${totalFields} velden herkend`}
            />
            <div className="card--luxe p-4">
              <div className="mb-2 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                <span
                  className="text-[11px] font-medium"
                  style={{ fontFamily: "'Space Grotesk', sans-serif", color: "hsl(var(--gold-deep))" }}
                >
                  Automatisch geëxtraheerd
                </span>
                <span className="ml-auto text-[11px] tabular-nums font-semibold" style={{ color: confColor }}>
                  {extractionConfidence}%
                </span>
              </div>
              <div
                className="w-full h-[6px] rounded-full overflow-hidden"
                style={{ background: "hsl(var(--gold-soft) / 0.5)" }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${extractionConfidence}%`,
                    background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--gold-deep)))",
                  }}
                />
              </div>
              <p className="mt-2 text-[10.5px] leading-[1.45] text-muted-foreground">
                {selected.attachments?.length
                  ? `Uit e-mail plus ${selected.attachments.length} bijlage${selected.attachments.length > 1 ? "n" : ""}`
                  : "Uit e-mailtekst"}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--gold-soft)/0.18)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Extractiezekerheid</p>
                  <p
                    className="mt-1 text-[16px] font-semibold tabular-nums"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", color: confColor }}
                  >
                    {extractionConfidence}%
                  </p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">
                    {filledCount} van {totalFields} ordervelden herkend
                  </p>
                </div>
                <div
                  className="rounded-xl border px-3 py-2"
                  style={{
                    borderColor: autoConfirmAssessment.eligible ? "rgb(167 243 208)" : "rgb(254 202 202)",
                    background: autoConfirmAssessment.eligible ? "rgba(236,253,245,0.72)" : "rgba(254,242,242,0.72)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Auto-confirm score</p>
                  <p
                    className="mt-1 text-[16px] font-semibold tabular-nums"
                    style={{ fontFamily: "'Space Grotesk', sans-serif", color: autoConfirmColor }}
                  >
                    {autoConfirmConfidence}%
                  </p>
                  <p className="mt-1 text-[10.5px] text-muted-foreground">Drempel voor automatisch doorzetten: 95%</p>
                </div>
              </div>
              <div
                className={cn(
                  "mt-3 rounded-xl border px-3 py-2 text-[11.5px]",
                  autoConfirmAssessment.eligible
                    ? "border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(236,253,245,0.74))] text-emerald-900"
                    : "border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.92),rgba(254,242,242,0.74))] text-red-900",
                )}
              >
                <p className="font-semibold">{autoConfirmAssessment.title}</p>
                <p className="mt-1">{autoConfirmAssessment.reason}</p>
              </div>
            </div>
          </section>

          {/* II · Route */}
          <section className="mb-5">
            <ChapterHead
              badge="II"
              title="Route"
              sub={routeNeedsAttention ? "Controle nodig op routegegevens" : "Ophalen en afleveren"}
            />
            <div
              className="card--luxe p-4"
              style={
                routeNeedsAttention
                  ? { borderColor: "rgb(254 202 202)", boxShadow: "0 0 0 1px rgba(248,113,113,0.12)" }
                  : undefined
              }
            >
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
                      background: pickupNeedsAttention ? "rgb(239 68 68)" : "hsl(var(--gold))",
                      border: "2px solid hsl(var(--card))",
                      boxShadow: pickupNeedsAttention ? "0 0 0 1px rgba(239,68,68,0.24)" : "0 0 0 1px hsl(var(--gold) / 0.3)",
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 mb-[2px]">
                      <MapPin className="h-3 w-3" strokeWidth={1.75} style={{ color: pickupNeedsAttention ? "rgb(220 38 38)" : "hsl(var(--gold-deep))" }} />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Ophalen
                      </span>
                      <FieldStatePill tone={pickupNeedsAttention ? "missing" : "ok"} label={pickupNeedsAttention ? "Ontbreekt" : "Gevonden"} />
                    </div>
                    <AddressAutocomplete
                      value={form.pickupAddress}
                      onChange={(v) => onUpdateField("pickupAddress", v)}
                      onBlur={onAutoSave}
                      placeholder="Ophaaladres..."
                      className={cn(
                        "h-auto border-0 shadow-none p-0 text-[13px] font-medium bg-transparent focus-visible:ring-1 focus-visible:ring-[hsl(var(--gold)/0.4)] focus-visible:bg-white focus-visible:rounded focus-visible:px-1",
                        pickupNeedsAttention && "text-destructive italic font-normal",
                      )}
                    />
                    {pickupNeedsAttention && (
                      <p className="text-[10.5px] text-red-700 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                        {!form.pickupAddress ? "Ophaaladres ontbreekt" : "Adres onvolledig, straat en nummer nodig"}
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
                      <FieldStatePill tone={pickupTimeNeedsAttention ? "review" : "ok"} label={pickupTimeNeedsAttention ? "Venster checken" : "Venster ok"} />
                    </div>
                    {pickupTimeNeedsAttention && (
                      <p className="mt-1 flex items-center gap-1 text-[10.5px] text-amber-800">
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                        Laadvenster is nog onvolledig of ontbreekt.
                      </p>
                    )}
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
                      background: deliveryNeedsAttention ? "rgb(239 68 68)" : "hsl(var(--gold-deep))",
                      border: "2px solid hsl(var(--card))",
                      boxShadow: deliveryNeedsAttention
                        ? "0 0 0 1px rgba(239,68,68,0.24)"
                        : "0 0 0 1px hsl(var(--gold-deep) / 0.3)",
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5 mb-[2px]">
                      <MapPin
                        className="h-3 w-3"
                        strokeWidth={1.75}
                        style={{ color: deliveryNeedsAttention ? "rgb(220 38 38)" : "hsl(var(--gold-deep))" }}
                      />
                      <span
                        className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        Afleveren
                      </span>
                      <FieldStatePill tone={deliveryNeedsAttention ? "missing" : "ok"} label={deliveryNeedsAttention ? "Ontbreekt" : "Gevonden"} />
                    </div>
                    <AddressAutocomplete
                      value={form.deliveryAddress}
                      onChange={(v) => onUpdateField("deliveryAddress", v)}
                      onBlur={onAutoSave}
                      placeholder="Afleveradres..."
                      className={cn(
                        "h-auto border-0 shadow-none p-0 text-[13px] font-medium bg-transparent focus-visible:ring-1 focus-visible:ring-[hsl(var(--gold)/0.4)] focus-visible:bg-white focus-visible:rounded focus-visible:px-1",
                        deliveryNeedsAttention && "text-destructive italic font-normal",
                      )}
                    />
                    {deliveryNeedsAttention && (
                      <p className="text-[10.5px] text-red-700 mt-1 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                        {!form.deliveryAddress ? "Afleveradres ontbreekt" : "Adres onvolledig, straat en nummer nodig"}
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
                      <FieldStatePill tone={deliveryTimeNeedsAttention ? "review" : "ok"} label={deliveryTimeNeedsAttention ? "Venster checken" : "Venster ok"} />
                    </div>
                    {deliveryTimeNeedsAttention && (
                      <p className="mt-1 flex items-center gap-1 text-[10.5px] text-amber-800">
                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                        Losvenster is nog onvolledig of ontbreekt.
                      </p>
                    )}
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
              sub={
                cargoNeedsAttention
                  ? "Controle nodig op ladinggegevens"
                  : `${form.quantity || 0} ${form.unit || "stuks"}, ${totalKg > 0 ? `${totalKg.toLocaleString("nl-NL")} kg` : "gewicht onbekend"}`
              }
            />
            <div
              className="card--luxe p-0 overflow-hidden"
              style={
                cargoNeedsAttention
                  ? { borderColor: "rgb(254 202 202)", boxShadow: "0 0 0 1px rgba(248,113,113,0.12)" }
                  : undefined
              }
            >
              {/* Read-only row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Package
                    className="h-4 w-4 shrink-0"
                    strokeWidth={1.75}
                    style={{ color: cargoNeedsAttention ? "rgb(220 38 38)" : "hsl(var(--gold-deep))" }}
                  />
                  <div className="min-w-0" {...qtyLinkage}>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn("text-[14px] font-semibold tabular-nums", quantityMissing && "text-red-700")}
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {form.quantity || 0}
                      </span>
                      <span className={cn("text-[12.5px] text-muted-foreground", unitMissing && "text-red-700")}>{form.unit || "Pallets"}</span>
                      <FieldStatePill tone={quantityMissing || weightMissing || dimensionsMissing ? "missing" : "ok"} label={quantityMissing || weightMissing || dimensionsMissing ? "Ontbreekt" : "Compleet"} />
                    </div>
                    {form.dimensions && (
                      <span className={cn("text-[11px] text-muted-foreground tabular-nums", dimensionsMissing && "text-red-700")} {...dimsLinkage}>
                        {form.dimensions} cm
                      </span>
                    )}
                    {!form.dimensions && <span className="text-[11px] text-red-700 tabular-nums">Afmetingen ontbreekt</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-[12.5px] tabular-nums", weightMissing && "text-red-700")} {...weightLinkage}>
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
                      <span className={cn("text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground", quantityMissing && "text-red-700")}>Aantal</span>
                      <Input
                        type="number"
                        value={form.quantity}
                        onChange={(e) => onUpdateField("quantity", Number(e.target.value))}
                        onBlur={onAutoSave}
                        className={cn("h-8 mt-1", quantityMissing && "border-red-300 focus-visible:ring-red-200")}
                      />
                    </label>
                    <label className="block">
                      <span className={cn("text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground", unitMissing && "text-red-700")}>Eenheid</span>
                      <Select
                        value={form.unit}
                        onValueChange={(v) => {
                          onUpdateField("unit", v);
                          setTimeout(onAutoSave, 0);
                        }}
                      >
                        <SelectTrigger className={cn("h-8 mt-1", unitMissing && "border-red-300 focus:ring-red-200")}>
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
                    <span className={cn("text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground", dimensionsMissing && "text-red-700")}>
                      Afmetingen, L × B × H (cm)
                    </span>
                    <Input
                      value={form.dimensions}
                      onChange={(e) => onUpdateField("dimensions", e.target.value)}
                      onBlur={onAutoSave}
                      placeholder="120x80x145"
                      className={cn("h-8 mt-1", dimensionsMissing && "border-red-300 focus-visible:ring-red-200")}
                    />
                    {dimensionsMissing && <p className="mt-1 text-[10.5px] text-red-700">Afmetingen ontbreekt</p>}
                  </label>

                  <label className="block">
                    <span className={cn("text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground", weightMissing && "text-red-700")}>
                      Gewicht {form.perUnit ? "(per eenheid)" : "(totaal)"}
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Input
                        value={form.weight}
                        onChange={(e) => onUpdateField("weight", e.target.value)}
                        onBlur={onAutoSave}
                        placeholder="—"
                        className={cn("h-8", weightMissing && "border-red-300 focus-visible:ring-red-200")}
                      />
                      <span className={cn("text-[12px] text-muted-foreground", weightMissing && "text-red-700")}>kg</span>
                    </div>
                    {weightMissing && <p className="mt-1 text-[10.5px] text-red-700">Gewicht ontbreekt</p>}
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
                className="flex items-center justify-between border-t px-4 py-2 text-[11.5px]"
                style={{
                  borderColor: "hsl(var(--gold) / 0.1)",
                  background: "linear-gradient(180deg,hsl(var(--gold-soft)/0.16),hsl(var(--gold-soft)/0.08))",
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
              sub={
                requirementsNeedAttention
                  ? "Vereisten nog bevestigen"
                  : form.requirements.length > 0
                    ? form.requirements.join(", ")
                    : "Geen speciale vereisten"
              }
            />
            <div className="mb-2 flex items-center gap-2">
              <FieldStatePill
                tone={requirementsNeedAttention ? "missing" : "ok"}
                label={requirementsNeedAttention ? "Ontbreekt" : "Compleet"}
              />
              {requirementsNeedAttention && <span className="text-[11px] text-red-700">De klant moet speciale vereisten nog bevestigen.</span>}
            </div>
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
            <section className="mb-5" id="follow-up-workflow">
              <ChapterHead badge="V" title="Bijlagen" sub={`${selected.attachments.length} bestand${selected.attachments.length > 1 ? "en" : ""}`} />
              <div className="flex flex-wrap gap-2">
                {selected.attachments.map((att: any, i: number) => (
                  <a
                    key={i}
                    href={att.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-w-0 items-center gap-2 rounded-full border bg-[linear-gradient(180deg,white,hsl(var(--gold-soft)/0.08))] px-3 py-[6px] text-[11.5px] transition-colors hover:border-[hsl(var(--gold)/0.24)] hover:bg-[hsl(var(--gold-soft)/0.16)]"
                    style={{
                      fontFamily: "'Space Grotesk', sans-serif",
                      borderColor: "hsl(var(--gold) / 0.12)",
                      color: "hsl(var(--foreground))",
                    }}
                  >
                    <Paperclip className="h-3 w-3" strokeWidth={1.75} style={{ color: "hsl(var(--gold-deep))" }} />
                    <span className="truncate">{att.name}</span>
                  </a>
                ))}
              </div>
            </section>
          )}

          {(selected.missing_fields?.length || selected.follow_up_draft || selected.follow_up_sent_at) && (
            <section className="mb-5">
              <ChapterHead
                badge="VI"
                title="Wacht Op Info"
                sub={
                  selected.follow_up_sent_at
                    ? "Follow-up is verstuurd, wacht op reactie van de klant"
                    : selected.follow_up_draft
                      ? "Concept staat klaar om te versturen"
                      : "Er ontbreekt nog informatie om de order af te ronden"
                }
              />
              <div className="card--luxe overflow-hidden">
                <FollowUpPanel selected={selected} />
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      {/* Sticky CTA footer */}
      <div
        className="absolute bottom-0 left-0 right-0 z-20 p-4"
        style={{
          background: "linear-gradient(180deg,hsl(var(--card)/0.88),hsl(var(--card)/0.97))",
          backdropFilter: "blur(8px)",
          borderTop: "1px solid hsl(var(--gold) / 0.18)",
          boxShadow: "0 -8px 30px rgb(0 0 0 / 0.06)",
        }}
      >
        {topBlockers.length > 0 && (
          <div
            className="mb-3 rounded-2xl border px-3 py-3"
            style={{
              borderColor: topBlockers.some((blocker) => blocker.severity === "critical") ? "rgb(254 202 202)" : "rgb(253 230 138)",
              background: topBlockers.some((blocker) => blocker.severity === "critical")
                ? "linear-gradient(180deg, rgba(254,242,242,0.94), rgba(255,255,255,0.98))"
                : "linear-gradient(180deg, rgba(255,251,235,0.94), rgba(255,255,255,0.98))",
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Wat blokkeert nu</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {topBlockers.map((blocker) => (
                <span
                  key={blocker.key}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-[3px] text-[10.5px] font-medium",
                    blocker.severity === "critical"
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-amber-200 bg-amber-50 text-amber-800",
                  )}
                >
                  {blocker.label}
                </span>
              ))}
            </div>
          </div>
        )}
        <div
          className="hairline"
          style={{ marginBottom: 10 }}
        />
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <ClipboardCheck
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            style={{ color: formErrors ? "hsl(32 70% 45%)" : ctaVisual.iconColor }}
          />
          <p className="text-[11px] leading-[1.45] text-muted-foreground">{primaryActionDescription}</p>
        </div>
        <button
          onClick={handlePrimaryAction}
          disabled={isCreatePending || formErrors}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[12.5px] font-semibold transition-all sm:text-[13px]",
          )}
          style={{
            fontFamily: "'Space Grotesk', sans-serif",
            letterSpacing: "0.02em",
            background: formErrors
              ? "hsl(var(--muted))"
              : ctaVisual.background,
            color: formErrors ? "hsl(var(--muted-foreground))" : "white",
            boxShadow: formErrors ? undefined : ctaVisual.shadow,
            cursor: formErrors ? "not-allowed" : "pointer",
          }}
        >
          {isCreatePending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <PrimaryActionIcon className="h-4 w-4" strokeWidth={2} />
              {primaryActionLabel}
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
