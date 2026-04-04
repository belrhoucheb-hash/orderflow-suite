import { useState } from "react";
import {
  useSurcharges,
  useCreateSurcharge,
  useUpdateSurcharge,
  useDeleteSurcharge,
} from "@/hooks/useSurcharges";
import { useTenant } from "@/contexts/TenantContext";
import {
  SURCHARGE_TYPES,
  SURCHARGE_TYPE_LABELS,
  type SurchargeType,
} from "@/types/rateModels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";

export function SurchargeSettings() {
  const { tenant } = useTenant();
  const { data: surcharges, isLoading } = useSurcharges(false);
  const createSurcharge = useCreateSurcharge();
  const updateSurcharge = useUpdateSurcharge();
  const deleteSurcharge = useDeleteSurcharge();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<SurchargeType>("VAST_BEDRAG");
  const [newAmount, setNewAmount] = useState("");
  const [newConditions, setNewConditions] = useState("{}");

  const handleCreate = () => {
    if (!newName.trim() || !tenant?.id) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount)) return;

    let applies_to = {};
    try {
      applies_to = JSON.parse(newConditions);
    } catch {
      // ignore invalid JSON — use empty
    }

    createSurcharge.mutate(
      { tenant_id: tenant.id, name: newName.trim(), surcharge_type: newType, amount, applies_to },
      {
        onSuccess: () => {
          setNewName("");
          setNewAmount("");
          setNewConditions("{}");
        },
      }
    );
  };

  const toggleActive = (id: string, current: boolean) => {
    updateSurcharge.mutate({ id, updates: { is_active: !current } });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Toeslag verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    deleteSurcharge.mutate(id);
  };

  const formatAmount = (type: SurchargeType, amount: number): string => {
    if (type === "PERCENTAGE") return `${amount}%`;
    return `€\u00a0${amount.toFixed(2)}`;
  };

  const hasConditions = (conditions: Record<string, unknown>): boolean => {
    return Object.keys(conditions ?? {}).length > 0;
  };

  return (
    <Card className="rounded-2xl border-border/40">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Toeslagen</CardTitle>
        <p className="text-xs text-muted-foreground">
          Beheer toeslagen die automatisch worden toegepast op ritten op basis van condities.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Create form */}
        <div className="border border-border/40 rounded-xl p-4 bg-muted/10 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Nieuwe toeslag
          </p>

          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Naam</Label>
              <Input
                className="h-8 text-xs"
                placeholder="bijv. Brandstoftoeslag"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={newType}
                onValueChange={(v) => setNewType(v as SurchargeType)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SURCHARGE_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {SURCHARGE_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Bedrag</Label>
              <Input
                type="number"
                step="0.01"
                className="h-8 text-xs"
                placeholder={newType === "PERCENTAGE" ? "bijv. 5" : "bijv. 12.50"}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">
              Condities (JSON){" "}
              <span className="text-muted-foreground font-normal">optioneel</span>
            </Label>
            <Input
              className="h-8 text-xs font-mono"
              placeholder='{"transport_type": "FTL"}'
              value={newConditions}
              onChange={(e) => setNewConditions(e.target.value)}
            />
          </div>

          <Button
            size="sm"
            className="h-8 text-xs gap-1"
            onClick={handleCreate}
            disabled={!newName.trim() || !newAmount || createSurcharge.isPending}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Toeslag aanmaken
          </Button>
        </div>

        {/* List */}
        {isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">Laden...</div>
        )}

        {!isLoading && (!surcharges || surcharges.length === 0) && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Geen toeslagen gevonden.
          </div>
        )}

        {surcharges && surcharges.length > 0 && (
          <div className="border border-border/40 rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-4 py-2 bg-muted/30 border-b border-border/40">
              <span className="text-xs font-medium text-muted-foreground">Naam</span>
              <span className="text-xs font-medium text-muted-foreground w-28 text-center">Type</span>
              <span className="text-xs font-medium text-muted-foreground w-20 text-right">Bedrag</span>
              <span className="text-xs font-medium text-muted-foreground w-20 text-center">Status</span>
              <span className="text-xs font-medium text-muted-foreground w-8" />
            </div>

            {surcharges.map((surcharge, idx) => (
              <div
                key={surcharge.id}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-4 py-3 ${
                  idx < surcharges.length - 1 ? "border-b border-border/30" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{surcharge.name}</span>
                  {hasConditions(surcharge.applies_to as Record<string, unknown>) && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0">
                      condities
                    </Badge>
                  )}
                </div>

                <span className="text-xs text-muted-foreground w-28 text-center">
                  {SURCHARGE_TYPE_LABELS[surcharge.surcharge_type]}
                </span>

                <span className="text-xs font-mono w-20 text-right">
                  {formatAmount(surcharge.surcharge_type, surcharge.amount)}
                </span>

                <div className="flex items-center justify-center w-20">
                  <Switch
                    checked={surcharge.is_active}
                    onCheckedChange={() => toggleActive(surcharge.id, surcharge.is_active)}
                    aria-label="Activeren/deactiveren"
                  />
                </div>

                <div className="flex justify-end w-8">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(surcharge.id)}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
