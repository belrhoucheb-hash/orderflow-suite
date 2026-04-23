import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2, Save, ChevronDown, ChevronUp, Settings2, HelpCircle, Coins } from "lucide-react";
import { useRateCards, useCreateRateCard, useUpdateRateCard, useDeleteRateCard, useUpsertRateRules } from "@/hooks/useRateCards";
import { RateCardAuditTrail } from "@/components/settings/RateCardAuditTrail";
import { useTenant } from "@/contexts/TenantContext";
import type { RuleType } from "@/types/rateModels";
import { RULE_TYPES, RULE_TYPE_LABELS } from "@/types/rateModels";
import { LoadingState } from "@/components/ui/LoadingState";

interface RuleFormRow {
  rule_type: RuleType;
  transport_type: string;
  amount: string;
  min_amount: string;
  conditions: Record<string, unknown>;
  sort_order: number;
}

function emptyRuleRow(sortOrder: number): RuleFormRow {
  return {
    rule_type: "VAST_BEDRAG",
    transport_type: "",
    amount: "",
    min_amount: "",
    conditions: {},
    sort_order: sortOrder,
  };
}

/**
 * Vertaalt een conditions-object naar een lijst lezbare badges.
 * Onbekende keys worden als key=value getoond zodat niets in het duister
 * verdwijnt, maar de veelgebruikte keys (diesel_included, purpose, optional)
 * krijgen een NL-label.
 */
