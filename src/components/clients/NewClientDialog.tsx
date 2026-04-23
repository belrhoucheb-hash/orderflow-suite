import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateClient,
  useUpdateClient,
  useClientDuplicateCheck,
  type Client,
} from "@/hooks/useClients";
import { useCreateClientContact } from "@/hooks/useClientContacts";
import {
  clientInputSchema,
  composeAddressString,
  type AddressFields,
} from "@/lib/validation/clientSchema";
import {
  AddressAutocomplete,
  EMPTY_ADDRESS,
  type AddressValue,
} from "@/components/clients/AddressAutocomplete";
import { CompanyLookupBar } from "@/components/clients/CompanyLookupBar";
import type { CompanyDetails } from "@/hooks/useCompanyLookup";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
}

interface FormState {
  name: string;
  contact_person: string;
  primary_email: string;
  primary_phone: string;
  email: string;
  phone: string;
  kvk_number: string;
  btw_number: string;
  debtor_number: string;

  main_address: AddressValue;

  billing_same_as_main: boolean;
  billing_email: string;
  billing_address: AddressValue;

  shipping_same_as_main: boolean;
  shipping_address: AddressValue;

  notes: string;
}

const INITIAL: FormState = {
  name: "",
  contact_person: "",
  primary_email: "",
  primary_phone: "",
  email: "",
  phone: "",
  kvk_number: "",
  btw_number: "",
  debtor_number: "",
  main_address: { ...EMPTY_ADDRESS },
  billing_same_as_main: true,
  billing_email: "",
  billing_address: { ...EMPTY_ADDRESS },
  shipping_same_as_main: true,
  shipping_address: { ...EMPTY_ADDRESS },
  notes: "",
};

function addressFromClient(c: Client, prefix: "" | "billing_" | "shipping_"): AddressValue {
  const street = (c as any)[`${prefix}street`] ?? "";
  const house_number = (c as any)[`${prefix}house_number`] ?? "";
  const house_number_suffix = (c as any)[`${prefix}house_number_suffix`] ?? "";
  const zipcode = (c as any)[`${prefix}zipcode`] ?? "";
  const city = (c as any)[`${prefix}city`] ?? "";
  const country = (c as any)[`${prefix}country`] ?? "NL";
  const lat = (c as any)[`${prefix}lat`] ?? null;
  const lng = (c as any)[`${prefix}lng`] ?? null;
  const coords_manual = (c as any)[`${prefix}coords_manual`] ?? false;
  return { street, house_number, house_number_suffix, zipcode, city, country, lat, lng, coords_manual };
}

function formFromClient(c: Client): FormState {
  return {
    name: c.name ?? "",
    contact_person: c.contact_person ?? "",
    primary_email: "",
    primary_phone: "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    kvk_number: c.kvk_number ?? "",
    btw_number: c.btw_number ?? "",
    debtor_number: c.debtor_number ?? "",
    main_address: addressFromClient(c, ""),
    billing_same_as_main: c.billing_same_as_main ?? true,
    billing_email: c.billing_email ?? "",
    billing_address: addressFromClient(c, "billing_"),
    shipping_same_as_main: c.shipping_same_as_main ?? true,
    shipping_address: addressFromClient(c, "shipping_"),
    notes: c.notes ?? "",
  };
}

