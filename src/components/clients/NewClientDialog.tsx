import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCreateClient } from "@/hooks/useClients";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewClientDialog({ open, onOpenChange }: Props) {
  const [form, setForm] = useState({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    zipcode: "",
    city: "",
    kvk_number: "",
    btw_number: "",
  });

  const createClient = useCreateClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    try {
      await createClient.mutateAsync(form);
      toast.success("Klant aangemaakt");
      onOpenChange(false);
      setForm({ name: "", contact_person: "", email: "", phone: "", address: "", zipcode: "", city: "", kvk_number: "", btw_number: "" });
    } catch {
      toast.error("Fout bij aanmaken klant");
    }
  };

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nieuwe klant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Bedrijfsnaam *</Label>
              <Input value={form.name} onChange={set("name")} required />
            </div>
            <div>
              <Label>Contactpersoon</Label>
              <Input value={form.contact_person} onChange={set("contact_person")} />
            </div>
            <div>
              <Label>Telefoon</Label>
              <Input value={form.phone} onChange={set("phone")} />
            </div>
            <div className="col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={set("email")} />
            </div>
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
            <div>
              <Label>KvK-nummer</Label>
              <Input value={form.kvk_number} onChange={set("kvk_number")} />
            </div>
            <div>
              <Label>BTW-nummer</Label>
              <Input value={form.btw_number} onChange={set("btw_number")} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
            <Button type="submit" disabled={createClient.isPending}>
              {createClient.isPending ? "Opslaan..." : "Klant aanmaken"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
