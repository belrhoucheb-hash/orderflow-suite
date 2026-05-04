// 4-stappen onboarding voor de connector-marketplace.
//
// Activatie:
//   - Automatisch bij eerste bezoek: localStorage flag
//     `orderflow_marketplace_tour_seen` ontbreekt.
//   - Handmatig via de "Tour"-link in de hero (open=true sturen).
//
// Highlight-strategie: we zoeken op een data-tour="<step>"-attribuut in
// de DOM en plaatsen een focus-ring + tooltip naast het element. Resize/
// scroll updaten de positie. Geen externe libraries.

import { useEffect, useLayoutEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const TOUR_STORAGE_KEY = "orderflow_marketplace_tour_seen";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Step {
  target: string;
  title: string;
  body: string;
  placement: "bottom" | "top";
}

const STEPS: Step[] = [
  {
    target: "search",
    title: "Vind elke koppeling in seconden",
    body: "Zoek op naam, capability of categorie. We typen mee met fuzzy-matching.",
    placement: "bottom",
  },
  {
    target: "featured",
    title: "Begin met onze aanbevelingen",
    body: "De Aanbevolen-rij toont de connectoren die de meeste teams het eerst inschakelen.",
    placement: "bottom",
  },
  {
    target: "chips",
    title: "Filter op categorie",
    body: "Boekhouding, telematica, communicatie of webshop & ERP. Eén klik filtert de marketplace.",
    placement: "bottom",
  },
  {
    target: "bundles",
    title: "Snelle setup met bundels",
    body: "Bundels combineren meerdere koppelingen in een onboarding-wizard. In één keer live.",
    placement: "top",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getRect(target: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function MarketplaceTour({ open, onClose }: Props) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  const step = STEPS[stepIndex];

  useLayoutEffect(() => {
    if (!open || !step) return;
    const update = () => setRect(getRect(step.target));
    update();
    const id = window.setTimeout(update, 50);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, step]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open || !step) return null;

  const finish = () => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      // silent: localStorage kan geblokkeerd zijn (private mode)
    }
    onClose();
  };

  const next = () => {
    if (stepIndex < STEPS.length - 1) setStepIndex(stepIndex + 1);
    else finish();
  };

  const isLast = stepIndex === STEPS.length - 1;
  const padding = 8;
  const ring = rect
    ? {
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      }
    : null;

  const tooltipTop = rect
    ? step.placement === "bottom"
      ? rect.top + rect.height + padding + 12
      : rect.top - padding - 12
    : 0;
  const tooltipTransform = step.placement === "top" ? "translateY(-100%)" : "none";

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Marketplace-rondleiding"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        onClick={finish}
      />

      <AnimatePresence mode="wait">
        {ring && (
          <motion.div
            key={`ring-${stepIndex}`}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="pointer-events-none absolute rounded-2xl ring-4 ring-[hsl(var(--gold)/0.85)] ring-offset-2 ring-offset-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.0)]"
            style={{
              top: ring.top,
              left: ring.left,
              width: ring.width,
              height: ring.height,
            }}
          />
        )}
      </AnimatePresence>

      {rect && (
        <motion.div
          key={`tip-${stepIndex}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute w-[min(360px,calc(100vw-32px))] rounded-2xl border border-[hsl(var(--gold)/0.3)] bg-white p-5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
          style={{
            top: tooltipTop,
            left: Math.max(16, Math.min(rect.left, window.innerWidth - 376)),
            transform: tooltipTransform,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-display font-semibold uppercase tracking-[0.24em] text-[hsl(var(--gold-deep))]">
                Stap {stepIndex + 1} van {STEPS.length}
              </p>
              <h3 className="mt-1 font-display text-base font-semibold tracking-tight text-foreground">
                {step.title}
              </h3>
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="Sluit rondleiding"
              className="h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.5)] hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.body}</p>

          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    i === stepIndex
                      ? "w-6 bg-[hsl(var(--gold-deep))]"
                      : "w-1.5 bg-[hsl(var(--gold)/0.3)]",
                  )}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={finish}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Sla over
              </button>
              <button
                type="button"
                onClick={next}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))] px-4 text-xs font-display font-semibold text-white shadow-[0_8px_20px_-8px_hsl(var(--gold-deep)/0.5)] transition-all hover:-translate-y-0.5"
              >
                {isLast ? "Klaar" : "Volgende"}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

export function shouldAutoStartTour(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(TOUR_STORAGE_KEY) !== "1";
  } catch {
    return false;
  }
}
