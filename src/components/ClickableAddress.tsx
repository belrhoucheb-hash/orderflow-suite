import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClickableAddressProps {
  address: string | null;
  className?: string;
  iconClassName?: string;
  fallback?: React.ReactNode;
  showIcon?: boolean;
}

export function ClickableAddress({
  address,
  className,
  iconClassName = "text-primary",
  fallback = <span className="text-destructive italic">Ontbreekt</span>,
  showIcon = true,
}: ClickableAddressProps) {
  if (!address) return <>{fallback}</>;

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 hover:underline hover:text-primary transition-colors cursor-pointer",
        className
      )}
      title={`Bekijk in Google Maps: ${address}`}
    >
      {showIcon && <MapPin className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />}
      <span className="truncate">{address}</span>
    </a>
  );
}