function conditionsToBadges(conditions: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(conditions ?? {})) {
    if (key === "diesel_included") {
      out.push(value === true ? "Diesel inbegrepen" : value === false ? "Zonder diesel" : `diesel=${String(value)}`);
    } else if (key === "purpose" && typeof value === "string") {
      out.push(value === "screening" ? "Doel: screening" : `Doel: ${value}`);
    } else if (key === "optional") {
      if (value === true) out.push("Optioneel");
    } else {
      out.push(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`);
    }
  }
  return out;
}

export function RateCardSettings() {
  const { tenant } = useTenant();
  const { data: rateCards, isLoading } = useRateCards({ activeOnly: false });
  const createRateCard = useCreateRateCard();
  const updateRateCard = useUpdateRateCard();
  const deleteRateCard = useDeleteRateCard();
  const upsertRules = useUpsertRateRules();

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [editingRules, setEditingRules] = useState<Record<string, RuleFormRow[]>>({});
  const [conditionsEdit, setConditionsEdit] = useState<{ cardId: string; index: number } | null>(null);

  if (isLoading) return <LoadingState message="Tariefkaarten laden..." />;

  const defaultCards = (rateCards ?? []).filter((rc) => !rc.client_id);

  const handleCreateCard = async () => {
    if (!newName.trim() || !tenant?.id) return;
    await createRateCard.mutateAsync({
      tenant_id: tenant.id,
      name: newName.trim(),
      client_id: null,
    });
    setNewName("");
  };

  const handleToggleExpand = (cardId: string) => {
    if (expandedCard === cardId) {
      setExpandedCard(null);
    } else {
      setExpandedCard(cardId);
      const card = defaultCards.find((c) => c.id === cardId);
      if (card && !editingRules[cardId]) {
        setEditingRules((prev) => ({
          ...prev,
          [cardId]: (card.rate_rules ?? []).map((r, i) => ({
            rule_type: r.rule_type,
            transport_type: r.transport_type ?? "",
            amount: String(r.amount),
            min_amount: r.min_amount != null ? String(r.min_amount) : "",
            conditions: (r.conditions as Record<string, unknown>) ?? {},
            sort_order: i,
          })),
        }));
      }
    }
  };

  const handleAddRule = (cardId: string) => {
    setEditingRules((prev) => ({
      ...prev,
      [cardId]: [...(prev[cardId] ?? []), emptyRuleRow((prev[cardId] ?? []).length)],
    }));
  };

  const handleRemoveRule = (cardId: string, index: number) => {
    setEditingRules((prev) => ({
      ...prev,
      [cardId]: (prev[cardId] ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleRuleChange = <K extends keyof RuleFormRow>(cardId: string, index: number, field: K, value: RuleFormRow[K]) => {
    setEditingRules((prev) => ({
      ...prev,
      [cardId]: (prev[cardId] ?? []).map((r, i) =>
        i === index ? { ...r, [field]: value } : r,
      ),
    }));
  };

  const handleSaveRules = async (cardId: string) => {
    const rows = editingRules[cardId] ?? [];
    const rules = rows.map((r, i) => ({
      rate_card_id: cardId,
      rule_type: r.rule_type as RuleType,
      transport_type: r.transport_type || null,
      amount: parseFloat(r.amount) || 0,
      min_amount: r.min_amount ? parseFloat(r.min_amount) : null,
      conditions: r.conditions,
      sort_order: i,
    }));

    await upsertRules.mutateAsync({ rateCardId: cardId, rules });
  };

  const activeConditionsEdit =
    conditionsEdit && editingRules[conditionsEdit.cardId]?.[conditionsEdit.index];

  return (
    <div className="card--luxe p-6 space-y-4">
      <div>
        <p className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.16em]">
          Standaard tariefkaarten
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Beheer standaard tariefkaarten die gelden voor alle klanten zonder specifieke tarieven.
        </p>
      </div>

      {/* Create new */}
      <div className="flex gap-2">
        <Input
          placeholder="Naam nieuwe tariefkaart..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreateCard()}
          className="flex-1"
        />
        <button
          type="button"
          onClick={handleCreateCard}
          disabled={!newName.trim()}
          className="btn-luxe btn-luxe--primary !h-9"
        >
          <Plus className="h-4 w-4" /> Toevoegen
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {defaultCards.map((card) => (
          <div key={card.id} className="rounded-lg border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.12)]">
            <div
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-[hsl(var(--gold-soft)/0.25)] transition-colors rounded-t-lg"
              onClick={() => handleToggleExpand(card.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium text-foreground">{card.name}</span>
                <span
                  className={
                    card.is_active
                      ? "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase border border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.6)] text-[hsl(var(--gold-deep))]"
                      : "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase bg-muted text-muted-foreground"
                  }
                >
                  {card.is_active ? "Actief" : "Inactief"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(card.rate_rules ?? []).length} regels
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    updateRateCard.mutateAsync({
                      id: card.id,
                      updates: { is_active: !card.is_active },
                    });
                  }}
                  className="text-xs text-muted-foreground hover:text-[hsl(var(--gold-deep))] px-2 py-1 rounded transition-colors"
                >
                  {card.is_active ? "Deactiveer" : "Activeer"}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Weet je zeker dat je deze tariefkaart wilt verwijderen?")) {
                      deleteRateCard.mutateAsync(card.id);
                    }
                  }}
                  aria-label="Tariefkaart verwijderen"
                  className="h-7 w-7 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
                {expandedCard === card.id ? (
                  <ChevronUp className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
                )}
              </div>
            </div>

            {expandedCard === card.id && (
              <div className="border-t border-[hsl(var(--gold)/0.2)] p-4 space-y-3 bg-background rounded-b-lg">
                {(editingRules[card.id] ?? []).map((rule, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      {idx === 0 && <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Type</Label>}
                      <Select
                        value={rule.rule_type}
                        onValueChange={(v) => handleRuleChange(card.id, idx, "rule_type", v as RuleType)}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RULE_TYPES.map((rt) => (
                            <SelectItem key={rt} value={rt}>
                              {RULE_TYPE_LABELS[rt]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Bedrag</Label>}
                      <Input
                        type="number"
                        step="0.01"
                        value={rule.amount}
                        onChange={(e) => handleRuleChange(card.id, idx, "amount", e.target.value)}
                        placeholder="0,00"
                        className="h-9 tabular-nums text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && (
                        <LabelWithHelp
                          label="Min. bedrag"
                          help="Minimum tariefbedrag per rit. Als het berekende bedrag lager uitkomt, wordt dit minimum in rekening gebracht."
                        />
                      )}
                      <Input
                        type="number"
                        step="0.01"
                        value={rule.min_amount}
                        onChange={(e) => handleRuleChange(card.id, idx, "min_amount", e.target.value)}
                        placeholder="Geen"
                        className="h-9 tabular-nums text-right"
                      />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && <Label className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 block">Transporttype</Label>}
                      <Input
                        value={rule.transport_type}
                        onChange={(e) => handleRuleChange(card.id, idx, "transport_type", e.target.value)}
                        placeholder="Alle"
                        className="h-9"
                      />
                    </div>
                    <div className="col-span-2">
                      {idx === 0 && (
                        <LabelWithHelp
                          label="Condities"
                          help="Extra filters die bepalen wanneer deze regel van toepassing is (bv. wel/geen diesel inbegrepen, bepaald doel). Klik om te bewerken."
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => setConditionsEdit({ cardId: card.id, index: idx })}
                        className="h-9 w-full inline-flex items-center justify-between gap-1 px-2 rounded-md border border-input bg-background hover:bg-[hsl(var(--gold-soft)/0.3)] hover:border-[hsl(var(--gold)/0.4)] transition-colors text-left"
                      >
                        <span className="flex flex-wrap gap-1 flex-1 min-w-0 overflow-hidden">
                          {conditionsToBadges(rule.conditions).length === 0 ? (
                            <span className="text-xs text-muted-foreground">Geen</span>
                          ) : (
                            conditionsToBadges(rule.conditions).map((b, i) => (
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
                    <div className="col-span-1">
                      {idx === 0 && <Label className="text-[11px] mb-1.5 block">&nbsp;</Label>}
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(card.id, idx)}
                        aria-label="Regel verwijderen"
                        className="h-9 w-9 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleAddRule(card.id)}
                    className="btn-luxe !h-9"
                  >
                    <Plus className="h-4 w-4" /> Regel toevoegen
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveRules(card.id)}
                    className="btn-luxe btn-luxe--primary !h-9"
                  >
                    <Save className="h-4 w-4" /> Opslaan
                  </button>
                </div>

                <RateCardAuditTrail rateCardId={card.id} />
              </div>
            )}
          </div>
        ))}

        {defaultCards.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-lg border border-dashed border-[hsl(var(--gold)/0.3)] bg-[hsl(var(--gold-soft)/0.12)]">
            <div
              className="h-12 w-12 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)] mb-3"
              style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
            >
              <Coins className="h-5 w-5 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-foreground">Nog geen standaard-tariefkaart</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Een standaard-tariefkaart gebruiken we als er geen klant-specifiek tarief is. Geef hem een naam hierboven en voeg de eerste regel toe.
            </p>
          </div>
        )}
      </div>

      <ConditionsDialog
        open={conditionsEdit !== null}
        onOpenChange={(o) => { if (!o) setConditionsEdit(null); }}
        conditions={activeConditionsEdit?.conditions ?? {}}
        onSave={(next) => {
          if (!conditionsEdit) return;
          handleRuleChange(conditionsEdit.cardId, conditionsEdit.index, "conditions", next);
          setConditionsEdit(null);
        }}
      />
    </div>
  );
}

function ConditionsDialog({
  open,
  onOpenChange,
  conditions,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  conditions: Record<string, unknown>;
  onSave: (next: Record<string, unknown>) => void;
}) {
  const [diesel, setDiesel] = useState<"any" | "true" | "false">("any");
  const [purpose, setPurpose] = useState<string>("");
  const [optional, setOptional] = useState<boolean>(false);
  const [advancedJson, setAdvancedJson] = useState<string>("{}");
  const [advancedError, setAdvancedError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const init = initFromConditions(conditions);
    setDiesel(init.diesel);
    setPurpose(init.purpose);
    setOptional(init.optional);
    setAdvancedJson(init.json);
    setAdvancedError(null);
  }, [open, conditions]);

  const save = () => {
    const next: Record<string, unknown> = {};
    // Start met custom JSON-keys als die er zijn
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
    // Structured velden overschrijven de JSON-equivalenten, zodat UI bron van waarheid is
    if (diesel === "true") next.diesel_included = true;
    else if (diesel === "false") next.diesel_included = false;
    else delete next.diesel_included;

    if (purpose.trim()) next.purpose = purpose.trim();
    else delete next.purpose;

    if (optional) next.optional = true;
    else delete next.optional;

    onSave(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Condities bewerken</DialogTitle>
          <DialogDescription>
            Bepaal wanneer deze tariefregel van toepassing is. Laat een veld op "niet van toepassing" staan om op alle waarden te matchen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
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

          <div className="space-y-1.5">
            <Label>Doel</Label>
            <Input
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="bv. screening (leeg = alle)"
            />
            <p className="text-[11px] text-muted-foreground">Laat leeg om op alle doelen te matchen. Veelgebruikte waarde: screening.</p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.15)] p-3">
            <div className="space-y-0.5 pr-4">
              <Label>Optioneel</Label>
              <p className="text-[11px] text-muted-foreground">Deze regel matcht alleen als het doel expliciet in de order is aangevraagd.</p>
            </div>
            <Switch checked={optional} onCheckedChange={setOptional} />
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
              <p className="text-[11px] text-muted-foreground">Voor condities die niet in de bovenstaande velden staan. Structured velden overschrijven deze JSON bij opslaan.</p>
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

function LabelWithHelp({ label, help }: { label: string; help: string }) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`Uitleg over ${label}`} className="text-muted-foreground hover:text-[hsl(var(--gold-deep))] transition-colors">
              <HelpCircle className="h-3 w-3" strokeWidth={1.5} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
            {help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

function initFromConditions(conditions: Record<string, unknown>): {
  diesel: "any" | "true" | "false";
  purpose: string;
  optional: boolean;
  json: string;
} {
  const diesel =
    conditions.diesel_included === true
      ? "true"
      : conditions.diesel_included === false
      ? "false"
      : "any";
  const purpose = typeof conditions.purpose === "string" ? conditions.purpose : "";
  const optional = conditions.optional === true;
  // Rest (niet-bekende keys) in de advanced-JSON
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(conditions)) {
    if (k === "diesel_included" || k === "purpose" || k === "optional") continue;
    rest[k] = v;
  }
  const json = Object.keys(rest).length > 0 ? JSON.stringify(rest, null, 2) : "{}";
  return { diesel: diesel as "any" | "true" | "false", purpose, optional, json };
}
