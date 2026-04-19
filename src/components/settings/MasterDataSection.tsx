import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Trash2,
  Edit2,
  Truck,
  Package,
  AlertTriangle,
  Check,
  X,
  Loader2,
  Info,
  Warehouse,
} from "lucide-react";
import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse, type WarehouseInput, type Warehouse as WarehouseType } from "@/hooks/useWarehouses";
import { VehicleTypeDialog, type VehicleTypeFormValues } from "./VehicleTypeDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function MasterDataSection() {
  const queryClient = useQueryClient();

  // --- Queries ---
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

  const { data: vehicleTypes = [], isLoading: loadingVehicles } = useQuery<VehicleTypeRow[]>({
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

  const { data: loadingUnits = [], isLoading: loadingUnitsData } = useQuery({
    queryKey: ["settings-loading-units"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loading_units")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: requirementTypes = [], isLoading: loadingRequirements } = useQuery({
    queryKey: ["settings-requirement-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("requirement_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // --- Mutations ---
  const deleteMutation = useMutation({
    mutationFn: async ({ table, id }: { table: string; id: string }) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`settings-${variables.table.replace('_', '-')}`] });
      toast.success("Verwijderd", { description: "Gegeven succesvol verwijderd." });
    },
    onError: () => {
      toast.error("Fout", { description: "Kon gegeven niet verwijderen." });
    }
  });

  const [isAdding, setIsAdding] = useState<string | null>(null); // 'unit', 'requirement'
  const [newData, setNewData] = useState<any>({});

  // Voertuigtype dialog state (los van de inline-forms van unit/requirement).
  const [vehicleDialogOpen, setVehicleDialogOpen] = useState(false);
  const [vehicleDialogInitial, setVehicleDialogInitial] = useState<Partial<VehicleTypeFormValues> | null>(null);

  const upsertVehicleType = useMutation({
    mutationFn: async (values: VehicleTypeFormValues) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user?.id).single();
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
        default_capacity_kg: values.max_weight_kg, // spiegel, zolang oude kolom nog gebruikt wordt
        default_capacity_pallets: values.max_pallets,
      };

      const { error } = await supabase
        .from("vehicle_types")
        .upsert({ ...payload, tenant_id: tenantId }, { onConflict: "tenant_id,code" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-vehicle-types"] });
      setVehicleDialogOpen(false);
      setVehicleDialogInitial(null);
      toast.success("Opgeslagen", { description: "Voertuigtype bijgewerkt." });
    },
    onError: (err: Error) => {
      console.error(err);
      toast.error("Fout", { description: err.message || "Kon voertuigtype niet opslaan." });
    },
  });

  const addMutation = useMutation({
    mutationFn: async ({ table, payload }: { table: string; payload: any }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("user_id", user?.id).single();
      
      const { error } = await supabase.from(table).insert({
        ...payload,
        tenant_id: profile?.tenant_id
      });
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`settings-${variables.table.replace('_', '-')}`] });
      setIsAdding(null);
      setNewData({});
      toast.success("Bijgevoegd", { description: "Nieuw gegeven succesvol toegevoegd." });
    },
    onError: (err) => {
      console.error(err);
      toast.error("Fout", { description: "Kon gegeven niet toevoegen." });
    }
  });

  const renderLoading = () => (
    <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
      Laden...
    </div>
  );

  return (
    <div className="space-y-10">
      <VehicleTypeDialog
        open={vehicleDialogOpen}
        onOpenChange={(o) => { setVehicleDialogOpen(o); if (!o) setVehicleDialogInitial(null); }}
        initial={vehicleDialogInitial}
        onSubmit={(values) => upsertVehicleType.mutate(values)}
        submitting={upsertVehicleType.isPending}
      />

      {/* ─── Vehicle Types ─── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
             <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
               <Truck className="h-4.5 w-4.5 text-primary" strokeWidth={1.5} />
             </div>
             <div>
               <h3 className="text-lg font-bold">Voertuigtypes</h3>
               <p className="text-xs text-muted-foreground">Beschikbare vrachtwagen categorieën voor planning.</p>
             </div>
          </div>
          <Button size="sm" className="h-8 gap-1.5 rounded-lg" onClick={() => { setVehicleDialogInitial(null); setVehicleDialogOpen(true); }}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </Button>
        </div>

        <Card className="rounded-2xl border-border/40 overflow-hidden shadow-sm">
          {loadingVehicles ? renderLoading() : (
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
                    .map(n => (n == null ? "?" : String(n)))
                    .join("x");
                  const opties: string[] = [];
                  if (vt.has_tailgate) opties.push("klep");
                  if (vt.has_cooling) opties.push("koeling");
                  if (vt.adr_capable) opties.push("ADR");
                  return (
                    <TableRow key={vt.id} className="group transition-colors">
                      <TableCell className="font-medium text-xs">{vt.name}</TableCell>
                      <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{vt.code}</code></TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{dims !== "?x?x?" ? `${dims} cm` : "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{vt.max_weight_kg != null ? `${vt.max_weight_kg.toLocaleString()} kg` : "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">{vt.max_pallets ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{opties.length > 0 ? opties.join(", ") : "—"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => { setVehicleDialogInitial(vt as Partial<VehicleTypeFormValues>); setVehicleDialogOpen(true); }}
                          >
                            <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteMutation.mutate({ table: 'vehicle_types', id: vt.id })}
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

      {/* ─── Loading Units ─── */}
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
          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-dashed border-2 hover:border-amber-600/30 hover:bg-amber-50" onClick={() => setIsAdding('unit')}>
            <Plus className="h-3.5 w-3.5 text-amber-600" strokeWidth={1.5} />Toevoegen
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
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding === 'unit' && (
                  <TableRow className="bg-amber-50/30 hover:bg-amber-50/30 border-b-amber-200/50">
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="Europallet..." value={newData.name || ""} onChange={e => setNewData({...newData, name: e.target.value})} /></TableCell>
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="europallet" value={newData.code || ""} onChange={e => setNewData({...newData, code: e.target.value.toLowerCase().replace(/\s/g, '-')})} /></TableCell>
                    <TableCell><Input type="number" className="h-8 text-xs bg-background" placeholder="750" value={newData.default_weight_kg || ""} onChange={e => setNewData({...newData, default_weight_kg: parseFloat(e.target.value)})} /></TableCell>
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="120x80x144 cm" value={newData.default_dimensions || ""} onChange={e => setNewData({...newData, default_dimensions: e.target.value})} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => addMutation.mutate({ table: 'loading_units', payload: newData })} disabled={!newData.name || !newData.code}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setIsAdding(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {loadingUnits.map((lu) => (
                  <TableRow key={lu.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs">{lu.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{lu.code}</code></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lu.default_weight_kg ? `${lu.default_weight_kg} kg` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lu.default_dimensions || "—"}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate({ table: 'loading_units', id: lu.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      {/* ─── Requirement Types ─── */}
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
          <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-lg border-dashed border-2 hover:border-purple-600/30 hover:bg-purple-50" onClick={() => setIsAdding('requirement')}>
            <Plus className="h-3.5 w-3.5 text-purple-600" strokeWidth={1.5} />Toevoegen
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
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding === 'requirement' && (
                  <TableRow className="bg-purple-50/30 hover:bg-purple-50/30 border-b-purple-200/50">
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="ADR..." value={newData.name || ""} onChange={e => setNewData({...newData, name: e.target.value})} /></TableCell>
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="adr" value={newData.code || ""} onChange={e => setNewData({...newData, code: e.target.value.toLowerCase().replace(/\s/g, '-')})} /></TableCell>
                    <TableCell>
                       <Input className="h-8 text-xs bg-background" placeholder="transport" value={newData.category || "transport"} onChange={e => setNewData({...newData, category: e.target.value})} />
                    </TableCell>
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="#000000" value={newData.color || ""} onChange={e => setNewData({...newData, color: e.target.value})} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => addMutation.mutate({ table: 'requirement_types', payload: newData })} disabled={!newData.name || !newData.code}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setIsAdding(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {requirementTypes.map((rt) => (
                  <TableRow key={rt.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs flex items-center gap-2">
                       <span className="h-2 w-2 rounded-full" style={{ background: rt.color || '#888' }} />
                       {rt.name}
                    </TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{rt.code}</code></TableCell>
                    <TableCell className="text-xs text-muted-foreground uppercase font-medium">{rt.category}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground uppercase">{rt.color || "—"}</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate({ table: 'requirement_types', id: rt.id })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </section>

      {/* ─── Warehouses ─── */}
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

