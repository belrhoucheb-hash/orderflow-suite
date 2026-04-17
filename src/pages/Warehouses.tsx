import { useState } from "react";
import { Plus, Trash2, Pencil, Warehouse as WarehouseIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWarehouses, useCreateWarehouse, useUpdateWarehouse, useDeleteWarehouse, type WarehouseInput, type Warehouse } from "@/hooks/useWarehouses";

const TYPE_LABELS: Record<string, { label: string; description: string }> = {
  OPS: { label: "Operations", description: "Binnenlands depot of hub" },
  EXPORT: { label: "Export", description: "Vertrekpunt voor internationale zendingen" },
  IMPORT: { label: "Import", description: "Ontvangstpunt voor binnenkomende zendingen" },
};

function WarehouseCard({ wh, onEdit, onDelete }: { wh: Warehouse; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="card--luxe p-5 flex items-start gap-4">
      <span className="w-10 h-10 rounded-xl bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] inline-flex items-center justify-center shrink-0 mt-0.5">
        <WarehouseIcon className="h-5 w-5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold truncate">{wh.name}</span>
          <span className="text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-[hsl(var(--gold-soft))] text-[hsl(var(--gold-deep))] border border-[hsl(var(--gold)_/_0.25)]">
            {wh.warehouse_type}
          </span>
          {wh.is_default && (
            <span className="text-[10px] font-medium tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-muted-foreground">
              Standaard
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{wh.address}</p>
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
          {TYPE_LABELS[wh.warehouse_type]?.description}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-[hsl(var(--muted)_/_0.5)] transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-[hsl(var(--muted)_/_0.5)] transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function WarehouseForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Warehouse;
  onSave: (input: WarehouseInput) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [type, setType] = useState<string>(initial?.warehouse_type ?? "OPS");
  const [isDefault, setIsDefault] = useState(initial?.is_default ?? false);

  const handleSubmit = () => {
    if (!name.trim() || !address.trim()) {
      toast.error("Naam en adres zijn verplicht");
      return;
    }
    onSave({
      name: name.trim(),
      address: address.trim(),
      warehouse_type: type as "OPS" | "EXPORT" | "IMPORT",
      is_default: isDefault,
    });
  };

  return (
    <div className="card--luxe p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Naam</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Bv. RCS Export Hub" className="h-9 text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Type</label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="OPS">Operations</SelectItem>
              <SelectItem value="EXPORT">Export</SelectItem>
              <SelectItem value="IMPORT">Import</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1.5">Adres</label>
          <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Volledig adres incl. stad" className="h-9 text-sm" />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isDefault}
            onClick={() => setIsDefault(!isDefault)}
            className={cn(
              "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
              isDefault ? "bg-[hsl(var(--gold))]" : "bg-[hsl(var(--border))]",
            )}
          >
            <span className={cn(
              "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
              isDefault ? "translate-x-5" : "translate-x-0",
            )} />
          </button>
          <span className="text-xs text-muted-foreground">Standaard warehouse voor dit type</span>
        </div>
      </div>
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-transparent text-white relative overflow-hidden transition-all duration-200 hover:-translate-y-px disabled:opacity-50"
          style={{
            background: "linear-gradient(180deg, hsl(0 78% 48%) 0%, hsl(0 78% 38%) 100%)",
            boxShadow: "0 1px 2px hsl(var(--primary) / 0.4), 0 4px 12px -2px hsl(var(--primary) / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.2), inset 0 -1px 0 hsl(0 0% 0% / 0.1)",
          }}
        >
          {initial ? "Opslaan" : "Toevoegen"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-transparent bg-transparent text-muted-foreground transition-all duration-200 hover:text-foreground hover:bg-[hsl(var(--muted)_/_0.5)]"
        >
          Annuleren
        </button>
      </div>
    </div>
  );
}

export default function Warehouses() {
  const { data: warehouses = [], isLoading } = useWarehouses();
  const createMut = useCreateWarehouse();
  const updateMut = useUpdateWarehouse();
  const deleteMut = useDeleteWarehouse();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Warehouse | null>(null);

  const handleCreate = async (input: WarehouseInput) => {
    await createMut.mutateAsync(input);
    toast.success("Warehouse toegevoegd");
    setShowForm(false);
  };

  const handleUpdate = async (input: WarehouseInput) => {
    if (!editing) return;
    await updateMut.mutateAsync({ id: editing.id, ...input });
    toast.success("Warehouse bijgewerkt");
    setEditing(null);
  };

  const handleDelete = async (wh: Warehouse) => {
    await deleteMut.mutateAsync(wh.id);
    toast.success(`${wh.name} verwijderd`);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[hsl(var(--background))]">
      {/* Header */}
      <div className="shrink-0 bg-card border-b border-border/40 px-6 py-5">
        <div className="max-w-[1320px] mx-auto flex items-start justify-between gap-4">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--gold-deep))]" style={{ fontFamily: "var(--font-display)" }}>
              Stamgegevens
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight mt-1" style={{ fontFamily: "var(--font-display)" }}>
              Warehouses
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5">
              Hub-adressen die bepalen of een zending als OPS, EXPORT of IMPORT wordt ingedeeld.
            </p>
          </div>
          {!showForm && !editing && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center justify-center h-10 px-[1.125rem] rounded-[0.625rem] text-sm font-medium cursor-pointer border border-transparent text-white relative overflow-hidden transition-all duration-200 hover:-translate-y-px gap-2"
              style={{
                background: "linear-gradient(180deg, hsl(0 78% 48%) 0%, hsl(0 78% 38%) 100%)",
                boxShadow: "0 1px 2px hsl(var(--primary) / 0.4), 0 4px 12px -2px hsl(var(--primary) / 0.3), inset 0 1px 0 hsl(0 0% 100% / 0.2), inset 0 -1px 0 hsl(0 0% 0% / 0.1)",
              }}
            >
              <Plus className="h-4 w-4" /> Warehouse toevoegen
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1320px] mx-auto px-6 pt-4 pb-8 space-y-4">
          {showForm && (
            <WarehouseForm
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
              saving={createMut.isPending}
            />
          )}

          {isLoading && (
            <div className="text-sm text-muted-foreground py-8 text-center">Laden…</div>
          )}

          {!isLoading && warehouses.length === 0 && !showForm && (
            <div className="card--luxe p-8 text-center">
              <WarehouseIcon className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-1">Nog geen warehouses ingesteld</p>
              <p className="text-xs text-muted-foreground/60">Voeg een warehouse toe om automatische afdeling-detectie in te schakelen.</p>
            </div>
          )}

          {warehouses.map(wh => (
            editing?.id === wh.id ? (
              <WarehouseForm
                key={wh.id}
                initial={wh}
                onSave={handleUpdate}
                onCancel={() => setEditing(null)}
                saving={updateMut.isPending}
              />
            ) : (
              <WarehouseCard
                key={wh.id}
                wh={wh}
                onEdit={() => setEditing(wh)}
                onDelete={() => handleDelete(wh)}
              />
            )
          ))}
        </div>
      </div>
    </div>
  );
}