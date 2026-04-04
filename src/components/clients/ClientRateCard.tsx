import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Save, FileText } from "lucide-react";
import { useRateCards, useCreateRateCard, useUpsertRateRules, useDeleteRateCard } from "@/hooks/useRateCards";
import { useTenant } from "@/contexts/TenantContext";
import type { RuleType, RateRule } from "@/types/rateModels";
import { RULE_TYPES, RULE_TYPE_LABELS } from "@/types/rateModels";

interface ClientRateCardProps {
  clientId: string;
  clientName: string;
}

interface RuleFormRow {
  rule_type: RuleType;
  transport_type: string;
  amount: string;
  min_amount: string;
  conditions: string;
  sort_order: number;
}

export function ClientRateCard({ clientId, clientName }: ClientRateCardProps) {
  const { tenant } = useTenant();
  const { data: rateCards, isLoading } = useRateCards({ clientId, activeOnly: false });
  const createRateCard = useCreateRateCard();
  const upsertRules = useUpsertRateRules();
  const deleteRateCard = useDeleteRateCard();

  const [editingRules, setEditingRules] = useState<Record<string, RuleFormRow[]>>({});

  if (isLoading) return <p className="text-sm text-muted-foreground">Tarieven laden...</p>;

  const cards = rateCards ?? [];
  const activeCard = cards.find((c) => c.is_active);

  const handleCreateCard = async () => {
    if (!tenant?.id) return;
    await createRateCard.mutateAsync({ tenant_id: tenant.id, client_id: clientId, name: `Tarief ${clientName}` });
  };

  const initRules = (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (card && !editingRules[cardId]) {
      setEditingRules((prev) => ({
        ...prev,
        [cardId]: (card.rate_rules ?? []).map((r, i) => ({
          rule_type: r.rule_type, transport_type: r.transport_type ?? "",
          amount: String(r.amount), min_amount: r.min_amount != null ? String(r.min_amount) : "",
          conditions: JSON.stringify(r.conditions ?? {}), sort_order: i,
        })),
      }));
    }
  };

  const handleAddRule = (cardId: string) => {
    initRules(cardId);
    setEditingRules((prev) => ({
      ...prev,
      [cardId]: [...(prev[cardId] ?? []), { rule_type: "VAST_BEDRAG" as RuleType, transport_type: "", amount: "", min_amount: "", conditions: "{}", sort_order: (prev[cardId] ?? []).length }],
    }));
  };

  const handleRemoveRule = (cardId: string, index: number) => {
    setEditingRules((prev) => ({ ...prev, [cardId]: (prev[cardId] ?? []).filter((_, i) => i !== index) }));
  };

  const handleRuleChange = (cardId: string, index: number, field: keyof RuleFormRow, value: string) => {
    setEditingRules((prev) => ({
      ...prev, [cardId]: (prev[cardId] ?? []).map((r, i) => i === index ? { ...r, [field]: value } : r),
    }));
  };

  const handleSaveRules = async (cardId: string) => {
    const rows = editingRules[cardId] ?? [];
    const rules: Omit<RateRule, "id" | "created_at">[] = rows.map((r, i) => {
      let conditions = {};
      try { conditions = JSON.parse(r.conditions); } catch { /* empty */ }
      return { rate_card_id: cardId, rule_type: r.rule_type as RuleType, transport_type: r.transport_type || null,
        amount: parseFloat(r.amount) || 0, min_amount: r.min_amount ? parseFloat(r.min_amount) : null, conditions, sort_order: i };
    });
    await upsertRules.mutateAsync({ rateCardId: cardId, rules });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5" />Klant Tarieven</CardTitle>
            <CardDescription>Specifieke tariefkaart voor {clientName}. Zonder klant-tariefkaart wordt het standaard tarief gebruikt.</CardDescription>
          </div>
          {!activeCard && <Button onClick={handleCreateCard}><Plus className="h-4 w-4 mr-1" /> Tariefkaart aanmaken</Button>}
        </div>
      </CardHeader>
      <CardContent>
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Geen klant-specifieke tariefkaart. Het standaard tarief wordt gebruikt.</p>
        ) : (
          cards.map((card) => {
            if (!editingRules[card.id]) initRules(card.id);
            const rows = editingRules[card.id] ?? [];
            return (
              <div key={card.id} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{card.name}</span>
                    <Badge variant={card.is_active ? "default" : "secondary"}>{card.is_active ? "Actief" : "Inactief"}</Badge>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { if (confirm("Tariefkaart verwijderen?")) deleteRateCard.mutateAsync(card.id); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {rows.map((rule, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-3">
                      {idx === 0 && <Label className="text-xs">Type</Label>}
                      <Select value={rule.rule_type} onValueChange={(v) => handleRuleChange(card.id, idx, "rule_type", v)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{RULE_TYPES.map((rt) => <SelectItem key={rt} value={rt}>{RULE_TYPE_LABELS[rt]}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">{idx === 0 && <Label className="text-xs">Bedrag</Label>}<Input type="number" step="0.01" value={rule.amount} onChange={(e) => handleRuleChange(card.id, idx, "amount", e.target.value)} className="h-9" /></div>
                    <div className="col-span-2">{idx === 0 && <Label className="text-xs">Min.</Label>}<Input type="number" step="0.01" value={rule.min_amount} onChange={(e) => handleRuleChange(card.id, idx, "min_amount", e.target.value)} className="h-9" placeholder="Geen" /></div>
                    <div className="col-span-2">{idx === 0 && <Label className="text-xs">Transport</Label>}<Input value={rule.transport_type} onChange={(e) => handleRuleChange(card.id, idx, "transport_type", e.target.value)} className="h-9" placeholder="Alle" /></div>
                    <div className="col-span-2">{idx === 0 && <Label className="text-xs">Condities</Label>}<Input value={rule.conditions} onChange={(e) => handleRuleChange(card.id, idx, "conditions", e.target.value)} className="h-9 font-mono text-xs" /></div>
                    <div className="col-span-1"><Button variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={() => handleRemoveRule(card.id, idx)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleAddRule(card.id)}><Plus className="h-4 w-4 mr-1" /> Regel</Button>
                  <Button size="sm" onClick={() => handleSaveRules(card.id)}><Save className="h-4 w-4 mr-1" /> Opslaan</Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
