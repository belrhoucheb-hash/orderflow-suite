import { useState } from "react";
import {
  useRateCards,
  useCreateRateCard,
  useUpdateRateCard,
  useDeleteRateCard,
  useUpsertRateRules,
} from "@/hooks/useRateCards";
import { useTenant } from "@/contexts/TenantContext";
import {
  RULE_TYPES,
  RULE_TYPE_LABELS,
  type RuleType,
  type RateRule,
} from "@/types/rateModels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, Plus, Trash2, Save } from "lucide-react";

type DraftRule = Omit<RateRule, "id" | "created_at">;

function emptyRule(rateCardId: string, idx: number): DraftRule {
  return {
    rate_card_id: rateCardId,
    rule_type: "PER_KM",
    transport_type: null,
    amount: 0,
    min_amount: null,
    conditions: {},
    sort_order: idx,
  };
}

interface RuleEditorProps {
  rateCardId: string;
  initialRules: RateRule[];
}

function RuleEditor({ rateCardId, initialRules }: RuleEditorProps) {
  const upsert = useUpsertRateRules();
  const [rules, setRules] = useState<DraftRule[]>(() =>
    initialRules.length > 0
      ? initialRules.map(({ id: _id, created_at: _ca, ...rest }) => rest)
      : []
  );

  const updateRule = (idx: number, field: keyof DraftRule, value: unknown) => {
    setRules((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const addRule = () => {
    setRules((prev) => [...prev, emptyRule(rateCardId, prev.length)]);
  };

  const removeRule = (idx: number) => {
    setRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    upsert.mutate({ rateCardId, rules });
  };

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Tariefregels
      </p>

      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground">Geen regels. Voeg er een toe.</p>
      )}

      {rules.map((rule, idx) => (
        <div
          key={idx}
          className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-end border border-border/40 rounded-lg p-3 bg-muted/20"
        >
          {/* Rule type */}
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select
              value={rule.rule_type}
              onValueChange={(v) => updateRule(idx, "rule_type", v as RuleType)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map((rt) => (
                  <SelectItem key={rt} value={rt} className="text-xs">
                    {RULE_TYPE_LABELS[rt]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <Label className="text-xs">Bedrag (EUR)</Label>
            <Input
              type="number"
              step="0.01"
              className="h-8 text-xs"
              value={rule.amount}
              onChange={(e) => updateRule(idx, "amount", parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* Min amount */}
          <div className="space-y-1">
            <Label className="text-xs">Min bedrag</Label>
            <Input
              type="number"
              step="0.01"
              className="h-8 text-xs"
              placeholder="—"
              value={rule.min_amount ?? ""}
              onChange={(e) =>
                updateRule(idx, "min_amount", e.target.value ? parseFloat(e.target.value) : null)
              }
            />
          </div>

          {/* Transport type */}
          <div className="space-y-1">
            <Label className="text-xs">Transporttype</Label>
            <Input
              className="h-8 text-xs"
              placeholder="bijv. FTL"
              value={rule.transport_type ?? ""}
              onChange={(e) =>
                updateRule(idx, "transport_type", e.target.value || null)
              }
            />
          </div>

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => removeRule(idx)}
            type="button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={addRule}
          type="button"
        >
          <Plus className="h-3.5 w-3.5" />
          Regel toevoegen
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={handleSave}
          disabled={upsert.isPending}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          {upsert.isPending ? "Opslaan..." : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}

export function RateCardSettings() {
  const { tenant } = useTenant();
  const { data: rateCards, isLoading } = useRateCards({ clientId: null, activeOnly: false });
  const createCard = useCreateRateCard();
  const updateCard = useUpdateRateCard();
  const deleteCard = useDeleteRateCard();

  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleCreate = () => {
    if (!newName.trim() || !tenant?.id) return;
    createCard.mutate(
      { tenant_id: tenant.id, name: newName.trim() },
      { onSuccess: () => setNewName("") }
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const toggleActive = (id: string, current: boolean) => {
    updateCard.mutate({ id, updates: { is_active: !current } });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Tariefkaart verwijderen? Dit kan niet ongedaan worden gemaakt.")) return;
    deleteCard.mutate(id);
  };

  return (
    <Card className="rounded-2xl border-border/40">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-semibold">Tariefkaarten</CardTitle>
        <p className="text-xs text-muted-foreground">
          Standaard tariefkaarten (zonder gekoppelde klant) die gelden als basis voor alle ritten.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Create form */}
        <div className="flex gap-2">
          <Input
            className="h-9 text-sm flex-1"
            placeholder="Naam nieuwe tariefkaart..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <Button
            size="sm"
            className="h-9 gap-1"
            onClick={handleCreate}
            disabled={!newName.trim() || createCard.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            Aanmaken
          </Button>
        </div>

        {/* List */}
        {isLoading && (
          <div className="py-6 text-center text-sm text-muted-foreground">Laden...</div>
        )}

        {!isLoading && (!rateCards || rateCards.length === 0) && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Geen tariefkaarten gevonden.
          </div>
        )}

        {rateCards?.map((card) => {
          const isExpanded = expandedId === card.id;
          const ruleCount = card.rate_rules?.length ?? 0;

          return (
            <div
              key={card.id}
              className="border border-border/40 rounded-xl overflow-hidden"
            >
              {/* Header row */}
              <div className="flex items-center gap-3 p-3 bg-muted/10">
                <button
                  type="button"
                  className="flex items-center gap-2 flex-1 text-left"
                  onClick={() => toggleExpand(card.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium">{card.name}</span>
                  <Badge
                    variant={card.is_active ? "default" : "secondary"}
                    className="text-[10px] h-4 px-1.5"
                  >
                    {card.is_active ? "Actief" : "Inactief"}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-auto mr-2">
                    {ruleCount} regel{ruleCount !== 1 ? "s" : ""}
                  </span>
                </button>

                {/* Activate toggle */}
                <Switch
                  checked={card.is_active}
                  onCheckedChange={() => toggleActive(card.id, card.is_active)}
                  aria-label="Activeren/deactiveren"
                />

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(card.id)}
                  type="button"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Expanded rule editor */}
              {isExpanded && (
                <div className="p-4 border-t border-border/40 bg-background">
                  <RuleEditor
                    rateCardId={card.id}
                    initialRules={card.rate_rules ?? []}
                  />
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
