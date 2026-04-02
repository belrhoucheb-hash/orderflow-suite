import { Loader2 } from "lucide-react";

export function LoadingState({ message = "Laden..." }: { message?: string }) {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      <span className="ml-3 text-muted-foreground">{message}</span>
    </div>
  );
}
