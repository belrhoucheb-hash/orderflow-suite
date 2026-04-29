import { useMemo, useState } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDriverCountryRestrictions,
  type DriverCountryRestriction,
} from "@/hooks/useDriverCountryRestrictions";
import type { DriverCountryRestrictionType } from "@/lib/driverCountryRestrictions";

interface Props {
  driverId: string;
}

const COUNTRY_OPTIONS = [
  { code: "NL", label: "Nederland" },
  { code: "BE", label: "Belgie" },
  { code: "DE", label: "Duitsland" },
  { code: "FR", label: "Frankrijk" },
  { code: "LU", label: "Luxemburg" },
];

const INITIAL_FORM = {
  country_code: "DE",
  restriction_type: "block" as DriverCountryRestrictionType,
  reason: "",
  active_from: "",
  active_until: "",
};

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parts = value.split("-");
  if (parts.length !== 3) return value;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export function DriverCountryRestrictionsSection({ driverId }: Props) {
  const { data: restrictions = [], isLoading, upsertRestriction, deleteRestriction } =
    useDriverCountryRestrictions(driverId);
  const [editing, setEditing] = useState<DriverCountryRestriction | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);

  const sorted = useMemo(
    () =>
      [...restrictions].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return a.country_code.localeCompare(b.country_code);
      }),
    [restrictions],
  );

  const resetForm = () => {
    setEditing(null);
    setForm(INITIAL_FORM);
  };

  const startEdit = (restriction: DriverCountryRestriction) => {
    setEditing(restriction);
    setForm({
      country_code: restriction.country_code,
      restriction_type: restriction.restriction_type,
      reason: restriction.reason ?? "",
      active_from: restriction.active_from ?? "",
      active_until: restriction.active_until ?? "",
    });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.active_from && form.active_until && form.active_until < form.active_from) {
      toast.error("Einddatum moet na begindatum liggen");
      return;
    }

    try {
      await upsertRestriction.mutateAsync({
        id: editing?.id,
        driver_id: driverId,
        country_code: form.country_code,
        restriction_type: form.restriction_type,
        reason: form.reason,
        active_from: form.active_from || null,
        active_until: form.active_until || null,
        is_active: true,
      });
      toast.success(editing ? "Landrestrictie bijgewerkt" : "Landrestrictie toegevoegd");
      resetForm();
    } catch (err: any) {
      toast.error(err?.message ?? "Opslaan mislukt");
    }
  };

  const onDelete = async (restriction: DriverCountryRestriction) => {
    try {
      await deleteRestriction.mutateAsync(restriction.id);
      toast.success("Landrestrictie verwijderd");
      if (editing?.id === restriction.id) resetForm();
    } catch (err: any) {
      toast.error(err?.message ?? "Verwijderen mislukt");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-xs text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Blokkades stoppen planning op ritten naar dat land. Waarschuwingen blijven planbaar,
          maar worden zichtbaar bij de chauffeurkeuze.
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="space-y-2 md:col-span-3">
          <Label>Land</Label>
          <Select
            value={form.country_code}
            onValueChange={(value) => setForm((prev) => ({ ...prev, country_code: value }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNTRY_OPTIONS.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.code} - {country.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-3">
          <Label>Type</Label>
          <Select
            value={form.restriction_type}
            onValueChange={(value: DriverCountryRestrictionType) =>
              setForm((prev) => ({ ...prev, restriction_type: value }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="block">Blokkade</SelectItem>
              <SelectItem value="warning">Waarschuwing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 md:col-span-3">
          <Label>Vanaf</Label>
          <Input
            type="date"
            value={form.active_from}
            onChange={(event) => setForm((prev) => ({ ...prev, active_from: event.target.value }))}
          />
        </div>

        <div className="space-y-2 md:col-span-3">
          <Label>Tot en met</Label>
          <Input
            type="date"
            value={form.active_until}
            onChange={(event) => setForm((prev) => ({ ...prev, active_until: event.target.value }))}
          />
        </div>

        <div className="space-y-2 md:col-span-9">
          <Label>Reden</Label>
          <Textarea
            value={form.reason}
            onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
            placeholder="Bijv. alcoholverbod in Duitsland"
            className="min-h-[74px]"
          />
        </div>

        <div className="flex gap-2 md:col-span-3">
          <Button type="submit" disabled={upsertRestriction.isPending} className="flex-1">
            <Plus className="h-4 w-4 mr-1" />
            {editing ? "Bijwerken" : "Toevoegen"}
          </Button>
          {editing && (
            <Button type="button" variant="outline" onClick={resetForm}>
              Annuleer
            </Button>
          )}
        </div>
      </form>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Restricties laden...</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          Geen landrestricties vastgelegd.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Land</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>Reden</TableHead>
              <TableHead className="text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((restriction) => (
              <TableRow key={restriction.id}>
                <TableCell className="font-semibold">{restriction.country_code}</TableCell>
                <TableCell>
                  <Badge variant={restriction.restriction_type === "block" ? "destructive" : "outline"}>
                    {restriction.restriction_type === "block" ? "Blokkade" : "Waarschuwing"}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs tabular-nums">
                  {formatDate(restriction.active_from)} t/m {formatDate(restriction.active_until)}
                </TableCell>
                <TableCell className="max-w-[260px] truncate text-xs">
                  {restriction.reason || "-"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => startEdit(restriction)}
                      aria-label="Landrestrictie bewerken"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDelete(restriction)}
                      disabled={deleteRestriction.isPending}
                      aria-label="Landrestrictie verwijderen"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
