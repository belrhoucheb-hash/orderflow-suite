import { useState } from "react";
import { Activity, GraduationCap, Edit3, Settings, List, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/PageHeader";
import { AutonomyScoreCard } from "@/components/dashboard/AutonomyScoreCard";
import { DecisionFeed } from "@/components/dashboard/DecisionFeed";
import { LearningProgress } from "@/components/dashboard/LearningProgress";
import { CorrectionLog } from "@/components/dashboard/CorrectionLog";
import { AutonomyTrendChart } from "@/components/dashboard/AutonomyTrendChart";
import { useDecisionFeed } from "@/hooks/useAutonomyDashboard";
import { useTenantLearningStats } from "@/hooks/useAIFeedbackLoop";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { explainDecision } from "@/lib/decisionExplainability";
import { toast } from "sonner";
import type { DecisionType } from "@/types/confidence";

const ALL_MODULES: DecisionType[] = [
  "ORDER_INTAKE",
  "PLANNING",
  "DISPATCH",
  "PRICING",
  "INVOICING",
  "CONSOLIDATION",
];

const MODULE_LABELS: Record<DecisionType, string> = {
  ORDER_INTAKE: "Order Intake",
  PLANNING: "Planning",
  DISPATCH: "Dispatch",
  PRICING: "Pricing",
  INVOICING: "Facturatie",
  CONSOLIDATION: "Consolidatie",
};

const RESOLUTION_COLORS: Record<string, string> = {
  AUTO_EXECUTED: "text-emerald-600",
  APPROVED: "text-blue-600",
  MODIFIED: "text-amber-600",
  REJECTED: "text-red-600",
  PENDING: "text-gray-500",
};

// ── Settings Tab ─────────────────────────────────────────────────

function ThresholdSettings() {
  const { tenant } = useTenant();
  const settings = (tenant?.settings as any)?.autonomy?.thresholds ?? {};

  const [thresholds, setThresholds] = useState<Record<DecisionType, number>>(() => {
    const defaults: Record<DecisionType, number> = {
      ORDER_INTAKE: 80,
      PLANNING: 80,
      DISPATCH: 80,
      PRICING: 85,
      INVOICING: 85,
      CONSOLIDATION: 80,
    };
    for (const mod of ALL_MODULES) {
      if (settings[mod] !== undefined) defaults[mod] = settings[mod];
    }
    return defaults;
  });

  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!tenant?.id) return;
    setSaving(true);
    try {
      const currentSettings = (tenant.settings as any) ?? {};
      const newSettings = {
        ...currentSettings,
        autonomy: {
          ...(currentSettings.autonomy ?? {}),
          thresholds,
        },
      };

      const { error } = await (supabase
        .from("tenants" as any)
        .update({ settings: newSettings })
        .eq("id", tenant.id) as any);

      if (error) throw error;
      toast.success("Drempelwaarden opgeslagen");
    } catch (err) {
      toast.error("Fout bij opslaan drempelwaarden");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Autonomie Drempelwaarden
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Stel per module in bij welk betrouwbaarheidspercentage het systeem autonoom mag handelen.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {ALL_MODULES.map((mod) => (
          <div key={mod} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{MODULE_LABELS[mod]}</span>
              <Badge variant="outline" className="tabular-nums">
                {thresholds[mod]}%
              </Badge>
            </div>
            <Slider
              value={[thresholds[mod]]}
              onValueChange={([val]) =>
                setThresholds((prev) => ({ ...prev, [mod]: val }))
              }
              min={50}
              max={99}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>50% (voorzichtig)</span>
              <span>99% (streng)</span>
            </div>
          </div>
        ))}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Opslaan..." : "Drempelwaarden opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Tenant Learning Overview ────────────────────────────────────

function TenantLearningOverview() {
  const { data: stats, isLoading } = useTenantLearningStats();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-20 bg-muted/30 rounded" />
        <div className="h-20 bg-muted/30 rounded" />
      </div>
    );
  }

  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nog geen leerdata beschikbaar
      </p>
    );
  }

  const DeltaIcon =
    stats.confidenceDelta > 0
      ? TrendingUp
      : stats.confidenceDelta < 0
        ? TrendingDown
        : Minus;
  const deltaColor =
    stats.confidenceDelta > 0
      ? "text-emerald-600"
      : stats.confidenceDelta < 0
        ? "text-red-600"
        : "text-muted-foreground";

  return (
    <div className="space-y-4">
      {/* Confidence trend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/20 border border-border/30 p-3">
          <p className="text-xs text-muted-foreground mb-1">Gem. confidence deze week</p>
          <p className="text-lg font-semibold tabular-nums">
            {Math.round(stats.avgConfidenceThisWeek)}%
          </p>
        </div>
        <div className="rounded-lg bg-muted/20 border border-border/30 p-3">
          <p className="text-xs text-muted-foreground mb-1">Gem. confidence vorige week</p>
          <p className="text-lg font-semibold tabular-nums">
            {Math.round(stats.avgConfidenceLastWeek)}%
          </p>
        </div>
        <div className="rounded-lg bg-muted/20 border border-border/30 p-3">
          <p className="text-xs text-muted-foreground mb-1">Verschil</p>
          <div className="flex items-center gap-1.5">
            <DeltaIcon className={`h-4 w-4 ${deltaColor}`} />
            <p className={`text-lg font-semibold tabular-nums ${deltaColor}`}>
              {stats.confidenceDelta > 0 ? "+" : ""}
              {stats.confidenceDelta}%
            </p>
          </div>
        </div>
      </div>

      {/* Top improving clients */}
      {stats.topImprovingClients.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Meest verbeterde klanten</h4>
          <div className="space-y-1.5">
            {stats.topImprovingClients.map((c) => (
              <div
                key={c.clientId}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/20 border border-border/30"
              >
                <span className="text-sm truncate">{c.clientName}</span>
                <span
                  className={`text-sm font-medium tabular-nums ${c.delta > 0 ? "text-emerald-600" : c.delta < 0 ? "text-red-600" : "text-muted-foreground"}`}
                >
                  {c.delta > 0 ? "+" : ""}
                  {c.delta}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Most corrected fields */}
      {stats.mostCorrectedFields.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Meest gecorrigeerde velden
          </h4>
          <div className="flex flex-wrap gap-2">
            {stats.mostCorrectedFields.map((f) => (
              <Badge key={f.field} variant="outline" className="text-xs">
                {f.field} ({f.count}x)
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Full Decision Table ──────────────────────────────────────────

function DecisionTable() {
  const { data: decisions, isLoading } = useDecisionFeed(100);
  const [typeFilter, setTypeFilter] = useState<DecisionType | "all">("all");
  const [resolutionFilter, setResolutionFilter] = useState<string>("all");

  const filtered = (decisions ?? []).filter((d) => {
    if (typeFilter !== "all" && d.decision_type !== typeFilter) return false;
    if (resolutionFilter !== "all" && d.resolution !== resolutionFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as DecisionType | "all")}
        >
          <option value="all">Alle types</option>
          {ALL_MODULES.map((mod) => (
            <option key={mod} value={mod}>
              {MODULE_LABELS[mod]}
            </option>
          ))}
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={resolutionFilter}
          onChange={(e) => setResolutionFilter(e.target.value)}
        >
          <option value="all">Alle resoluties</option>
          <option value="AUTO_EXECUTED">Autonoom</option>
          <option value="APPROVED">Goedgekeurd</option>
          <option value="MODIFIED">Aangepast</option>
          <option value="REJECTED">Afgewezen</option>
          <option value="PENDING">Wachtend</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 bg-muted/30 rounded" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/30 bg-muted/20">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Actie</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Resolutie</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Confidence</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">Datum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.map((d) => (
                <tr key={d.id} className="hover:bg-muted/10 align-top">
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {MODULE_LABELS[d.decision_type] ?? d.decision_type}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-foreground max-w-[420px]">
                    {(() => {
                      const explanation = explainDecision(d);
                      return (
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">{explanation.summary}</p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {explanation.reason}
                          </p>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`font-medium ${RESOLUTION_COLORS[d.resolution] ?? ""}`}>
                      {d.resolution}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {(() => {
                      const explanation = explainDecision(d);
                      return (
                        <div className="space-y-1">
                          <div className="tabular-nums">{Math.round(d.input_confidence)}%</div>
                          <div className="text-[10px] text-muted-foreground">
                            {explanation.confidenceLabel}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                    {new Date(d.created_at).toLocaleDateString("nl-NL", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                    Geen beslissingen gevonden
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────

const Autonomie = () => {
  return (
    <div className="page-container">
      <PageHeader
        title="AI Autonomie"
        subtitle="Inzicht in hoe het systeem leert en zelfstandig beslissingen neemt"
      />

      {/* Top: Score Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-1">
          <AutonomyScoreCard />
        </div>
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Trend (8 weken)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AutonomyTrendChart weeks={8} height={220} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Overzicht
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-1.5">
            <List className="h-3.5 w-3.5" /> Beslissingen
          </TabsTrigger>
          <TabsTrigger value="learning" className="gap-1.5">
            <GraduationCap className="h-3.5 w-3.5" /> Leerproces
          </TabsTrigger>
          <TabsTrigger value="corrections" className="gap-1.5">
            <Edit3 className="h-3.5 w-3.5" /> Correcties
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings className="h-3.5 w-3.5" /> Instellingen
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Recente Beslissingen</CardTitle>
              </CardHeader>
              <CardContent>
                <DecisionFeed limit={15} maxHeight="350px" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Correcties (7 dagen)</CardTitle>
              </CardHeader>
              <CardContent>
                <CorrectionLog days={7} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Decisions Tab */}
        <TabsContent value="decisions">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Alle Beslissingen</CardTitle>
            </CardHeader>
            <CardContent>
              <DecisionTable />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Learning Tab */}
        <TabsContent value="learning">
          <div className="space-y-4">
            {/* Tenant-wide learning stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  Leervoortgang
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Hoe de AI-nauwkeurigheid evolueert over tijd
                </p>
              </CardHeader>
              <CardContent>
                <TenantLearningOverview />
              </CardContent>
            </Card>

            {/* Per-client progress */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-muted-foreground" />
                  Leerproces per klant
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Hoe snel het systeem per klant leert en zelfstandig wordt
                </p>
              </CardHeader>
              <CardContent>
                <LearningProgress />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Corrections Tab */}
        <TabsContent value="corrections">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Edit3 className="h-4 w-4 text-muted-foreground" />
                Planner Correcties
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Waar heeft de planner de AI-voorstellen aangepast?
              </p>
            </CardHeader>
            <CardContent>
              <CorrectionLog days={30} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <div className="max-w-xl">
            <ThresholdSettings />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Autonomie;
