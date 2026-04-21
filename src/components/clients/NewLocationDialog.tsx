import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateClientLocation } from "@/hooks/useClients";
import { composeAddressString } from "@/lib/validation/clientSchema";
import {
  AddressAutocomplete,
  EMPTY_ADDRESS,
  type AddressValue,
} from "@/components/clients/AddressAutocomplete";
import { toast } from "sonner";

interface Props {
  clientId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LocationType = "pickup" | "delivery" | "both";

interface FormState {
  label: string;
  location_type: LocationType;
  address: AddressValue;
  time_window_start: string;
  time_window_end: string;
  max_vehicle_length: string;
  notes: string;
}

const INITIAL: FormState = {
  label: "",
  location_type: "pickup",
  address: { ...EMPTY_ADDRESS },
  time_window_start: "",
  time_window_end: "",
  max_vehicle_length: "",
  notes: "",
};

export function NewLocationDialog({ clientId, open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [addressError, setAddressError] = useState<string | undefined>(undefined);

  const createLocation = useCreateClientLocation();

  const setAddress = (v: AddressValue) => {
    setForm((prev) => ({ ...prev, address: v }));
    if (v.lat !== null && v.lng !== null) setAddressError(undefined);
  };

  const handleClose = () => {
    setForm(INITIAL);
    setAddressError(undefined);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.label.trim()) {
      toast.error("Geef de locatie een label, bijvoorbeeld Magazijn Rotterdam");
      return;
    }

    const addr = form.address;
    if (!addr.street || !addr.city) {
      setAddressError("Selecteer een adres uit de suggesties");
      toast.error("Selecteer een adres uit de suggesties");
      return;
    }
    if (addr.lat === null || addr.lng === null) {
      setAddressError("Coordinaten zijn verplicht, selecteer adres of sleep de pin");
      toast.error("Coordinaten zijn verplicht, selecteer een adres of sleep de pin");
      return;
    }

    try {
      await createLocation.mutateAsync({
        client_id: clientId,
        label: form.label.trim(),
        location_type: form.location_type,
        address: composeAddressString(addr),
        zipcode: addr.zipcode || null,
        city: addr.city || null,
        country: addr.country || "NL",
        street: addr.street || null,
        house_number: addr.house_number || null,
        house_number_suffix: addr.house_number_suffix || null,
        lat: addr.lat,
        lng: addr.lng,
        coords_manual: addr.coords_manual,
        time_window_start: form.time_window_start || null,
        time_window_end: form.time_window_end || null,
        max_vehicle_length: form.max_vehicle_length.trim() || null,
        notes: form.notes.trim() || null,
      });

      toast.success("Locatie toegevoegd");
      handleClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij opslaan locatie");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : handleClose())}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg tracking-tight">Nieuwe locatie</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Basisgegevens">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Label *</Label>
                <Input
                  value={form.label}
                  onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Bijvoorbeeld Magazijn Rotterdam"
                  required
                  className="field-luxe"
                />
              </div>
              <div className="col-span-2">
                <Label>Type</Label>
                <Select
                  value={form.location_type}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, location_type: v as LocationType }))
                  }
                >
                  <SelectTrigger className="field-luxe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickup">Ophaal</SelectItem>
                    <SelectItem value="delivery">Aflever</SelectItem>
                    <SelectItem value="both">Ophaal en aflever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          <Section title="Adres">
            <AddressAutocomplete
              value={form.address}
              onChange={setAddress}
              error={addressError}
            />
          </Section>

          <Section title="Tijdvenster en voertuig">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tijdvenster start</Label>
                <Input
                  type="time"
                  value={form.time_window_start}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, time_window_start: e.target.value }))
                  }
                  className="field-luxe"
                />
              </div>
              <div>
                <Label>Tijdvenster einde</Label>
                <Input
                  type="time"
                  value={form.time_window_end}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, time_window_end: e.target.value }))
                  }
                  className="field-luxe"
                />
              </div>
              <div className="col-span-2">
                <Label>Maximale voertuiglengte (meter)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.max_vehicle_length}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, max_vehicle_length: e.target.value }))
                  }
                  placeholder="Bijvoorbeeld 12"
                  className="field-luxe"
                />
              </div>
            </div>
          </Section>

          <Section title="Notities">
            <Textarea
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Bijzonderheden voor de chauffeur, bijvoorbeeld bel bij aankomst"
              className="field-luxe min-h-[72px]"
            />
          </Section>

          <div className="flex justify-end gap-2 pt-3 border-t border-[hsl(var(--gold)/0.2)]">
            <button
              type="button"
              onClick={handleClose}
              className="btn-luxe btn-luxe--ghost !h-9"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={createLocation.isPending}
              className="btn-luxe btn-luxe--primary !h-9"
            >
              {createLocation.isPending ? "Opslaan..." : "Locatie toevoegen"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-display font-semibold text-[hsl(var(--gold-deep))] uppercase tracking-[0.14em] mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="label-luxe">{children}</span>;
}
