import { Sparkles } from "lucide-react";
import { useAutoPlan } from "@/hooks/useAutoPlan";
import type { UnplacedOrderHint } from "./UnplacedOrdersLane";

interface AutoPlanButtonProps {
  date: string;
  onUnplacedChange?: (unplaced: UnplacedOrderHint[]) => void;
}

export function AutoPlanButton({ date, onUnplacedChange }: AutoPlanButtonProps) {
  const autoPlan = useAutoPlan();

  async function handleClick() {
    const result = await autoPlan.mutateAsync({ date });
    if (result?.unplaced && onUnplacedChange) {
      onUnplacedChange(result.unplaced as UnplacedOrderHint[]);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={autoPlan.isPending}
      className="btn-luxe btn-luxe--primary"
    >
      <Sparkles className="h-4 w-4" />
      {autoPlan.isPending ? "Auto-plannen..." : "Auto-plan"}
    </button>
  );
}
