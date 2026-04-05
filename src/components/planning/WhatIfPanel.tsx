import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Truck, Package, BarChart3 } from "lucide-react";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { Assignments } from "@/components/planning/types";
import type { GeoCoord } from "@/data/geoData";
import type { WhatIfResult } from "@/types/planning";
import { simulateVehicleRemoval } from "@/lib/rollingPlanner";
import { supabase } from "@/integrations/supabase/client";

interface WhatIfPanelProps {
  tenantId: string;
  date: string;
  vehicles: FleetVehicle[];
  assignments: Assignments;
  coordMap: Map<string, GeoCoord>;
}

export function WhatIfPanel({
  tenantId,
  date,
  vehicles,
  assignments,
  coordMap,
}: WhatIfPanelProps) {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  // Only show vehicles that have assigned orders
  const activeVehicles = vehicles.filter(
    (v) => assignments[v.id] && assignments[v.id].length > 0,
  );

  async function handleSimulate() {
    if (!selectedVehicleId) return;
    setLoading(true);
    try {
      const whatIf = await simulateVehicleRemoval(
        supabase,
        tenantId,
        selectedVehicleId,
        date,
        vehicles,
        coordMap,
      );
      setResult(whatIf);
    } catch (err) {
      console.error("What-if simulation failed:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" />
          Wat-als simulatie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Selecteer een voertuig om te zien wat er gebeurt als het wegvalt.
        </p>

        <div className="flex gap-2">
          <Select
            value={selectedVehicleId ?? ""}
            onValueChange={(val) => {
              setSelectedVehicleId(val);
              setResult(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Kies voertuig..." />
            </SelectTrigger>
            <SelectContent>
              {activeVehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  <span className="flex items-center gap-2">
                    <Truck className="h-3 w-3" />
                    {v.name} ({v.plate}) &mdash;{" "}
                    {assignments[v.id]?.length || 0} orders
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={handleSimulate}
            disabled={!selectedVehicleId || loading}
            variant="secondary"
          >
            {loading ? "Berekenen..." : "Simuleer"}
          </Button>
        </div>

        {result && (
          <div className="space-y-3 pt-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold">{result.affected_orders.length}</div>
                <div className="text-xs text-muted-foreground">Getroffen orders</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-green-600">
                  {result.reassigned_orders.length}
                </div>
                <div className="text-xs text-muted-foreground">Herverdeeld</div>
              </div>
              <div className="rounded-md border p-3 text-center">
                <div className="text-2xl font-bold text-red-600">
                  {result.unassignable_orders.length}
                </div>
                <div className="text-xs text-muted-foreground">Niet plaatsbaar</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Betrouwbaarheid:</span>
              <Badge
                variant={
                  result.confidence.score >= 70
                    ? "default"
                    : result.confidence.score >= 40
                      ? "secondary"
                      : "destructive"
                }
              >
                {result.confidence.score}%
              </Badge>
              <span className="text-xs text-muted-foreground">
                (benutting: {result.confidence.utilization_pct}%)
              </span>
            </div>

            {result.unassignable_orders.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Niet plaatsbare orders
                </div>
                <ul className="mt-1 space-y-1">
                  {result.unassignable_orders.map((order) => (
                    <li key={order.id} className="flex items-center gap-2 text-xs text-red-600">
                      <Package className="h-3 w-3" />
                      #{order.order_number} &mdash; {order.client_name} &mdash;{" "}
                      {order.delivery_address}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.reassigned_orders.length > 0 && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3">
                <div className="text-sm font-medium text-green-700">
                  Herverdeling
                </div>
                <ul className="mt-1 space-y-1">
                  {result.reassigned_orders.map((order) => {
                    // Find which vehicle this order ended up in
                    let newVehicle = "\u2014";
                    for (const [vId, orders] of Object.entries(result.new_assignments)) {
                      if (orders.some((o) => o.id === order.id)) {
                        const v = vehicles.find((veh) => veh.id === vId);
                        newVehicle = v ? v.name : vId;
                        break;
                      }
                    }
                    return (
                      <li key={order.id} className="flex items-center gap-2 text-xs text-green-600">
                        <Package className="h-3 w-3" />
                        #{order.order_number} &rarr; {newVehicle}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
