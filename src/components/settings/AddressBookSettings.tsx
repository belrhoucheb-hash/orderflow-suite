import { useMemo, useState } from "react";
import { Edit2, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  AddressAutocomplete,
  EMPTY_ADDRESS,
  type AddressValue,
} from "@/components/clients/AddressAutocomplete";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddressBookEntries,
  useDeleteAddressBookEntry,
  useUpdateAddressBookEntry,
  useUpsertAddressBookEntry,
  type AddressBookEntry,
} from "@/hooks/useAddressBook";
import { buildAddressBookKey } from "@/lib/addressBook";
import { composeAddressString } from "@/lib/validation/clientSchema";
import { cn } from "@/lib/utils";

type LocationType = "pickup" | "delivery" | "both";

interface AddressBookFormState {
  companyName: string;
  aliases: string;
  address: AddressValue;
  locationType: LocationType;
  timeWindowStart: string;
  timeWindowEnd: string;
  notes: string;
}

const emptyForm: AddressBookFormState = {
  companyName: "",
  aliases: "",
  address: { ...EMPTY_ADDRESS, country: "NL" },
  locationType: "both",
  timeWindowStart: "",
  timeWindowEnd: "",
  notes: "",
};

function entryToAddress(entry: AddressBookEntry): AddressValue {
  return {
    street: entry.street || "",
    house_number: entry.house_number || "",
    house_number_suffix: entry.house_number_suffix || "",
    zipcode: entry.zipcode || "",
    city: entry.city || "",
    country: entry.country || "NL",
    lat: entry.lat,
    lng: entry.lng,
    coords_manual: entry.coords_manual,
  };
}

function formFromEntry(entry: AddressBookEntry): AddressBookFormState {
  return {
    companyName: entry.company_name || entry.label,
    aliases: (entry.aliases ?? []).join(", "),
    address: entryToAddress(entry),
    locationType: entry.location_type,
    timeWindowStart: entry.time_window_start || "",
    timeWindowEnd: entry.time_window_end || "",
    notes: entry.notes || "",
  };
}

function locationTypeLabel(value: LocationType) {
  if (value === "pickup") return "Laden";
  if (value === "delivery") return "Lossen";
  return "Laden en lossen";
}

