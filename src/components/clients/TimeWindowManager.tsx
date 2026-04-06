import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Pencil } from "lucide-react";
import { useTimeWindows, useCreateTimeWindow, useUpdateTimeWindow, useDeleteTimeWindow } from "@/hooks/useTimeWindows";
import type { LocationTimeWindow } from "@/types/timeWindows";
import { useToast } from "@/hooks/use-toast";

const DAY_NAMES = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

interface Props {
  locationId: string;
  tenantId: string;
}

interface FormState {
  day_of_week: number;
  open_time: string;
  close_time: string;
  slot_duration_min: number;
  max_concurrent_slots: number;
  notes: string;
}

const defaultForm: FormState = {
  day_of_week: 0,
  open_time: "08:00",
  close_time: "17:00",
  slot_duration_min: 30,
  max_concurrent_slots: 1,
  notes: "",
};

export default function TimeWindowManager({ locationId, tenantId }: Props) {
  const { data: windows = [], isLoading } = useTimeWindows(locationId);
  const createTW = useCreateTimeWindow();
  const updateTW = useUpdateTimeWindow();
  const deleteTW = useDeleteTimeWindow();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const handleSave = async () => {
    try {
      if (editingId) {
        await updateTW.mutateAsync({
          id: editingId,
          client_location_id: locationId,
          ...form,
          notes: form.notes || null,
        });
        toast({ title: "Tijdvenster bijgewerkt" });
      } else {
        await createTW.mutateAsync({
          client_location_id: locationId,
          tenant_id: tenantId,
          ...form,
          notes: form.notes || null,
        });
        toast({ title: "Tijdvenster toegevoegd" });
      }
      setShowForm(false);
      setEditingId(null);
      setForm(defaultForm);
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : "Onbekende fout", variant: "destructive" });
    }
  };

  const handleEdit = (tw: LocationTimeWindow) => {
    setEditingId(tw.id);
    setForm({
      day_of_week: tw.day_of_week,
      open_time: tw.open_time,
      close_time: tw.close_time,
      slot_duration_min: tw.slot_duration_min,
      max_concurrent_slots: tw.max_concurrent_slots,
      notes: tw.notes || "",
    });
    setShowForm(true);
  };

  const handleDelete = async (tw: LocationTimeWindow) => {
    try {
      await deleteTW.mutateAsync({ id: tw.id, locationId });
      toast({ title: "Tijdvenster verwijderd" });
    } catch (e: unknown) {
      toast({ title: "Fout", description: e instanceof Error ? e.message : "Onbekende fout", variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Tijdvensters</CardTitle>
        <Button size="sm" variant="outline" onClick={() => { setShowForm(true); setEditingId(null); setForm(defaultForm); }}>
          <Plus className="h-4 w-4 mr-1" /> Tijdvenster toevoegen
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : windows.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">Geen tijdvensters geconfigureerd.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dag</TableHead>
                <TableHead>Open</TableHead>
                <TableHead>Sluit</TableHead>
                <TableHead>Slotduur</TableHead>
                <TableHead>Max slots</TableHead>
                <TableHead>Notities</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {windows.map((tw) => (
                <TableRow key={tw.id}>
                  <TableCell>{DAY_NAMES[tw.day_of_week]}</TableCell>
                  <TableCell>{tw.open_time}</TableCell>
                  <TableCell>{tw.close_time}</TableCell>
                  <TableCell>{tw.slot_duration_min} min</TableCell>
                  <TableCell>{tw.max_concurrent_slots}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{tw.notes || "\u2014"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleEdit(tw)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(tw)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {showForm && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2 items-end border rounded-lg p-3">
            <div>
              <label className="text-xs font-medium">Dag</label>
              <Select value={String(form.day_of_week)} onValueChange={(v) => setForm((f) => ({ ...f, day_of_week: Number(v) }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((name, i) => (
                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Open</label>
              <Input type="time" value={form.open_time} onChange={(e) => setForm((f) => ({ ...f, open_time: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium">Sluit</label>
              <Input type="time" value={form.close_time} onChange={(e) => setForm((f) => ({ ...f, close_time: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs font-medium">Slotduur (min)</label>
              <Input type="number" min={5} max={240} value={form.slot_duration_min} onChange={(e) => setForm((f) => ({ ...f, slot_duration_min: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs font-medium">Max slots</label>
              <Input type="number" min={1} max={20} value={form.max_concurrent_slots} onChange={(e) => setForm((f) => ({ ...f, max_concurrent_slots: Number(e.target.value) }))} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={createTW.isPending || updateTW.isPending}>
                {editingId ? "Bijwerken" : "Opslaan"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); }}>
                Annuleer
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
