/**
 * F5: PackagingRegistration
 * Shown inside TripFlow stop cards.
 * Multi-item batch registration: type selector from loading_units, direction UIT/IN, quantity.
 */
import { useState } from "react";
import { Package, Plus, Trash2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLoadingUnits, useCreatePackagingMovement } from "@/hooks/usePackaging";
import type { PackagingDirection } from "@/types/f5";
import { useTenant } from "@/contexts/TenantContext";

interface PackagingItem {
  loading_unit_id: string;
  direction: PackagingDirection;
  quantity: number;
}

interface Props {
  clientId: string;
  orderId?: string;
  tripStopId?: string;
  onClose?: () => void;
}

const DIRECTION_OPTIONS: { value: PackagingDirection; label: string; color: string }[] = [
  { value: "UIT", label: "Uitgegeven (UIT)", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "IN", label: "Ontvangen (IN)", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export function PackagingRegistration({ clientId, orderId, tripStopId, onClose }: Props) {
  const { tenant } = useTenant();
  const { data: loadingUnits = [], isLoading: unitsLoading } = useLoadingUnits();
  const createMovement = useCreatePackagingMovement();

  const [items, setItems] = useState<PackagingItem[]>([
    { loading_unit_id: "", direction: "UIT", quantity: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const updateItem = (idx: number, patch: Partial<PackagingItem>) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { loading_unit_id: "", direction: "UIT", quantity: 1 }]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!tenant?.id) { toast.error("Geen tenant gevonden"); return; }
    const valid = items.filter((i) => i.loading_unit_id && i.quantity > 0);
    if (valid.length === 0) { toast.error("Voeg minimaal één geldig item toe"); return; }

    setSubmitting(true);
    try {
      for (const item of valid) {
        await createMovement.mutateAsync({
          tenant_id: tenant.id,
          client_id: clientId,
          order_id: orderId ?? null,
          trip_stop_id: tripStopId ?? null,
          loading_unit_id: item.loading_unit_id,
          direction: item.direction,
          quantity: item.quantity,
        });
      }
      toast.success(`${valid.length} emballage beweging(en) geregistreerd`);
      onClose?.();
    } catch (e: any) {
      toast.error(e.message ?? "Fout bij registreren");
    } finally {
      setSubmitting(false);
    }
  };

  if (unitsLoading) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">Laadeenheden laden...</div>
    );
  }

  if (loadingUnits.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400">
        Geen laadeenheden beschikbaar
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <Package className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-gray-800">Emballage registreren</span>
      </div>

      {/* Item rows */}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
            {/* Loading unit selector */}
            <Select
              value={item.loading_unit_id}
              onValueChange={(v) => updateItem(idx, { loading_unit_id: v })}
            >
              <SelectTrigger className="h-10 text-sm">
                <SelectValue placeholder="Type..." />
              </SelectTrigger>
              <SelectContent>
                {loadingUnits.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Direction */}
            <Select
              value={item.direction}
              onValueChange={(v) => updateItem(idx, { direction: v as PackagingDirection })}
            >
              <SelectTrigger className="h-10 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Quantity */}
            <Input
              type="number"
              min={1}
              value={item.quantity}
              onChange={(e) => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
              className="h-10 w-16 text-sm text-center tabular-nums"
            />

            {/* Remove */}
            {items.length > 1 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-destructive hover:bg-destructive/10"
                onClick={() => removeItem(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Summary row */}
      <div className="flex items-center justify-between pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-primary gap-1"
          onClick={addItem}
        >
          <Plus className="h-3.5 w-3.5" />
          Regel toevoegen
        </Button>
        <div className="flex gap-2">
          {onClose && (
            <Button variant="outline" size="sm" className="h-9 text-sm" onClick={onClose}>
              Annuleren
            </Button>
          )}
          <Button
            size="sm"
            className="h-9 text-sm gap-1.5 bg-primary hover:bg-primary/90"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? "Opslaan..." : "Registreren"}
          </Button>
        </div>
      </div>
    </div>
  );
}
