import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Trash2,
  Edit2,
  Package,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Info,
  Warehouse,
} from "lucide-react";
import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse, type WarehouseInput, type Warehouse as WarehouseType } from "@/hooks/useWarehouses";
import { PlanningV2Toggle } from "./PlanningV2Toggle";
import { LoadingUnitDialog, type LoadingUnitFormValues } from "./LoadingUnitDialog";
import { RequirementTypeDialog, type RequirementTypeFormValues } from "./RequirementTypeDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Card,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

interface LoadingUnitRow {
  id: string;
  name: string;
  code: string;
  default_weight_kg: number | null;
  default_dimensions: string | null;
}

interface RequirementTypeRow {
  id: string;
  name: string;
  code: string;
  category: string | null;
  color: string | null;
}

export function MasterDataSection() {
  const queryClient = useQueryClient();

  const { data: loadingUnits = [], isLoading: loadingUnitsData } = useQuery<LoadingUnitRow[]>({
    queryKey: ["settings-loading-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loading_units")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LoadingUnitRow[];
    },
  });

  const { data: requirementTypes = [], isLoading: loadingRequirements } = useQuery<RequirementTypeRow[]>({
    queryKey: ["settings-requirement-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requirement_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RequirementTypeRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ table, id }: { table: "loading_units" | "requirement_types"; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`settings-${variables.table.replace("_", "-")}`] });
      toast.success("Verwijderd", { description: "Gegeven succesvol verwijderd." });
    },
    onError: () => {
      toast.error("Fout", { description: "Kon gegeven niet verwijderen." });
    },
  });

  const [loadingUnitDialogOpen, setLoadingUnitDialogOpen] = useState(false);
  const [loadingUnitInitial, setLoadingUnitInitial] = useState<Partial<LoadingUnitFormValues> | null>(null);

  const upsertLoadingUnit = useMutation({
    mutationFn: async (values: LoadingUnitFormValues) => {
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
        default_weight_kg: values.default_weight_kg,
        default_dimensions: values.default_dimensions?.trim() || null,
        tenant_id: tenantId,
      };

      const { error } = await supabase
        .from("loading_units")
        .upsert(payload, { onConflict: "tenant_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-loading-units"] });
      setLoadingUnitDialogOpen(false);
      setLoadingUnitInitial(null);
      toast.success("Opgeslagen", { description: "Ladingeenheid bijgewerkt." });
    },
    onError: (err: Error) => {
      toast.error("Fout", { description: err.message || "Kon ladingeenheid niet opslaan." });
    },
  });

  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [requirementInitial, setRequirementInitial] = useState<Partial<RequirementTypeFormValues> | null>(null);

  const upsertRequirementType = useMutation({
    mutationFn: async (values: RequirementTypeFormValues) => {
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
        category: values.category?.trim() || "transport",
        color: values.color?.trim() || null,
        tenant_id: tenantId,
      };

      const { error } = await supabase
        .from("requirement_types")
        .upsert(payload, { onConflict: "tenant_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-requirement-types"] });
      setRequirementDialogOpen(false);
      setRequirementInitial(null);
      toast.success("Opgeslagen", { description: "Transportvereiste bijgewerkt." });
    },
    onError: (err: Error) => {
      toast.error("Fout", { description: err.message || "Kon transportvereiste niet opslaan." });
    },
  });

  const renderLoading = () => (
    <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
      Laden...
    </div>
  );

  return (
    <div className="space-y-10">
      <LoadingUnitDialog
        open={loadingUnitDialogOpen}
        onOpenChange={(o) => { setLoadingUnitDialogOpen(o); if (!o) setLoadingUnitInitial(null); }}
        initial={loadingUnitInitial}
        onSubmit={(values) => upsertLoadingUnit.mutate(values)}
        submitting={upsertLoadingUnit.isPending}
      />

      <RequirementTypeDialog
        open={requirementDialogOpen}
        onOpenChange={(o) => { setRequirementDialogOpen(o); if (!o) setRequirementInitial(null); }}
        initial={requirementInitial}
        onSubmit={(values) => upsertRequirementType.mutate(values)}
        submitting={upsertRequirementType.isPending}
      />

      {/* Planbord v2 feature-flag */}
      <section>
        <PlanningV2Toggle />
      </section>

      {/* Loading Units */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Package className="h-4.5 w-4.5 text-amber-600" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Ladingeenheden</h3>
              <p className="text-xs text-muted-foreground">Eenheden voor orders en capaciteitsberekening.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg"
            onClick={() => { setLoadingUnitInitial(null); setLoadingUnitDialogOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </Button>
        </div>

        <Card className="rounded-2xl border-border/40 overflow-hidden shadow-sm">
          {loadingUnitsData ? renderLoading() : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Standaard Gewicht</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Afmetingen</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUnits.map((lu) => (
                  <TableRow key={lu.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs">{lu.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{lu.code}</code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lu.default_weight_kg ? `${lu.default_weight_kg} kg` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lu.default_dimensions || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setLoadingUnitInitial({
                              name: lu.name,
                              code: lu.code,
                              default_weight_kg: lu.default_weight_kg,
                              default_dimensions: lu.default_dimensions ?? "",
                            });
                            setLoadingUnitDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMutation.mutate({ table: "loading_units", id: lu.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      {/* Requirement Types */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <AlertTriangle className="h-4.5 w-4.5 text-purple-600" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Transportvereisten</h3>
              <p className="text-xs text-muted-foreground">Speciale kenmerken zoals ADR, Koeling of Laadklep.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 gap-1.5 rounded-lg"
            onClick={() => { setRequirementInitial(null); setRequirementDialogOpen(true); }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </Button>
        </div>

        <Card className="rounded-2xl border-border/40 overflow-hidden shadow-sm">
          {loadingRequirements ? renderLoading() : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Categorie</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Kleur</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirementTypes.map((rt) => (
                  <TableRow key={rt.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: rt.color || "#888" }} />
                      {rt.name}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{rt.code}</code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground uppercase font-medium">{rt.category}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground uppercase">{rt.color || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setRequirementInitial({
                              name: rt.name,
                              code: rt.code,
                              category: rt.category ?? "transport",
                              color: rt.color ?? "",
                            });
                            setRequirementDialogOpen(true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => deleteMutation.mutate({ table: "requirement_types", id: rt.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      {/* Warehouses */}
      <WarehousesSection />

      <div className="bg-primary/5 rounded-2xl border border-primary/10 p-5 mt-10">
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-primary">Over Stamgegevens</h4>
            <p className="text-xs text-primary/70 leading-relaxed">
              Stamgegevens vormen het fundament van uw TMS. Wijzigingen hier hebben directe invloed op de
              planning en orderverwerking. Wees voorzichtig bij het verwijderen van actieve types.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WarehousesSection() {
  const { data: warehouses = [], isLoading } = useWarehouses();
  const createMut = useCreateWarehouse();
  const updateMut = useUpdateWarehouse();
  const deleteMut = useDeleteWarehouse();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseInput>({ name: '', address: '', warehouse_type: 'OPS', is_default: false });

  const resetForm = () => { setForm({ name: '', address: '', warehouse_type: 'OPS', is_default: false }); setIsAdding(false); setEditingId(null); };

  const handleSave = async () => {
    if (!form.name.trim() || !form.address.trim()) return;
    if (editingId) {
      await updateMut.mutateAsync({ id: editingId, ...form });
    } else {
      await createMut.mutateAsync(form);
    }
    resetForm();
  };

  const startEdit = (wh: WarehouseType) => {
    setEditingId(wh.id);
    setForm({ name: wh.name, address: wh.address, warehouse_type: wh.warehouse_type, is_default: wh.is_default });
    setIsAdding(true);
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Warehouse className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Warehouses</h3>
            <p className="text-xs text-muted-foreground">Hub-adressen voor automatische afdeling-detectie (OPS / EXPORT / IMPORT).</p>
          </div>
        </div>
        {!isAdding && (
          <Button size="sm" className="h-8 gap-1.5 rounded-lg" onClick={() => { resetForm(); setIsAdding(true); }}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </Button>
        )}
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
                <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Adres</TableHead>
                <TableHead className="w-[120px] text-xs uppercase tracking-wider font-semibold">Type</TableHead>
                <TableHead className="w-[100px] text-xs uppercase tracking-wider font-semibold">Standaard</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAdding && (
                <TableRow className="bg-primary/5 hover:bg-primary/5 border-b-primary/20">
                  <TableCell><Input className="h-8 text-xs bg-background" placeholder="RCS Export Hub" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></TableCell>
                  <TableCell><Input className="h-8 text-xs bg-background" placeholder="Volledig adres" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></TableCell>
                  <TableCell>
                    <Select value={form.warehouse_type} onValueChange={v => setForm({ ...form, warehouse_type: v as any })}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPS">OPS</SelectItem>
                        <SelectItem value="EXPORT">EXPORT</SelectItem>
                        <SelectItem value="IMPORT">IMPORT</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-center">
                    <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleSave} disabled={!form.name || !form.address}>
                        <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={resetForm}>
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {warehouses.map((wh) => (
                <TableRow key={wh.id} className="group transition-colors">
                  <TableCell className="font-medium text-xs">{wh.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{wh.address}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{wh.warehouse_type}</code></TableCell>
                  <TableCell className="text-xs text-center text-muted-foreground">{wh.is_default ? 'Ja' : ''}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => startEdit(wh)}>
                        <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMut.mutate(wh.id)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && warehouses.length === 0 && !isAdding && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                    Nog geen warehouses. Voeg er een toe om afdeling-detectie in te schakelen.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}
