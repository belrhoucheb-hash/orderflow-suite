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
  Info
} from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function MasterDataSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- Queries ---
  const { data: vehicleTypes = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ["settings-vehicle-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
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
      toast({ title: "Verwijderd", description: "Gegeven succesvol verwijderd." });
    },
    onError: () => {
      toast({ title: "Fout", description: "Kon gegeven niet verwijderen.", variant: "destructive" });
    }
  });

  const [isAdding, setIsAdding] = useState<string | null>(null); // 'vehicle', 'unit', 'requirement'
  const [newData, setNewData] = useState<any>({});

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
      toast({ title: "Bijgevoegd", description: "Nieuw gegeven succesvol toegevoegd." });
    },
    onError: (err) => {
      console.error(err);
      toast({ title: "Fout", description: "Kon gegeven niet toevoegen.", variant: "destructive" });
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
          <Button size="sm" className="h-8 gap-1.5 rounded-lg" onClick={() => setIsAdding('vehicle')}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </Button>
        </div>

        <Card className="rounded-2xl border-border/40 overflow-hidden shadow-sm">
          {loadingVehicles ? renderLoading() : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[200px] text-xs uppercase tracking-wider font-semibold">Naam</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Code</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Capaciteit (kg)</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-semibold">Capaciteit (plt)</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isAdding === 'vehicle' && (
                  <TableRow className="bg-primary/5 hover:bg-primary/5 border-b-primary/20">
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="Bakwagen..." value={newData.name || ""} onChange={e => setNewData({...newData, name: e.target.value})} /></TableCell>
                    <TableCell><Input className="h-8 text-xs bg-background" placeholder="bakwagen" value={newData.code || ""} onChange={e => setNewData({...newData, code: e.target.value.toLowerCase().replace(/\s/g, '-')})} /></TableCell>
                    <TableCell><Input type="number" className="h-8 text-xs bg-background" placeholder="12000" value={newData.default_capacity_kg || ""} onChange={e => setNewData({...newData, default_capacity_kg: parseInt(e.target.value)})} /></TableCell>
                    <TableCell><Input type="number" className="h-8 text-xs bg-background" placeholder="18" value={newData.default_capacity_pallets || ""} onChange={e => setNewData({...newData, default_capacity_pallets: parseInt(e.target.value)})} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => addMutation.mutate({ table: 'vehicle_types', payload: newData })} disabled={!newData.name || !newData.code}>
                          <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => setIsAdding(null)}>
                          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {vehicleTypes.map((vt) => (
                  <TableRow key={vt.id} className="group transition-colors">
                    <TableCell className="font-medium text-xs">{vt.name}</TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{vt.code}</code></TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{vt.default_capacity_kg?.toLocaleString()} kg</TableCell>
                    <TableCell className="text-xs tabular-nums text-muted-foreground">{vt.default_capacity_pallets} plt</TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteMutation.mutate({ table: 'vehicle_types', id: vt.id })}>
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
