import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit2, Truck, Loader2 } from "lucide-react";
import {
  VehicleTypeDialog,
  type VehicleTypeFormValues,
} from "@/components/settings/VehicleTypeDialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface VehicleTypeRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  sort_order: number | null;
  max_length_cm: number | null;
  max_width_cm: number | null;
  max_height_cm: number | null;
  max_weight_kg: number | null;
  max_volume_m3: number | null;
  max_pallets: number | null;
  has_tailgate: boolean | null;
  has_cooling: boolean | null;
  adr_capable: boolean | null;
  is_active: boolean | null;
}

export function VehicleTypesSection() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogInitial, setDialogInitial] = useState<Partial<VehicleTypeFormValues> | null>(null);

  const { data: vehicleTypes = [], isLoading } = useQuery<VehicleTypeRow[]>({
    queryKey: ["settings-vehicle-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VehicleTypeRow[];
    },
  });

  const upsertVehicleType = useMutation({
    mutationFn: async (values: VehicleTypeFormValues) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("user_id", user?.id)
        .single();
      const tenantId = profile?.tenant_id;
      if (!tenantId) throw new Error("Geen tenant gevonden voor huidige gebruiker");

      const payload = {
        name: values.name.trim(),
        code: values.code.trim(),
        sort_order: values.sort_order ?? 0,
        max_length_cm: values.max_length_cm,
        max_width_cm: values.max_width_cm,
        max_height_cm: values.max_height_cm,
        max_weight_kg: values.max_weight_kg,
        max_volume_m3: values.max_volume_m3,
        max_pallets: values.max_pallets,
        has_tailgate: values.has_tailgate,
        has_cooling: values.has_cooling,
        adr_capable: values.adr_capable,
        default_capacity_kg: values.max_weight_kg,
        default_capacity_pallets: values.max_pallets,
      };

      const { error } = await supabase
        .from("vehicle_types")
        .upsert({ ...payload, tenant_id: tenantId }, { onConflict: "tenant_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-vehicle-types"] });
      setDialogOpen(false);
      setDialogInitial(null);
      toast.success("Opgeslagen", { description: "Voertuigtype bijgewerkt." });
    },
    onError: (err: Error) => {
      toast.error("Fout", { description: err.message || "Kon voertuigtype niet opslaan." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicle_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-vehicle-types"] });
      toast.success("Verwijderd", { description: "Voertuigtype succesvol verwijderd." });
    },
    onError: () => {
      toast.error("Fout", { description: "Kon voertuigtype niet verwijderen." });
    },
  });

  return (
    <section className="space-y-4">
      <VehicleTypeDialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) setDialogInitial(null); }}
        initial={dialogInitial}
        onSubmit={(values) => upsertVehicleType.mutate(values)}
        submitting={upsertVehicleType.isPending}
      />

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Truck className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Voertuigtypes</h3>
            <p className="text-xs text-muted-foreground">
              Categorieën met afmetingen en eigenschappen, gebruikt door planning en tariefmotor.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-lg"
          onClick={() => { setDialogInitial(null); setDialogOpen(true); }}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
        </Button>
      </div>

      <Card className="rounded-2xl border-border/40 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Laden...
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[160px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Afmetingen LxBxH</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Gewicht</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Pallets</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Opties</TableHead>
                <TableHead className="w-[110px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vehicleTypes.map((vt) => {
                const dims = [vt.max_length_cm, vt.max_width_cm, vt.max_height_cm]
                  .map((n) => (n == null ? "?" : String(n)))
                  .join("x");
                const opties: string[] = [];
                if (vt.has_tailgate) opties.push("klep");
                if (vt.has_cooling) opties.push("koeling");
                if (vt.adr_capable) opties.push("ADR");
                return (
                  <TableRow key={vt.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs">{vt.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{vt.code}</code>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {dims !== "?x?x?" ? `${dims} cm` : "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {vt.max_weight_kg != null ? `${vt.max_weight_kg.toLocaleString()} kg` : "—"}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{vt.max_pallets ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {opties.length > 0 ? opties.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => { setDialogInitial(vt as Partial<VehicleTypeFormValues>); setDialogOpen(true); }}
                        >
                          <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMutation.mutate(vt.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
              );
            })}
          </TableBody>
        </Table>
        )}
      </Card>
    </section>
  );
}
