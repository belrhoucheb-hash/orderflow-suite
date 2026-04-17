import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCreateClient } from "@/hooks/useClients";
import { useCreateClientContact } from "@/hooks/useClientContacts";
import { clientInputSchema } from "@/lib/validation/clientSchema";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INITIAL = {
  name: "",
  contact_person: "",
  primary_email: "",
  primary_phone: "",
  email: "",
  phone: "",
  address: "",
  zipcode: "",
  city: "",
  country: "NL",
  kvk_number: "",
  btw_number: "",
  billing_same_as_main: true,
  billing_email: "",
  billing_address: "",
  billing_zipcode: "",
  billing_city: "",
  billing_country: "NL",
  shipping_same_as_main: true,
  shipping_address: "",
  shipping_zipcode: "",
  shipping_city: "",
  shipping_country: "NL",
};

export function NewClientDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const createClient = useCreateClient();
  const createContact = useCreateClientContact();

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const toggle = (key: "billing_same_as_main" | "shipping_same_as_main") =>
    (value: boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = clientInputSchema.safeParse({
      ...form,
      payment_terms: 30,
    });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path.join(".")] = i.message;
      });
      setErrors(map);
      return;
    }
    setErrors({});

    try {
      const payload: Record<string, unknown> = {
        name: parsed.data.name,
        contact_person: parsed.data.contact_person || null,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        address: parsed.data.address || null,
        zipcode: parsed.data.zipcode || null,
        city: parsed.data.city || null,
        country: parsed.data.country || "NL",
        kvk_number: parsed.data.kvk_number || null,
        btw_number: parsed.data.btw_number || null,
        billing_same_as_main: parsed.data.billing_same_as_main,
        billing_email: parsed.data.billing_email || null,
        billing_address: parsed.data.billing_address || null,
        billing_zipcode: parsed.data.billing_zipcode || null,
        billing_city: parsed.data.billing_city || null,
        billing_country: parsed.data.billing_country || null,
        shipping_same_as_main: parsed.data.shipping_same_as_main,
        shipping_address: parsed.data.shipping_address || null,
        shipping_zipcode: parsed.data.shipping_zipcode || null,
        shipping_city: parsed.data.shipping_city || null,
        shipping_country: parsed.data.shipping_country || null,
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
          // client is al aangemaakt; contact-fail mag niet de hele flow stoppen
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
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nieuwe klant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Bedrijfsgegevens">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Bedrijfsnaam *</Label>
                <Input value={form.name} onChange={set("name")} required />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
              </div>
              <div>
                <Label>KvK-nummer</Label>
                <Input value={form.kvk_number} onChange={set("kvk_number")} />
              </div>
              <div>
                <Label>BTW-nummer</Label>
                <Input value={form.btw_number} onChange={set("btw_number")} />
              </div>
            </div>
          </Section>

          <Section title="Hoofdadres">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Adres</Label>
                <Input value={form.address} onChange={set("address")} />
              </div>
              <div>
                <Label>Postcode</Label>
                <Input value={form.zipcode} onChange={set("zipcode")} />
              </div>
              <div>
                <Label>Plaats</Label>
                <Input value={form.city} onChange={set("city")} />
              </div>
            </div>
          </Section>

          <Section title="Primair contact">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Naam</Label>
                <Input value={form.contact_person} onChange={set("contact_person")} />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={form.primary_email}
                  onChange={set("primary_email")}
                />
              </div>
              <div>
                <Label>Telefoon</Label>
                <Input value={form.primary_phone} onChange={set("primary_phone")} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Wordt automatisch als primair contact geregistreerd bij deze klant.
            </p>
          </Section>

          <Section title="Algemeen e-mail en telefoon">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Algemeen e-mail</Label>
                <Input type="email" value={form.email} onChange={set("email")} />
              </div>
              <div>
                <Label>Algemeen telefoon</Label>
                <Input value={form.phone} onChange={set("phone")} />
              </div>
            </div>
          </Section>

          <Section title="Facturatie">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">Factuuradres = hoofdadres</span>
              <Switch
                checked={form.billing_same_as_main}
                onCheckedChange={toggle("billing_same_as_main")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Factuur e-mail</Label>
                <Input
                  type="email"
                  value={form.billing_email}
                  onChange={set("billing_email")}
                  placeholder="Leeg = gebruik algemeen e-mail"
                />
                {errors.billing_email && (
                  <p className="text-xs text-destructive mt-1">{errors.billing_email}</p>
                )}
              </div>
              {!form.billing_same_as_main && (
                <>
                  <div className="col-span-2">
                    <Label>Factuuradres</Label>
                    <Input value={form.billing_address} onChange={set("billing_address")} />
                    {errors.billing_address && (
                      <p className="text-xs text-destructive mt-1">{errors.billing_address}</p>
                    )}
                  </div>
                  <div>
                    <Label>Postcode</Label>
                    <Input value={form.billing_zipcode} onChange={set("billing_zipcode")} />
                  </div>
                  <div>
                    <Label>Plaats</Label>
                    <Input value={form.billing_city} onChange={set("billing_city")} />
                    {errors.billing_city && (
                      <p className="text-xs text-destructive mt-1">{errors.billing_city}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </Section>

          <Section title="Postadres">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-foreground">Postadres = hoofdadres</span>
              <Switch
                checked={form.shipping_same_as_main}
                onCheckedChange={toggle("shipping_same_as_main")}
              />
            </div>
            {!form.shipping_same_as_main && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Postadres</Label>
                  <Input value={form.shipping_address} onChange={set("shipping_address")} />
                  {errors.shipping_address && (
                    <p className="text-xs text-destructive mt-1">{errors.shipping_address}</p>
                  )}
                </div>
                <div>
                  <Label>Postcode</Label>
                  <Input value={form.shipping_zipcode} onChange={set("shipping_zipcode")} />
                </div>
                <div>
                  <Label>Plaats</Label>
                  <Input value={form.shipping_city} onChange={set("shipping_city")} />
                  {errors.shipping_city && (
                    <p className="text-xs text-destructive mt-1">{errors.shipping_city}</p>
                  )}
                </div>
              </div>
            )}
          </Section>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={createClient.isPending}>
              {createClient.isPending ? "Opslaan..." : "Klant aanmaken"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
