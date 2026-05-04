import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { ChevronRight, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { vibrate, HAPTICS } from "@/lib/haptics";

interface Props {
  label: string;
  onConfirm: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
  /** 0..1, default 0.8 — drag-progress nodig om te bevestigen. */
  threshold?: number;
  icon?: ReactNode;
  /** Visuele variant: standaard goud, "success" voor groene afronding. */
  variant?: "default" | "success";
  className?: string;
}

const HANDLE_SIZE = 52;
const TRACK_HEIGHT = 60;

export function SwipeToConfirm({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  threshold = 0.8,
  icon,
  variant = "default",
  className,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fillOpacity = useTransform(x, (v) => {
    const max = (trackRef.current?.offsetWidth ?? 320) - HANDLE_SIZE - 8;
    if (max <= 0) return 0;
    return Math.min(1, v / max);
  });
  const fillWidth = useTransform(fillOpacity, (v) => `${v * 100}%`);
  const labelOpacity = useTransform(fillOpacity, [0, 0.5, 1], [1, 0.4, 0]);

  const handleEnd = async () => {
    if (disabled || submitting || confirmed) return;
    const track = trackRef.current;
    if (!track) return;
    const max = track.offsetWidth - HANDLE_SIZE - 8;
    const current = x.get();
    const ratio = max > 0 ? current / max : 0;

    if (ratio >= threshold) {
      animate(x, max, { type: "spring", stiffness: 400, damping: 30 });
      setConfirmed(true);
      setSubmitting(true);
      vibrate(HAPTICS.medium);
      try {
        await onConfirm();
      } finally {
        setSubmitting(false);
        setTimeout(() => {
          animate(x, 0, { duration: 0.3 });
          setConfirmed(false);
        }, 600);
      }
    } else {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 35 });
    }
  };

  const isDone = confirmed || loading;
  const trackBg =
    variant === "success"
      ? "bg-[hsl(var(--gold-soft)/0.45)] border-[hsl(var(--gold)/0.35)]"
      : "bg-[hsl(var(--gold-soft)/0.35)] border-[hsl(var(--gold)/0.28)]";

  return (
    <div
      ref={trackRef}
      className={cn(
        "relative w-full select-none overflow-hidden rounded-2xl border shadow-sm",
        trackBg,
        disabled && "opacity-50",
        className,
      )}
      style={{ height: TRACK_HEIGHT }}
    >
      <motion.div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 rounded-2xl",
          variant === "success"
            ? "bg-gradient-to-r from-emerald-400/40 to-emerald-500/55"
            : "bg-gradient-to-r from-[hsl(var(--gold)/0.5)] to-[hsl(var(--gold-deep)/0.55)]",
        )}
        style={{ width: fillWidth }}
      />

      <motion.span
        className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold tracking-tight text-[hsl(var(--gold-deep))] font-display"
        style={{ opacity: labelOpacity }}
      >
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
      </motion.span>

      <motion.button
        type="button"
        aria-label={label}
        disabled={disabled || submitting}
        drag={isDone || disabled ? false : "x"}
        dragConstraints={trackRef}
        dragElastic={0.05}
        dragMomentum={false}
        onDragEnd={handleEnd}
        className={cn(
          "absolute top-1 left-1 flex items-center justify-center rounded-2xl text-white shadow-md",
          variant === "success"
            ? "bg-gradient-to-br from-emerald-500 to-emerald-600"
            : "bg-gradient-to-br from-[hsl(var(--gold))] to-[hsl(var(--gold-deep))]",
          disabled && "cursor-not-allowed",
        )}
        style={{ x, width: HANDLE_SIZE, height: HANDLE_SIZE - 4 }}
        whileTap={{ scale: 0.96 }}
      >
        {submitting || loading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : confirmed ? (
          <Check className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
      </motion.button>
    </div>
  );
}

export default SwipeToConfirm;
