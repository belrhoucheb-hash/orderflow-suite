import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCreateClient } from "@/hooks/useClients";
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
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

  main_address: AddressValue;

  billing_same_as_main: boolean;
  billing_email: string;
  billing_address: AddressValue;

  shipping_same_as_main: boolean;
  shipping_address: AddressValue;
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
  main_address: { ...EMPTY_ADDRESS },
  billing_same_as_main: true,
  billing_email: "",
  billing_address: { ...EMPTY_ADDRESS },
  shipping_same_as_main: true,
  shipping_address: { ...EMPTY_ADDRESS },
};

export function NewClientDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createClient = useCreateClient();
  const createContact = useCreateClientContact();

  const setField = <K extends keyof FormState>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value as FormState[K] }));

  const setAddress = (key: "main_address" | "billing_address" | "shipping_address") =>
    (v: AddressValue) =>
      setForm((prev) => ({ ...prev, [key]: v }));

  const toggle = (key: "billing_same_as_main" | "shipping_same_as_main") =>
    (value: boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = clientInputSchema.safeParse({
      name: form.name,
      contact_person: form.contact_person,
      email: form.email,
      phone: form.phone,
      kvk_number: form.kvk_number,
      btw_number: form.btw_number,
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

      const created = await createClient.mutateAsync(payload);

      if (form.contact_person.trim()) {
        try {
          await createContact.mutateAsync({
            client_id: (created as any).id,
            name: form.contact_person.trim(),
            email: form.primary_email.trim() || form.email.trim() || null,
            phone: form.primary_phone.trim() || form.phone.trim() || null,
            role: "primary",
            is_active: true,
            notes: null,
          });
        } catch {
          toast.warning("Klant opgeslagen, primair contact kon niet worden toegevoegd");
        }
      }

      toast.success("Klant aangemaakt");
      setForm(INITIAL);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Fout bij aanmaken klant");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-lg tracking-tight">Nieuwe klant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
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
            </div>
          </Section>

          <Section title="Hoofdadres">
            <AddressAutocomplete
              value={form.main_address}
              onChange={setAddress("main_address")}
              error={errors["main_address.lat"] || errors["main_address.street"]}
            />
          </Section>

          <Section title="Primair contact">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Naam</Label>
                <Input
                  value={form.contact_person}
                  onChange={setField("contact_person")}
                  className="field-luxe"
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.primary_email}
                  onChange={setField("primary_email")}
                  className="field-luxe"
                />
              </div>
              <div>
                <Label>Telefoon</Label>
                <Input
                  value={form.primary_phone}
                  onChange={setField("primary_phone")}
                  className="field-luxe"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Wordt automatisch als primair contact geregistreerd bij deze klant.
            </p>
          </Section>

          <Section title="Algemeen e-mail en telefoon">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Algemeen e-mail</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={setField("email")}
                  className="field-luxe"
                />
              </div>
              <div>
                <Label>Algemeen telefoon</Label>
                <Input
                  value={form.phone}
                  onChange={setField("phone")}
                  className="field-luxe"
                />
              </div>
            </div>
          </Section>

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

          <Section title="Postadres">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-foreground">Postadres = hoofdadres</span>
              <Switch
                checked={form.shipping_same_as_main}
                onCheckedChange={toggle("shipping_same_as_main")}
              />
            </div>
            {!form.shipping_same_as_main && (
              <AddressAutocomplete
                value={form.shipping_address}
                onChange={setAddress("shipping_address")}
                error={
                  errors["shipping_address.lat"] || errors["shipping_address.street"]
                }
              />
            )}
          </Section>

          <div className="flex justify-end gap-2 pt-3 border-t border-[hsl(var(--gold)/0.2)]">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="btn-luxe btn-luxe--ghost !h-9"
            >
              Annuleren
            </button>
            <button
              type="submit"
              disabled={createClient.isPending}
              className="btn-luxe btn-luxe--primary !h-9"
            >
              {createClient.isPending ? "Opslaan..." : "Klant aanmaken"}
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

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-destructive mt-1">{children}</p>;
}
