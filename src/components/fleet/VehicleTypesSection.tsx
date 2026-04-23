import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Trash2, Edit2, Truck } from "lucide-react";
import {
  VehicleTypeDialog,
  type VehicleTypeFormValues,
} from "@/components/settings/VehicleTypeDialog";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { QueryError } from "@/components/QueryError";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  const [pendingDelete, setPendingDelete] = useState<VehicleTypeRow | null>(null);

  const { data: vehicleTypes = [], isLoading, isError, refetch } = useQuery<VehicleTypeRow[]>({
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
    onError: (err: Error) => {
      const msg = err.message?.toLowerCase().includes("foreign key") || err.message?.toLowerCase().includes("violates")
        ? "Dit type is nog gekoppeld aan voertuigen of tarieven en kan niet verwijderd worden."
        : err.message || "Kon voertuigtype niet verwijderen.";
      toast.error("Fout", { description: msg });
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

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--gold-deep))] flex items-center gap-2">
            <Truck className="h-4 w-4" strokeWidth={1.75} />
            Voertuigtypes
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Categorieën met afmetingen en eigenschappen, gebruikt door planning en tariefmotor.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setDialogInitial(null); setDialogOpen(true); }}
          className="btn-luxe btn-luxe--primary !h-9"
        >
          <Plus className="h-4 w-4" />
          Nieuw type
        </button>
      </div>

      {isLoading ? (
        <LoadingState message="Voertuigtypes laden..." />
      ) : isError ? (
        <QueryError message="Kan voertuigtypes niet laden." onRetry={() => refetch()} />
      ) : vehicleTypes.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Nog geen voertuigtypes"
          description="Voeg een type toe om voertuigen te groeperen en tarieven te koppelen."
        />
      ) : (
        <div className="card--luxe overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full data-table">
              <thead>
                <tr
                  className="border-b border-[hsl(var(--gold)/0.2)] [&>th]:!font-display [&>th]:!text-[12px] [&>th]:!uppercase [&>th]:!tracking-[0.16em] [&>th]:!text-[hsl(var(--gold-deep))] [&>th]:!font-semibold [&>th]:!py-3.5 [&>th]:!px-5"
                  style={{ background: "linear-gradient(180deg, hsl(var(--gold-soft)/0.4), hsl(var(--gold-soft)/0.15))" }}
                >
                  <th className="text-left">Naam</th>
                  <th className="text-left">Code</th>
                  <th className="text-left">Afmetingen LxBxH</th>
                  <th className="text-left">Gewicht</th>
                  <th className="text-center">Pallets</th>
                  <th className="text-left">Opties</th>
                  <th className="text-right w-[120px]"></th>
                </tr>
              </thead>
              <tbody>
                {vehicleTypes.map((vt) => {
                  const dims = [vt.max_length_cm, vt.max_width_cm, vt.max_height_cm]
                    .map((n) => (n == null ? "?" : String(n)))
                    .join("x");
                  const opties: { label: string; key: string }[] = [];
                  if (vt.has_tailgate) opties.push({ label: "Klep", key: "klep" });
                  if (vt.has_cooling) opties.push({ label: "Koeling", key: "koeling" });
                  if (vt.adr_capable) opties.push({ label: "ADR", key: "adr" });
                  return (
                    <tr
                      key={vt.id}
                      className="group border-b border-[hsl(var(--gold)/0.08)] last:border-b-0 transition-colors hover:bg-[hsl(var(--gold-soft)/0.3)]"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="h-8 w-8 rounded-lg flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
                            style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.3))" }}
                          >
                            <Truck className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
                          </div>
                          <span className="text-sm font-medium text-foreground">{vt.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <code className="text-xs font-mono bg-[hsl(var(--gold-soft)/0.4)] border border-[hsl(var(--gold)/0.2)] px-1.5 py-0.5 rounded text-[hsl(var(--gold-deep))]">
                          {vt.code}
                        </code>
                      </td>
                      <td className="px-5 py-3.5 text-sm tabular-nums text-muted-foreground">
                        {dims !== "?x?x?" ? `${dims} cm` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm tabular-nums text-muted-foreground">
                        {vt.max_weight_kg != null ? `${vt.max_weight_kg.toLocaleString()} kg` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-sm tabular-nums text-center text-foreground">
                        {vt.max_pallets ?? "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        {opties.length > 0 ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {opties.map((opt) => (
                              <span
                                key={opt.key}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-[hsl(var(--gold)/0.25)] bg-[hsl(var(--gold-soft)/0.3)] text-[hsl(var(--gold-deep))] text-[11px]"
                              >
                                {opt.label}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.5)]"
                            onClick={() => { setDialogInitial(vt as Partial<VehicleTypeFormValues>); setDialogOpen(true); }}
                            aria-label="Bewerken"
                          >
                            <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setPendingDelete(vt)}
                            aria-label="Verwijderen"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voertuigtype verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `Type "${pendingDelete.name}" wordt permanent verwijderd. Dit kan alleen als er geen voertuigen en tarieven aan dit type hangen.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const vt = pendingDelete;
                if (!vt) return;
                setPendingDelete(null);
                deleteMutation.mutate(vt.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
