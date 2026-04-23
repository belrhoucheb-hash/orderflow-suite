import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Settings2 } from "lucide-react";
import { useSurcharges, useCreateSurcharge, useUpdateSurcharge, useDeleteSurcharge } from "@/hooks/useSurcharges";
import { useTenant } from "@/contexts/TenantContext";
import type { SurchargeType } from "@/types/rateModels";
import { SURCHARGE_TYPES, SURCHARGE_TYPE_LABELS } from "@/types/rateModels";
import { LoadingState } from "@/components/ui/LoadingState";

/**
 * Maakt de JSONB-applies_to leesbaar als badge-rij. Bekende keys
 * (requirements, purpose, diesel_included, weekend) krijgen een NL-label.
 */
function appliesToBadges(applies: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(applies ?? {})) {
    if (key === "requirements" && Array.isArray(value)) {
      out.push(`Vereisten: ${value.join(", ")}`);
    } else if (key === "purpose" && typeof value === "string") {
      out.push(value === "screening" ? "Doel: screening" : `Doel: ${value}`);
    } else if (key === "diesel_included") {
      out.push(value === true ? "Diesel inbegrepen" : value === false ? "Zonder diesel" : `diesel=${String(value)}`);
    } else if (key === "weekend") {
      if (value === true) out.push("Alleen weekend");
    } else {
      out.push(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }
  return out;
}

export function SurchargeSettings() {
  const { tenant } = useTenant();
  const { data: surcharges, isLoading } = useSurcharges(false);
  const createSurcharge = useCreateSurcharge();
  const updateSurcharge = useUpdateSurcharge();
  const deleteSurcharge = useDeleteSurcharge();

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<SurchargeType>("PERCENTAGE");
  const [newAmount, setNewAmount] = useState("");
  const [newAppliesTo, setNewAppliesTo] = useState<Record<string, unknown>>({});
  const [conditionsOpen, setConditionsOpen] = useState(false);

  if (isLoading) return <LoadingState message="Toeslagen laden..." />;

  const handleCreate = async () => {
    if (!newName.trim() || !newAmount || !tenant?.id) return;
    await createSurcharge.mutateAsync({
      tenant_id: tenant.id,
      name: newName.trim(),
      surcharge_type: newType,
      amount: parseFloat(newAmount),
      applies_to: newAppliesTo,
    });
    setNewName("");
    setNewAmount("");
    setNewAppliesTo({});
  };

  return (
    <div className="card--luxe p-6 space-y-4">
      <div>
        <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
          Toeslagen
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Beheer automatische toeslagen zoals diesel, weekend, ADR, koeling en wachttijd.
        </p>
      </div>

      {/* Create new */}
      <div className="grid grid-cols-12 gap-2 items-end">
        <div className="col-span-3 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Naam</Label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Bijv. Dieseltoeslag"
            className="h-9"
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Type</Label>
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
        <div className="col-span-2 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Bedrag</Label>
          <Input
            type="number"
            step="0.01"
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            placeholder="0,00"
            className="h-9"
          />
        </div>
        <div className="col-span-3 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Condities</Label>
          <button
            type="button"
            onClick={() => setConditionsOpen(true)}
            className="h-9 w-full inline-flex items-center justify-between gap-1 px-2 rounded-md border border-input bg-background hover:bg-[hsl(var(--gold-soft)/0.3)] hover:border-[hsl(var(--gold)/0.4)] transition-colors text-left"
          >
            <span className="flex flex-wrap gap-1 flex-1 min-w-0 overflow-hidden">
              {appliesToBadges(newAppliesTo).length === 0 ? (
                <span className="text-xs text-muted-foreground">Alle orders</span>
              ) : (
                appliesToBadges(newAppliesTo).map((b, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.4)] text-[hsl(var(--gold-deep))] text-[11px] whitespace-nowrap"
                  >
                    {b}
                  </span>
                ))
              )}
            </span>
            <Settings2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
          </button>
        </div>
        <div className="col-span-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!newName.trim() || !newAmount}
            className="btn-luxe btn-luxe--primary !h-9 w-full"
          >
            <Plus className="h-4 w-4" /> Toevoegen
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {(surcharges ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between p-3 rounded-lg border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.12)]"
          >
            <div className="flex items-center gap-3 flex-wrap">
              <Switch
                checked={s.is_active}
                onCheckedChange={(checked) =>
                  updateSurcharge.mutateAsync({ id: s.id, updates: { is_active: checked } })
                }
              />
              <div>
                <span className="font-medium text-foreground">{s.name}</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {SURCHARGE_TYPE_LABELS[s.surcharge_type]}, {s.amount}
                  {s.surcharge_type === "PERCENTAGE" ? "%" : " EUR"}
                </span>
              </div>
              {appliesToBadges(s.applies_to as Record<string, unknown>).map((b, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.4)] text-[hsl(var(--gold-deep))] text-[11px]"
                >
                  {b}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                if (confirm("Weet je zeker dat je deze toeslag wilt verwijderen?")) {
                  deleteSurcharge.mutateAsync(s.id);
                }
              }}
              aria-label="Toeslag verwijderen"
              className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        ))}
      </div>

      {(surcharges ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Geen toeslagen geconfigureerd. Voeg er een toe met het formulier hierboven.
        </p>
      )}

      <AppliesToDialog
        open={conditionsOpen}
        onOpenChange={setConditionsOpen}
        value={newAppliesTo}
        onSave={(next) => { setNewAppliesTo(next); setConditionsOpen(false); }}
      />
    </div>
  );
}

