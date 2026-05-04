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
import {
  useWarehouses,
  useCreateWarehouse,
  useUpdateWarehouse,
  type WarehouseInput,
  type Warehouse as WarehouseType,
} from "@/hooks/useWarehouses";
import { AddressBookSettings } from "./AddressBookSettings";
import { LoadingUnitDialog, type LoadingUnitFormValues } from "./LoadingUnitDialog";
import { RequirementTypeDialog, type RequirementTypeFormValues } from "./RequirementTypeDialog";
import { useTenant } from "@/contexts/TenantContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
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

type DeleteTarget =
  | { table: "loading_units"; id: string; label: string }
  | { table: "requirement_types"; id: string; label: string }
  | { table: "tenant_warehouses"; id: string; label: string };

const STALE_FIVE_MIN = 5 * 60_000;

export function MasterDataSection() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;

  const { data: loadingUnits = [], isLoading: loadingUnitsData } = useQuery<LoadingUnitRow[]>({
    queryKey: ["settings-loading-units", tenantId],
    enabled: !!tenantId,
    staleTime: STALE_FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loading_units")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as LoadingUnitRow[];
    },
  });

  const { data: requirementTypes = [], isLoading: loadingRequirements } = useQuery<RequirementTypeRow[]>({
    queryKey: ["settings-requirement-types", tenantId],
    enabled: !!tenantId,
    staleTime: STALE_FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requirement_types")
        .select("*")
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as RequirementTypeRow[];
    },
  });

  const softDelete = useMutation({
    mutationFn: async ({ table, id }: { table: DeleteTarget["table"]; id: string }) => {
      const { error } = await (supabase as any)
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      const keyByTable: Record<DeleteTarget["table"], unknown[]> = {
        loading_units: ["settings-loading-units", tenantId],
        requirement_types: ["settings-requirement-types", tenantId],
        tenant_warehouses: ["warehouses", tenantId],
      };
      queryClient.invalidateQueries({ queryKey: keyByTable[variables.table] });
      toast.success("Verwijderd", {
        description: "Gegeven is verwijderd uit de lijst. Historische data blijft bewaard voor administratie.",
      });
    },
    onError: () => {
      toast.error("Fout", { description: "Kon gegeven niet verwijderen." });
    },
  });

  const [loadingUnitDialogOpen, setLoadingUnitDialogOpen] = useState(false);
  const [loadingUnitInitial, setLoadingUnitInitial] = useState<Partial<LoadingUnitFormValues> | null>(null);
  const [requirementDialogOpen, setRequirementDialogOpen] = useState(false);
  const [requirementInitial, setRequirementInitial] = useState<Partial<RequirementTypeFormValues> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const upsertLoadingUnit = useMutation({
    mutationFn: async (values: LoadingUnitFormValues) => {
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
      queryClient.invalidateQueries({ queryKey: ["settings-loading-units", tenantId] });
      setLoadingUnitDialogOpen(false);
      setLoadingUnitInitial(null);
      toast.success("Opgeslagen", { description: "Ladingeenheid bijgewerkt." });
    },
    onError: (err: Error) => {
      toast.error("Fout", { description: err.message || "Kon ladingeenheid niet opslaan." });
    },
  });

  const upsertRequirementType = useMutation({
    mutationFn: async (values: RequirementTypeFormValues) => {
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
      queryClient.invalidateQueries({ queryKey: ["settings-requirement-types", tenantId] });
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

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verwijderen bevestigen</AlertDialogTitle>
            <AlertDialogDescription>
              Je staat op het punt "{deleteTarget?.label}" te verwijderen uit de actieve lijst.
              Het item verdwijnt direct uit de UI, maar de onderliggende gegevens worden
              volgens de wettelijke bewaarplicht (AVG) bewaard en blijven verbonden aan
              historische orders en bewegingen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  softDelete.mutate({ table: deleteTarget.table, id: deleteTarget.id });
                  setDeleteTarget(null);
                }
              }}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Loading Units */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
              style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
            >
              <Package className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Ladingeenheden</h3>
              <p className="text-xs text-muted-foreground">Eenheden voor orders en capaciteitsberekening.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setLoadingUnitInitial(null); setLoadingUnitDialogOpen(true); }}
            className="btn-luxe btn-luxe--primary !h-8"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </button>
        </div>

        <Card className="card--luxe overflow-hidden">
          {loadingUnitsData ? renderLoading() : (
            <Table>
              <TableHeader className="bg-[hsl(var(--gold-soft)/0.3)]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Standaard Gewicht</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Afmetingen</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUnits.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                      Nog geen ladingeenheden. Voeg er een toe om ze te kunnen koppelen aan orders.
                    </TableCell>
                  </TableRow>
                )}
                {loadingUnits.map((lu) => (
                  <TableRow key={lu.id} className="transition-colors">
                    <TableCell className="font-medium text-xs">{lu.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{lu.code}</code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lu.default_weight_kg ? `${lu.default_weight_kg} kg` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lu.default_dimensions || "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Bewerken ${lu.name}`}
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
                          aria-label={`Verwijderen ${lu.name}`}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget({ table: "loading_units", id: lu.id, label: lu.name })}
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
            <div
              className="h-9 w-9 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
              style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
            >
              <AlertTriangle className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Transportvereisten</h3>
              <p className="text-xs text-muted-foreground">Speciale kenmerken zoals ADR, Koeling of Laadklep.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setRequirementInitial(null); setRequirementDialogOpen(true); }}
            className="btn-luxe btn-luxe--primary !h-8"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </button>
        </div>

        <Card className="card--luxe overflow-hidden">
          {loadingRequirements ? renderLoading() : (
            <Table>
              <TableHeader className="bg-[hsl(var(--gold-soft)/0.3)]">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Categorie</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Kleur</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirementTypes.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">
                      Nog geen transportvereisten. Voeg ADR, Koeling of een eigen kenmerk toe.
                    </TableCell>
                  </TableRow>
                )}
                {requirementTypes.map((rt) => (
                  <TableRow key={rt.id} className="transition-colors">
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
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Bewerken ${rt.name}`}
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
                          aria-label={`Verwijderen ${rt.name}`}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeleteTarget({ table: "requirement_types", id: rt.id, label: rt.name })}
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
      <WarehousesSection onRequestDelete={(wh) => setDeleteTarget({ table: "tenant_warehouses", id: wh.id, label: wh.name })} />

      <AddressBookSettings />

      <div className="card--luxe p-5 mt-10" style={{ background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft)/0.25) 100%)" }}>
        <div className="flex gap-3">
          <Info className="h-5 w-5 text-[hsl(var(--gold-deep))] shrink-0 mt-0.5" strokeWidth={1.5} />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-[hsl(var(--gold-deep))]">Over stamgegevens</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Stamgegevens vormen het fundament van je TMS. Verwijderde items verdwijnen uit de actieve
              lijst, maar blijven conform de AVG-bewaarplicht gekoppeld aan historische orders en bewegingen.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WarehousesSection({ onRequestDelete }: { onRequestDelete: (wh: WarehouseType) => void }) {
  const { data: warehouses = [], isLoading } = useWarehouses();
  const createMut = useCreateWarehouse();
  const updateMut = useUpdateWarehouse();

  const emptyWarehouseForm: WarehouseInput = {
    name: '',
    address: '',
    warehouse_type: 'OPS',
    transport_flow: 'both',
    default_stop_role: 'pickup',
    warehouse_reference_mode: 'manual',
    warehouse_reference_prefix: '',
    manual_reference: '',
    is_default: false,
  };
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WarehouseInput>(emptyWarehouseForm);

  const resetForm = () => {
    setForm(emptyWarehouseForm);
    setIsAdding(false);
    setEditingId(null);
  };

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
    setForm({
      name: wh.name,
      address: wh.address,
      warehouse_type: wh.warehouse_type,
      transport_flow: wh.transport_flow ?? 'both',
      default_stop_role: wh.default_stop_role ?? 'pickup',
      warehouse_reference_mode: wh.warehouse_reference_mode ?? 'manual',
      warehouse_reference_prefix: wh.warehouse_reference_prefix ?? '',
      manual_reference: wh.manual_reference ?? '',
      is_default: wh.is_default,
    });
    setIsAdding(true);
  };

  const flowLabel = (flow: WarehouseType["transport_flow"] | undefined) =>
    flow === "import" ? "Import" : flow === "export" ? "Export" : "Beide";
  const roleLabel = (role: WarehouseType["default_stop_role"] | undefined) =>
    role === "delivery" ? "Losadres" : "Laadadres";
  const referenceLabel = (wh: WarehouseType) =>
    wh.warehouse_reference_mode === "order_number"
      ? `${wh.warehouse_reference_prefix || ""}ordernummer`
      : wh.manual_reference || "Handmatig";

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center border border-[hsl(var(--gold)/0.3)]"
            style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
          >
            <Warehouse className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Warehouses</h3>
            <p className="text-xs text-muted-foreground">Hub-adressen voor automatische afdeling-detectie (OPS / EXPORT / IMPORT).</p>
          </div>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => { resetForm(); setIsAdding(true); }}
            className="btn-luxe btn-luxe--primary !h-8"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </button>
        )}
      </div>

      <Card className="card--luxe overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Laden...
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[hsl(var(--gold-soft)/0.3)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[180px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                <TableHead className="text-xs uppercase tracking-wider font-semibold">Adres</TableHead>
                <TableHead className="w-[105px] text-xs uppercase tracking-wider font-semibold">Type</TableHead>
                <TableHead className="w-[105px] text-xs uppercase tracking-wider font-semibold">Flow</TableHead>
                <TableHead className="w-[115px] text-xs uppercase tracking-wider font-semibold">Rol</TableHead>
                <TableHead className="w-[150px] text-xs uppercase tracking-wider font-semibold">Referentie</TableHead>
                <TableHead className="w-[80px] text-xs uppercase tracking-wider font-semibold">Std.</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAdding && (
                <TableRow className="bg-[hsl(var(--gold-soft)/0.25)] hover:bg-[hsl(var(--gold-soft)/0.25)] border-b-[hsl(var(--gold)/0.25)]">
                  <TableCell><Input className="h-8 text-xs bg-background" placeholder="RCS Export Hub" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></TableCell>
                  <TableCell><Input className="h-8 text-xs bg-background" placeholder="Volledig adres" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></TableCell>
                  <TableCell>
                    <Select value={form.warehouse_type} onValueChange={v => setForm({ ...form, warehouse_type: v as WarehouseInput["warehouse_type"] })}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPS">OPS</SelectItem>
                        <SelectItem value="EXPORT">EXPORT</SelectItem>
                        <SelectItem value="IMPORT">IMPORT</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={form.transport_flow} onValueChange={v => setForm({ ...form, transport_flow: v as WarehouseInput["transport_flow"] })}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="export">Export</SelectItem>
                        <SelectItem value="import">Import</SelectItem>
                        <SelectItem value="both">Beide</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={form.default_stop_role} onValueChange={v => setForm({ ...form, default_stop_role: v as WarehouseInput["default_stop_role"] })}>
                      <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pickup">Laadadres</SelectItem>
                        <SelectItem value="delivery">Losadres</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      <Select value={form.warehouse_reference_mode} onValueChange={v => setForm({ ...form, warehouse_reference_mode: v as WarehouseInput["warehouse_reference_mode"] })}>
                        <SelectTrigger className="h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">Handmatig</SelectItem>
                          <SelectItem value="order_number">Ordernummer</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-7 text-[11px] bg-background"
                        placeholder={form.warehouse_reference_mode === "order_number" ? "Prefix optioneel" : "Referentie"}
                        value={form.warehouse_reference_mode === "order_number" ? form.warehouse_reference_prefix ?? "" : form.manual_reference ?? ""}
                        onChange={e => setForm(form.warehouse_reference_mode === "order_number"
                          ? { ...form, warehouse_reference_prefix: e.target.value }
                          : { ...form, manual_reference: e.target.value })}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <input type="checkbox" checked={form.is_default} onChange={e => setForm({ ...form, is_default: e.target.checked })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" aria-label="Opslaan" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={handleSave} disabled={!form.name || !form.address}>
                        <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Annuleren" className="h-7 w-7 text-muted-foreground" onClick={resetForm}>
                        <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {warehouses.map((wh) => (
                <TableRow key={wh.id} className="transition-colors">
                  <TableCell className="font-medium text-xs">{wh.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{wh.address}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{wh.warehouse_type}</code></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{flowLabel(wh.transport_flow)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{roleLabel(wh.default_stop_role)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{referenceLabel(wh)}</TableCell>
                  <TableCell className="text-xs text-center text-muted-foreground">{wh.is_default ? 'Ja' : ''}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" aria-label={`Bewerken ${wh.name}`} className="h-7 w-7 text-muted-foreground hover:text-[hsl(var(--gold-deep))] hover:bg-[hsl(var(--gold-soft)/0.5)]" onClick={() => startEdit(wh)}>
                        <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Verwijderen ${wh.name}`} className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => onRequestDelete(wh)}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && warehouses.length === 0 && !isAdding && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
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
