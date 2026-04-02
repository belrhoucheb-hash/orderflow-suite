import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** Lucide icon to display. Defaults to Inbox. */
  icon?: LucideIcon;
  /** Main heading */
  title: string;
  /** Supporting text */
  description?: string;
  /** Optional CTA button or other action element */
  action?: ReactNode;
  /** Additional className */
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("empty-state", className)}>
      <Icon className="empty-state__icon" />
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