function AppliesToDialog({
  open,
  onOpenChange,
  value,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => void;
}) {
  const [requirements, setRequirements] = useState<string>("");
  const [purpose, setPurpose] = useState<string>("");
  const [diesel, setDiesel] = useState<"any" | "true" | "false">("any");
  const [weekend, setWeekend] = useState<boolean>(false);
  const [advancedJson, setAdvancedJson] = useState<string>("{}");
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const reqs = Array.isArray(value.requirements) ? (value.requirements as string[]).join(", ") : "";
    const prp = typeof value.purpose === "string" ? value.purpose : "";
    const dsl: "any" | "true" | "false" =
      value.diesel_included === true ? "true" : value.diesel_included === false ? "false" : "any";
    const wk = value.weekend === true;
    const rest: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (["requirements", "purpose", "diesel_included", "weekend"].includes(k)) continue;
      rest[k] = v;
    }
    setRequirements(reqs);
    setPurpose(prp);
    setDiesel(dsl);
    setWeekend(wk);
    setAdvancedJson(Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : "{}");
    setAdvancedError(null);
  }, [open, value]);

  const save = () => {
    const next: Record<string, unknown> = {};
    if (advancedJson.trim() && advancedJson.trim() !== "{}") {
      try {
        const parsed = JSON.parse(advancedJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          Object.assign(next, parsed);
        }
      } catch {
        setAdvancedError("Ongeldige JSON in geavanceerd-veld");
        return;
      }
    }
    const reqs = requirements
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (reqs.length > 0) next.requirements = reqs;
    else delete next.requirements;

    if (purpose.trim()) next.purpose = purpose.trim();
    else delete next.purpose;

    if (diesel === "true") next.diesel_included = true;
    else if (diesel === "false") next.diesel_included = false;
    else delete next.diesel_included;

    if (weekend) next.weekend = true;
    else delete next.weekend;

    onSave(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Condities bewerken</DialogTitle>
          <DialogDescription>
            Bepaal wanneer deze toeslag automatisch wordt toegepast. Laat velden leeg om op alle orders te matchen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vereisten (komma-gescheiden)</Label>
            <Input
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="bv. ADR, koeling"
            />
            <p className="text-[11px] text-muted-foreground">Toeslag geldt alleen als de order minstens een van deze vereisten heeft.</p>
          </div>

          <div className="space-y-1.5">
            <Label>Doel</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="bv. screening (leeg = alle)"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Diesel</Label>
            <Select value={diesel} onValueChange={(v) => setDiesel(v as typeof diesel)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Niet van toepassing</SelectItem>
                <SelectItem value="true">Alleen als diesel inbegrepen is</SelectItem>
                <SelectItem value="false">Alleen zonder diesel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.15)] p-3">
            <div className="space-y-0.5 pr-4">
              <Label>Alleen weekend</Label>
              <p className="text-[11px] text-muted-foreground">Toeslag geldt alleen voor orders op zaterdag of zondag.</p>
            </div>
            <Switch checked={weekend} onCheckedChange={setWeekend} />
          </div>

          <details className="rounded-md border border-[hsl(var(--gold)/0.15)]">
            <summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-wide text-[hsl(var(--gold-deep))] font-semibold">
              Geavanceerd (JSON)
            </summary>
            <div className="p-3 pt-0 space-y-1.5">
              <textarea
                value={advancedJson}
                onChange={(e) => { setAdvancedJson(e.target.value); setAdvancedError(null); }}
                rows={4}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono"
                placeholder='{"eigen_key":"waarde"}'
              />
              {advancedError && <p className="text-xs text-destructive">{advancedError}</p>}
              <p className="text-[11px] text-muted-foreground">Structured velden overschrijven deze JSON bij opslaan.</p>
            </div>
          </details>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground hover:text-foreground px-3 h-9 rounded-md transition-colors"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={save}
            className="btn-luxe btn-luxe--primary !h-9"
          >
            Opslaan
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
