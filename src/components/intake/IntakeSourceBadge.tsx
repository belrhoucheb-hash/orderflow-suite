import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getIntakeSourceMeta } from "@/lib/intakeSources";

interface IntakeSourceBadgeProps {
  source?: string | null;
  fallbackHasEmail?: boolean;
  className?: string;
}

export function IntakeSourceBadge({
  source,
  fallbackHasEmail = false,
  className,
}: IntakeSourceBadgeProps) {
  const meta = getIntakeSourceMeta(source, fallbackHasEmail);

  if (meta.key === "UNKNOWN") {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn("border text-[10px] font-medium rounded-full", meta.className, className)}
      title={meta.description}
    >
      {meta.label}
    </Badge>
  );
}
