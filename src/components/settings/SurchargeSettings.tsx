import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2 } from "lucide-react";
import { useSurcharges, useCreateSurcharge, useUpdateSurcharge, useDeleteSurcharge } from "@/hooks/useSurcharges";
import { useTenant } from "@/contexts/TenantContext";
import type { SurchargeType } from "@/types/rateModels";
import { SURCHARGE_TYPES, SURCHARGE_TYPE_LABELS } from "@/types/rateModels";
import { LoadingState } from "@/components/ui/LoadingState";

export function SurchargeSettings() {
  const { tenant } = useTenant();
  const { data: surcharges, isLoading } = useSurcharges(false);
  const createSurcharge = useCreateSurcharge();
  const updateSurcharge = useUpdateSurcharge();
  const deleteSurcharge = useDeleteSurcharge();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<SurchargeType>("PERCENTAGE");
  const [newAmount, setNewAmount] = useState("");
  const [newAppliesTo, setNewAppliesTo] = useState("{}");

  if (isLoading) return <LoadingState message="Toeslagen laden..." />;

  const handleCreate = async () => {
    if (!newName.trim() || !newAmount || !tenant?.id) return;
    let appliesTo = {};
    try {
      appliesTo = JSON.parse(newAppliesTo);
    } catch {
      // keep empty
    }
    await createSurcharge.mutateAsync({
      tenant_id: tenant.id,
      name: newName.trim(),
      surcharge_type: newType,
      amount: parseFloat(newAmount),
      applies_to: appliesTo,
    });
    setNewName("");
    setNewAmount("");
    setNewAppliesTo("{}");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Toeslagen</CardTitle>
        <CardDescription>
          Beheer automatische toeslagen zoals diesel, weekend, ADR, koeling en wachttijd.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create new */}
        <div className="grid grid-cols-12 gap-2 items-end">
          <div className="col-span-3">
            <Label className="text-xs">Naam</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Bijv. Dieseltoeslag"
              className="h-9"
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Type</Label>
            <Select value={newType} onValueChange={(v) => setNewType(v as SurchargeType)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SURCHARGE_TYPES.map((st) => (
                  <SelectItem key={st} value={st}>
                    {SURCHARGE_TYPE_LABELS[st]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Bedrag</Label>
            <Input
              type="number"
              step="0.01"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="0.00"
              className="h-9"
            />
          </div>
          <div className="col-span-3">
            <Label className="text-xs">Condities (JSON)</Label>
            <Input
              value={newAppliesTo}
              onChange={(e) => setNewAppliesTo(e.target.value)}
              placeholder='{"requirements":["ADR"]}'
              className="h-9 font-mono text-xs"
            />
          </div>
          <div className="col-span-2">
            <Button onClick={handleCreate} disabled={!newName.trim() || !newAmount} className="h-9 w-full">
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>
          </div>
        </div>

        {/* List */}
        <div className="space-y-2">
          {(surcharges ?? []).map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between p-3 border rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={s.is_active}
                  onCheckedChange={(checked) =>
                    updateSurcharge.mutateAsync({ id: s.id, updates: { is_active: checked } })
                  }
                />
                <div>
                  <span className="font-medium">{s.name}</span>
                  <span className="text-sm text-muted-foreground ml-2">
                    {SURCHARGE_TYPE_LABELS[s.surcharge_type]} — {s.amount}
                    {s.surcharge_type === "PERCENTAGE" ? "%" : " EUR"}
                  </span>
                </div>
                {Object.keys(s.applies_to).length > 0 && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {JSON.stringify(s.applies_to)}
                  </Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm("Weet u zeker dat u deze toeslag wilt verwijderen?")) {
                    deleteSurcharge.mutateAsync(s.id);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        {(surcharges ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Geen toeslagen geconfigureerd. Voeg er een toe met het formulier hierboven.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