export function NewClientDialog({ open, onOpenChange, client }: Props) {
  const isEdit = Boolean(client);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Snapshot van de initiële waarde voor dirty-check. Bij elke open reset.
  const [initialForm, setInitialForm] = useState<FormState>(INITIAL);
  const [pendingClose, setPendingClose] = useState(false);

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const createContact = useCreateClientContact();

  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);
  const { duplicate } = useClientDuplicateCheck(form.kvk_number, client?.id);
  const blockedByDuplicate = Boolean(duplicate) && !duplicateAcknowledged;

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setDuplicateAcknowledged(false);
    const base = client ? formFromClient(client) : INITIAL;
    setForm(base);
    setInitialForm(base);
    setPendingClose(false);
  }, [open, client]);

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(initialForm),
    [form, initialForm],
  );

  const requestClose = (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (isDirty) {
      setPendingClose(true);
      return;
    }
    onOpenChange(false);
  };

  const confirmDiscard = () => {
    setPendingClose(false);
    onOpenChange(false);
  };

  const setField = <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value as FormState[K] }));

  const setAddress = (key: "main_address" | "billing_address" | "shipping_address") =>
    (v: AddressValue) =>
      setForm((prev) => ({ ...prev, [key]: v }));

  const applyCompanyLookup = async (r: CompanyDetails) => {
    setForm((prev) => ({
      ...prev,
      name: r.name || prev.name,
      // KvK-nummer niet automatisch invullen: Google Places kent het
      // Handelsregister niet, dus dat veld blijft handmatig.
      primary_phone: r.phone || prev.primary_phone,
    }));

    const addressQuery = [
      [r.street, r.house_number].filter(Boolean).join(" "),
      [r.zipcode, r.city].filter(Boolean).join(" "),
    ]
      .filter(Boolean)
      .join(", ");

    // Zonder coordinaten faalt de save (zie clientSchema). We proberen
    // via Google Geocoder lat/lng te resolveren; pattern uit
    // AddressAutocomplete.onMarkerDragEnd.
    if (!addressQuery || typeof google === "undefined" || !google.maps?.Geocoder) {
      setForm((prev) => ({
        ...prev,
        main_address: {
          ...prev.main_address,
          street: r.street,
          house_number: r.house_number,
          zipcode: r.zipcode,
          city: r.city,
          country: r.country || "NL",
        },
      }));
      toast.warning("Adres gevonden, bevestig via het adresveld om coordinaten te zetten");
      return;
    }

    try {
      const geocoder = new google.maps.Geocoder();
      const res = await geocoder.geocode({
        address: addressQuery,
        componentRestrictions: { country: r.country || "NL" },
      });
      const first = res.results[0];
      const lat = first?.geometry?.location?.lat() ?? null;
      const lng = first?.geometry?.location?.lng() ?? null;

      setForm((prev) => ({
        ...prev,
        main_address: {
          street: r.street,
          house_number: r.house_number,
          house_number_suffix: "",
          zipcode: r.zipcode,
          city: r.city,
          country: r.country || "NL",
          lat,
          lng,
          coords_manual: false,
        },
      }));

      if (lat === null) {
        toast.warning("Adres uit KvK geladen, coordinaten niet gevonden, sleep pin op kaart");
      } else {
        toast.success(`Gegevens van ${r.name} geladen`);
      }
    } catch {
      setForm((prev) => ({
        ...prev,
        main_address: {
          ...prev.main_address,
          street: r.street,
          house_number: r.house_number,
          zipcode: r.zipcode,
          city: r.city,
          country: r.country || "NL",
        },
      }));
      toast.warning("Adres uit KvK geladen, coordinaten niet beschikbaar");
    }
  };

  const toggle = (key: "billing_same_as_main" | "shipping_same_as_main") =>
    (value: boolean) =>
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        if (!value) {
          // Toggle van AAN naar UIT: reset het losse adres naar leeg.
          // Zonder reset bleven oude billing_*-velden (vaak een kopie van
          // hoofdadres uit een eerdere save) staan, waardoor de gebruiker
          // stilzwijgend een duplicaat opsloeg en het detailpaneel hetzelfde
          // adres onder Hoofd en Factuur toonde.
          const addressKey =
            key === "billing_same_as_main" ? "billing_address" : "shipping_address";
          next[addressKey] = { ...EMPTY_ADDRESS };
        }
        return next;
      });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (blockedByDuplicate) {
      toast.error("Bevestig eerst dat je een klant met bestaand KvK-nummer wilt aanmaken");
      return;
    }

    const parsed = clientInputSchema.safeParse({
      name: form.name,
      contact_person: form.contact_person,
      email: form.email,
      phone: form.phone,
      kvk_number: form.kvk_number,
      btw_number: form.btw_number,
      debtor_number: form.debtor_number,
      payment_terms: 30,
      main_address: form.main_address,
      billing_same_as_main: form.billing_same_as_main,
      billing_email: form.billing_email,
      billing_address: form.billing_address,
      shipping_same_as_main: form.shipping_same_as_main,
      shipping_address: form.shipping_address,
    });

    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path.join(".")] = i.message;
      });
      setErrors(map);
      toast.error("Controleer de adresvelden, coordinaten zijn verplicht");
      return;
    }
    setErrors({});

    const main = parsed.data.main_address;
    const billing = parsed.data.billing_same_as_main ? main : parsed.data.billing_address;
    const shipping = parsed.data.shipping_same_as_main ? main : parsed.data.shipping_address;

    try {
      const payload: Record<string, unknown> = {
        name: parsed.data.name,
        contact_person: parsed.data.contact_person || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        kvk_number: parsed.data.kvk_number || null,
        btw_number: parsed.data.btw_number || null,
        debtor_number: parsed.data.debtor_number || null,

        address: composeAddressString(main) || null,
        zipcode: main.zipcode || null,
        city: main.city || null,
        country: main.country || "NL",
        street: main.street || null,
        house_number: main.house_number || null,
        house_number_suffix: main.house_number_suffix || null,
        lat: main.lat,
        lng: main.lng,
        coords_manual: main.coords_manual,

        billing_same_as_main: parsed.data.billing_same_as_main,
        billing_email: parsed.data.billing_email || null,
        billing_address: composeAddressString(billing) || null,
        billing_zipcode: billing.zipcode || null,
        billing_city: billing.city || null,
        billing_country: billing.country || null,
        billing_street: billing.street || null,
        billing_house_number: billing.house_number || null,
        billing_house_number_suffix: billing.house_number_suffix || null,
        billing_lat: billing.lat,
        billing_lng: billing.lng,
        billing_coords_manual: billing.coords_manual,

        shipping_same_as_main: parsed.data.shipping_same_as_main,
        shipping_address: composeAddressString(shipping) || null,
        shipping_zipcode: shipping.zipcode || null,
        shipping_city: shipping.city || null,
        shipping_country: shipping.country || null,
        shipping_street: shipping.street || null,
        shipping_house_number: shipping.house_number || null,
        shipping_house_number_suffix: shipping.house_number_suffix || null,
        shipping_lat: shipping.lat,
        shipping_lng: shipping.lng,
        shipping_coords_manual: shipping.coords_manual,
      };

      if (isEdit && client) {
        await updateClient.mutateAsync({
          id: client.id,
          ...(payload as Partial<Client>),
          notes: form.notes.trim() ? form.notes : null,
        });
        toast.success("Klant bijgewerkt");
        // Markeer form als "schoon" zodat requestClose direct sluit.
        setInitialForm(form);
        onOpenChange(false);
        return;
      }

      const created = await createClient.mutateAsync(payload);

      if (form.contact_person.trim()) {
        try {
          const contact = await createContact.mutateAsync({
            client_id: (created as any).id,
            name: form.contact_person.trim(),
            email: form.primary_email.trim() || form.email.trim() || null,
            phone: form.primary_phone.trim() || form.phone.trim() || null,
            role: "primary",
            is_active: true,
            notes: null,
          });
          await updateClient.mutateAsync({
            id: (created as any).id,
            primary_contact_id: contact.id,
          });
        } catch {
          toast.warning("Klant opgeslagen, primair contact kon niet worden toegevoegd");
        }
      }

      toast.success("Klant aangemaakt");
      setForm(INITIAL);
      setInitialForm(INITIAL);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? (isEdit ? "Fout bij bijwerken klant" : "Fout bij aanmaken klant"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent
        className="sm:max-w-3xl max-h-[92vh] overflow-y-auto"
        onPointerDownOutside={(e) => {
          if ((e.target as HTMLElement).closest(".pac-container")) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if ((e.target as HTMLElement).closest(".pac-container")) {
            e.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-lg tracking-tight">{isEdit ? "Klant bewerken" : "Nieuwe klant"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {!isEdit && <CompanyLookupBar onSelect={applyCompanyLookup} />}
          <Section title="Bedrijfsgegevens">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Bedrijfsnaam *</Label>
                <Input
                  value={form.name}
                  onChange={setField("name")}
                  required
                  className="field-luxe"
                />
                {errors.name && <ErrorText>{errors.name}</ErrorText>}
              </div>
              <div>
                <Label>KvK-nummer</Label>
                <Input
                  value={form.kvk_number}
                  onChange={setField("kvk_number")}
                  className="field-luxe"
                />
              </div>
              <div>
                <Label>BTW-nummer</Label>
                <Input
                  value={form.btw_number}
                  onChange={setField("btw_number")}
                  className="field-luxe"
                />
              </div>
              <div className="col-span-2">
                <Label>Debiteurnummer</Label>
                <Input
                  value={form.debtor_number}
                  onChange={setField("debtor_number")}
                  placeholder="Bijv. 10042"
                  className="field-luxe"
                />
              </div>
              {duplicate && (
                <div
                  role="alert"
                  className="col-span-2 rounded-md border border-amber-400/60 bg-amber-50 text-amber-900 px-3 py-2 text-sm space-y-2"
                >
                  <p>
                    Er bestaat al een klant met dit KvK-nummer: <strong>{duplicate.name}</strong>. Weet je zeker dat je doorgaat?
                  </p>
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={duplicateAcknowledged}
                      onChange={(e) => setDuplicateAcknowledged(e.target.checked)}
                    />
                    <span>Ja, toch aanmaken</span>
                  </label>
                </div>
              )}
            </div>
          </Section>

          <Section title="Hoofdadres">
            <AddressAutocomplete
              value={form.main_address}
              onChange={setAddress("main_address")}
              error={errors["main_address.lat"] || errors["main_address.street"]}
            />
          </Section>

          {!isEdit && (
            <Section title="Primair contact">
              <div>
                <Label>Naam</Label>
                <Input
                  value={form.contact_person}
                  onChange={setField("contact_person")}
                  className="field-luxe"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Wordt automatisch als primair contact geregistreerd bij deze klant. Voor bestaande klanten beheer je contacten via het tabblad Contacten.
              </p>
            </Section>
          )}

          <Section title="Facturatie">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-foreground">Factuuradres = hoofdadres</span>
              <Switch
                checked={form.billing_same_as_main}
                onCheckedChange={toggle("billing_same_as_main")}
              />
            </div>
            <div className="space-y-3">
              <div>
                <Label>Factuur e-mail</Label>
                <Input
                  type="email"
                  value={form.billing_email}
                  onChange={setField("billing_email")}
                  placeholder="Leeg = gebruik algemeen e-mail"
                  className="field-luxe"
                />
                {errors.billing_email && <ErrorText>{errors.billing_email}</ErrorText>}
              </div>
              {!form.billing_same_as_main && (
                <AddressAutocomplete
                  value={form.billing_address}
                  onChange={setAddress("billing_address")}
                  error={
                    errors["billing_address.lat"] || errors["billing_address.street"]
                  }
                />
              )}
            </div>
          </Section>

          {isEdit && (
            <Section title="Notities">
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Vrije notitie over deze klant, afspraken, aandachtspunten..."
                className="field-luxe min-h-[100px] text-sm"
              />
              <p className="text-xs text-muted-foreground mt-2">
                Wijzigingen aan notities worden geregistreerd in de historie.
              </p>
            </Section>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[hsl(var(--gold)/0.2)]">
            <button
              type="button"
              onClick={() => requestClose(false)}
              className="btn-luxe btn-luxe--ghost !h-9"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={createClient.isPending || updateClient.isPending || blockedByDuplicate}
              className="btn-luxe btn-luxe--primary !h-9"
            >
              {(createClient.isPending || updateClient.isPending)
                ? "Opslaan..."
                : isEdit ? "Wijzigingen opslaan" : "Klant aanmaken"}
            </button>
          </div>
        </form>
      </DialogContent>
      <AlertDialog
        open={pendingClose}
        onOpenChange={(o) => !o && setPendingClose(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wijzigingen weggooien?</AlertDialogTitle>
            <AlertDialogDescription>
              Je hebt wijzigingen die nog niet zijn opgeslagen. Sluit je de dialog nu,
              dan gaan ze verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Doorgaan met bewerken</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Wijzigingen weggooien
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-destructive mt-1">{children}</p>;
}
