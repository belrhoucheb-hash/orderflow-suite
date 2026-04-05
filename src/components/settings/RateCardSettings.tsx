import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, ChevronDown, ChevronUp } from "lucide-react";
import { useRateCards, useCreateRateCard, useUpdateRateCard, useDeleteRateCard, useUpsertRateRules } from "@/hooks/useRateCards";
import { useTenant } from "@/contexts/TenantContext";
import type { RuleType } from "@/types/rateModels";
import { RULE_TYPES, RULE_TYPE_LABELS } from "@/types/rateModels";
import { LoadingState } from "@/components/ui/LoadingState";

interface RuleFormRow {
  rule_type: RuleType;
  transport_type: string;
  amount: string;
  min_amount: string;
  conditions: string; // JSON string
  sort_order: number;
}

function emptyRuleRow(sortOrder: number): RuleFormRow {
  return {
    rule_type: "VAST_BEDRAG",
    transport_type: "",
    amount: "",
    min_amount: "",
    conditions: "{}",
    sort_order: sortOrder,
  };
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
            conditions: JSON.stringify(r.conditions ?? {}),
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

  const handleRuleChange = (cardId: string, index: number, field: keyof RuleFormRow, value: string) => {
    setEditingRules((prev) => ({
      ...prev,
      [cardId]: (prev[cardId] ?? []).map((r, i) =>
        i === index ? { ...r, [field]: value } : r,
      ),
    }));
  };

  const handleSaveRules = async (cardId: string) => {
    const rows = editingRules[cardId] ?? [];
    const rules = rows.map((r, i) => {
      let conditions = {};
      try {
        conditions = JSON.parse(r.conditions);
      } catch {
        // keep empty
      }
      return {
        rate_card_id: cardId,
        rule_type: r.rule_type as RuleType,
        transport_type: r.transport_type || null,
        amount: parseFloat(r.amount) || 0,
        min_amount: r.min_amount ? parseFloat(r.min_amount) : null,
        conditions,
        sort_order: i,
      };
    });

    await upsertRules.mutateAsync({ rateCardId: cardId, rules });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Standaard Tariefkaarten</CardTitle>
          <CardDescription>
            Beheer standaard tariefkaarten die gelden voor alle klanten zonder specifieke tarieven.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create new */}
          <div className="flex gap-2">
            <Input
              placeholder="Naam nieuwe tariefkaart..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateCard()}
            />
            <Button onClick={handleCreateCard} disabled={!newName.trim()}>
              <Plus className="h-4 w-4 mr-1" /> Toevoegen
            </Button>
          </div>

          {/* List */}
          {defaultCards.map((card) => (
            <div key={card.id} className="border rounded-lg">
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                onClick={() => handleToggleExpand(card.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{card.name}</span>
                  <Badge variant={card.is_active ? "default" : "secondary"}>
                    {card.is_active ? "Actief" : "Inactief"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {(card.rate_rules ?? []).length} regels
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      updateRateCard.mutateAsync({
                        id: card.id,
                        updates: { is_active: !card.is_active },
                      });
                    }}
                  >
                    {card.is_active ? "Deactiveer" : "Activeer"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Weet u zeker dat u deze tariefkaart wilt verwijderen?")) {
                        deleteRateCard.mutateAsync(card.id);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  {expandedCard === card.id ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </div>
              </div>

              {expandedCard === card.id && (
                <div className="border-t p-4 space-y-3">
                  {(editingRules[card.id] ?? []).map((rule, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-3">
                        {idx === 0 && <Label className="text-xs mb-1">Type</Label>}
                        <Select
                          value={rule.rule_type}
                          onValueChange={(v) => handleRuleChange(card.id, idx, "rule_type", v)}
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
                        {idx === 0 && <Label className="text-xs mb-1">Bedrag</Label>}
                        <Input
                          type="number"
                          step="0.01"
                          value={rule.amount}
                          onChange={(e) => handleRuleChange(card.id, idx, "amount", e.target.value)}
                          placeholder="0.00"
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <Label className="text-xs mb-1">Min. bedrag</Label>}
                        <Input
                          type="number"
                          step="0.01"
                          value={rule.min_amount}
                          onChange={(e) => handleRuleChange(card.id, idx, "min_amount", e.target.value)}
                          placeholder="Geen"
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <Label className="text-xs mb-1">Transporttype</Label>}
                        <Input
                          value={rule.transport_type}
                          onChange={(e) => handleRuleChange(card.id, idx, "transport_type", e.target.value)}
                          placeholder="Alle"
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        {idx === 0 && <Label className="text-xs mb-1">Condities (JSON)</Label>}
                        <Input
                          value={rule.conditions}
                          onChange={(e) => handleRuleChange(card.id, idx, "conditions", e.target.value)}
                          placeholder="{}"
                          className="h-9 font-mono text-xs"
                        />
                      </div>
                      <div className="col-span-1">
                        {idx === 0 && <Label className="text-xs mb-1">&nbsp;</Label>}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 p-0"
                          onClick={() => handleRemoveRule(card.id, idx)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => handleAddRule(card.id)}>
                      <Plus className="h-4 w-4 mr-1" /> Regel toevoegen
                    </Button>
                    <Button size="sm" onClick={() => handleSaveRules(card.id)}>
                      <Save className="h-4 w-4 mr-1" /> Opslaan
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {defaultCards.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Geen standaard tariefkaarten. Maak er een aan met het formulier hierboven.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
