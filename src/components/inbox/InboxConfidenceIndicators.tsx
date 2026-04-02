import { cn } from "@/lib/utils";

export function ConfidenceDot({ score }: { score: number }) {
  const isHigh = score >= 80;
  const isMedium = score >= 60 && score < 80;
  return (
    <span className={cn(
      "inline-block h-[6px] w-[6px] rounded-full shrink-0",
      isHigh && "bg-emerald-500",
      isMedium && "bg-amber-500",
      !isHigh && !isMedium && "bg-destructive"
    )} />
  );
}

export function ConfidenceRing({ score }: { score: number }) {
  const isHigh = score >= 80;
  const isMedium = score >= 60 && score < 80;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const colorClass = isHigh ? "text-emerald-600" : isMedium ? "text-amber-500" : "text-destructive";
  const strokeColor = isHigh ? "#059669" : isMedium ? "#f59e0b" : "hsl(var(--destructive))";
  const bgColor = isHigh ? "bg-emerald-50" : isMedium ? "bg-amber-50" : "bg-destructive/5";

  return (
    <div className={cn("flex items-center gap-3 rounded-xl px-3 py-2", bgColor)}>
      <div className="relative h-11 w-11 shrink-0">
        <svg className="h-11 w-11 -rotate-90" viewBox="0 0 52 52">
          <circle cx="26" cy="26" r={radius} fill="none" stroke="hsl(var(--border))" strokeWidth="2.5" opacity="0.3" />
          <circle cx="26" cy="26" r={radius} fill="none" stroke={strokeColor} strokeWidth="2.5"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-700 ease-out" />
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums", colorClass)}>
          {score}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground leading-tight">AI Score</p>
        <p className={cn("text-xs font-medium", colorClass)}>
          {isHigh ? "Hoge zekerheid" : isMedium ? "Controleer velden" : "Handmatig invoeren"}
        </p>
      </div>
    </div>
  );
}

export function FieldConfidence({ level }: { level: "high" | "medium" | "low" | "missing" }) {
  if (level === "high") return null;
  const config = {
    medium: { color: "bg-amber-500", label: "Controleer", textColor: "text-amber-600" },
    low: { color: "bg-destructive", label: "Onzeker", textColor: "text-destructive" },
    missing: { color: "bg-muted-foreground/30", label: "Ontbreekt", textColor: "text-muted-foreground" },
  };
  const c = config[level];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", c.textColor)}>
      <span className={cn("h-1 w-3 rounded-full", c.color)} />
      {c.label}
    </span>
  );
}