function formatLastUsed(value: string | null) {
  if (!value) return "Nog niet";
  return new Date(value).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

export function AddressBookSettings() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AddressBookEntry | null>(null);
  const [form, setForm] = useState<AddressBookFormState>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<AddressBookEntry | null>(null);

  const { data: entries = [], isLoading } = useAddressBookEntries(search);
  const createEntry = useUpsertAddressBookEntry();
  const updateEntry = useUpdateAddressBookEntry();
  const deleteEntry = useDeleteAddressBookEntry();

  const addressKey = buildAddressBookKey(form.address);
  const sameAddressCompanies = useMemo(() => {
    if (!form.address.street.trim()) return [];
    return entries.filter((entry) => {
      if (editing?.id === entry.id) return false;
      return entry.normalized_key === addressKey;
    });
  }, [addressKey, editing?.id, entries, form.address.street]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (entry: AddressBookEntry) => {
    setEditing(entry);
    setForm(formFromEntry(entry));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    const companyName = form.companyName.trim();
    const address = composeAddressString(form.address, { includeLocality: true });
    if (!companyName || !address) {
      toast.error("Vul bedrijf en adres in");
      return;
    }

    const payload = {
      label: companyName,
      company_name: companyName,
      aliases: form.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
      address,
      street: form.address.street,
      house_number: form.address.house_number,
      house_number_suffix: form.address.house_number_suffix,
      zipcode: form.address.zipcode,
      city: form.address.city,
      country: form.address.country || "NL",
      lat: form.address.lat,
      lng: form.address.lng,
      coords_manual: form.address.coords_manual,
      location_type: form.locationType,
      time_window_start: form.timeWindowStart || null,
      time_window_end: form.timeWindowEnd || null,
      notes: form.notes || null,
      source: "manual",
    };

    try {
      if (editing) {
        await updateEntry.mutateAsync({ id: editing.id, input: payload });
        toast.success("Adresboek bijgewerkt");
      } else {
        const result = await createEntry.mutateAsync(payload);
        toast.success(result?.message || "Adresboek bijgewerkt", {
          description: result?.matchedName && result.matchedName !== companyName
            ? `${companyName} is gekoppeld aan ${result.matchedName}.`
            : undefined,
        });
      }
      closeDialog();
    } catch (error) {
      toast.error("Opslaan mislukt", {
        description: error instanceof Error ? error.message : "Controleer of dit bedrijf/adres al bestaat.",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEntry.mutateAsync(deleteTarget.id);
      toast.success("Adres verwijderd");
      setDeleteTarget(null);
    } catch (error) {
      toast.error("Verwijderen mislukt", {
        description: error instanceof Error ? error.message : "Probeer het opnieuw.",
      });
    }
  };

  const keepGooglePlacesInsideDialog = (event: Event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".pac-container")) {
      event.preventDefault();
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 px-1 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--gold)/0.3)]"
            style={{ background: "linear-gradient(135deg, hsl(var(--gold-soft)/0.8), hsl(var(--gold-soft)/0.25))" }}
          >
            <MapPin className="h-4 w-4 text-[hsl(var(--gold-deep))]" strokeWidth={1.5} />
          </div>
          <div>
            <h3 className="text-lg font-bold">Adresboek</h3>
            <p className="text-xs text-muted-foreground">Beheer vaste laad- en losadressen voor order-autocomplete.</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Zoek bedrijf, straat, plaats"
            className="h-8 min-w-[220px] text-xs"
          />
          <button type="button" onClick={openCreate} className="btn-luxe btn-luxe--primary !h-8">
            <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />Toevoegen
          </button>
        </div>
      </div>

      <Card className="card--luxe overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
            Laden...
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-[hsl(var(--gold-soft)/0.3)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[220px] text-xs font-semibold uppercase tracking-wider">Bedrijf</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wider">Adres</TableHead>
                <TableHead className="w-[140px] text-xs font-semibold uppercase tracking-wider">Type</TableHead>
                <TableHead className="w-[130px] text-xs font-semibold uppercase tracking-wider">Gebruikt</TableHead>
                <TableHead className="w-[92px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                    Nog geen adressen gevonden. Voeg vaste laad- en losadressen toe.
                  </TableCell>
                </TableRow>
              )}
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <div className="text-xs font-semibold text-foreground">{entry.company_name || entry.label}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{entry.city || entry.country}</div>
                    {entry.aliases && entry.aliases.length > 0 && (
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        Alias: {entry.aliases.join(", ")}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{entry.address}</TableCell>
                  <TableCell>
                    <span className={cn(
                      "inline-flex rounded-full px-2 py-1 text-[11px] font-medium",
                      entry.location_type === "pickup" && "bg-emerald-50 text-emerald-700",
                      entry.location_type === "delivery" && "bg-blue-50 text-blue-700",
                      entry.location_type === "both" && "bg-[hsl(var(--gold-soft)/0.45)] text-[hsl(var(--gold-deep))]",
                    )}>
                      {locationTypeLabel(entry.location_type)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {entry.usage_count}x
                    <div className="mt-1 text-[11px]">{formatLastUsed(entry.last_used_at)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Bewerken ${entry.company_name || entry.label}`}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => openEdit(entry)}
                      >
                        <Edit2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Verwijderen ${entry.company_name || entry.label}`}
                        className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setDeleteTarget(entry)}
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

      <Dialog open={dialogOpen} onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={keepGooglePlacesInsideDialog}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Adres bewerken" : "Adres toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <div>
                <label className="label-luxe">Bedrijf</label>
                <Input
                  value={form.companyName}
                  onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                  placeholder="Royalty Cargo Solutions BV"
                />
              </div>
              <div>
                <label className="label-luxe">Type</label>
                <Select
                  value={form.locationType}
                  onValueChange={(value) => setForm((current) => ({ ...current, locationType: value as LocationType }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="both">Laden en lossen</SelectItem>
                    <SelectItem value="pickup">Laden</SelectItem>
                    <SelectItem value="delivery">Lossen</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="label-luxe">Aliassen / handelsnamen</label>
              <Input
                value={form.aliases}
                onChange={(event) => setForm((current) => ({ ...current, aliases: event.target.value }))}
                placeholder="RCS, Royalty Cargo"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Komma-gescheiden. Hiermee kun je zoeken op afkortingen of handelsnamen.
              </p>
            </div>

            <AddressAutocomplete
              value={form.address}
              onChange={(address) => setForm((current) => ({ ...current, address }))}
              searchLabel="Adres"
              searchPlaceholder="Typ bedrijfsnaam, straat of plaats"
            />

            {sameAddressCompanies.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Op dit adres staan al: {sameAddressCompanies.map((entry) => entry.company_name || entry.label).join(", ")}.
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="label-luxe">Tijdvenster vanaf</label>
                <Input
                  type="time"
                  value={form.timeWindowStart}
                  onChange={(event) => setForm((current) => ({ ...current, timeWindowStart: event.target.value }))}
                />
              </div>
              <div>
                <label className="label-luxe">Tijdvenster tot</label>
                <Input
                  type="time"
                  value={form.timeWindowEnd}
                  onChange={(event) => setForm((current) => ({ ...current, timeWindowEnd: event.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="label-luxe">Notities</label>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Dock, contactpersoon, instructies"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={closeDialog}>
                <X className="mr-2 h-4 w-4" />Annuleren
              </Button>
              <Button onClick={handleSave} disabled={createEntry.isPending || updateEntry.isPending}>
                {(createEntry.isPending || updateEntry.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Opslaan
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Adres verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>
              Dit verwijdert "{deleteTarget?.company_name || deleteTarget?.label}" uit het adresboek. Historische orders blijven ongewijzigd.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
