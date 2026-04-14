import { CheckCircle2, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface BulkActionFailure {
  label: string;
  error: string;
}

export interface BulkActionFeedbackProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  successCount: number;
  failureCount: number;
  failures?: BulkActionFailure[];
}

/**
 * Reusable feedback dialog for bulk actions.
 * Shows a summary of successes/failures and an optional table of per-row errors.
 */
const BulkActionFeedback = ({
  open,
  onOpenChange,
  title,
  successCount,
  failureCount,
  failures = [],
}: BulkActionFeedbackProps) => {
  const hasFailures = failureCount > 0 && failures.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                "bg-emerald-50 text-emerald-700 border border-emerald-200",
              )}
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>{successCount} geslaagd</span>
            </div>
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                failureCount > 0
                  ? "bg-red-50 text-red-700 border border-red-200"
                  : "bg-muted/40 text-muted-foreground border border-border/40",
              )}
            >
              <XCircle className="h-4 w-4" />
              <span>{failureCount} mislukt</span>
            </div>
          </div>

          {/* Failures list */}
          {hasFailures && (
            <div className="border border-border/50 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Fouten
              </div>
              <ul className="divide-y divide-border/30 max-h-60 overflow-y-auto">
                {failures.map((f, idx) => (
                  <li key={idx} className="px-3 py-2 text-sm">
                    <p className="font-medium">{f.label}</p>
                    <p className="text-xs text-red-600 mt-0.5 break-words">
                      {f.error}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Sluiten</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkActionFeedback;
