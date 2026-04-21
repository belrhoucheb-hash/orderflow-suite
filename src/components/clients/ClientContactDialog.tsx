import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import {
  useCreateClientContact,
  useUpdateClientContact,
  type ClientContact,
} from "@/hooks/useClientContacts";
import {
  clientContactInputSchema,
  CLIENT_CONTACT_ROLES,
  CLIENT_CONTACT_ROLE_LABELS,
  type ClientContactRole,
} from "@/lib/validation/clientContactSchema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  contact?: ClientContact;
}

export function ClientContactDialog({ open, onOpenChange, clientId, contact }: Props) {
  const isEdit = !!contact;
  const create = useCreateClientContact();
  const update = useUpdateClientContact();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    role: "other" as ClientContactRole,
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (contact) {
      setForm({
        name: contact.name,
        email: contact.email ?? "",
        phone: contact.phone ?? "",
        role: contact.role,
        notes: contact.notes ?? "",
      });
    } else {
      setForm({ name: "", email: "", phone: "", role: "other", notes: "" });
    }
    setErrors({});
  }, [open, contact]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = clientContactInputSchema.safeParse({
      ...form,
      is_active: true,
    });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path.join(".")] = i.message;
      });
      setErrors(map);
      return;
    }
    try {
      if (isEdit && contact) {
        await update.mutateAsync({
          id: contact.id,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          role: parsed.data.role,
          notes: parsed.data.notes || null,
        });
      } else {
        await create.mutateAsync({
          client_id: clientId,
          name: parsed.data.name,
          email: parsed.data.email || null,
          phone: parsed.data.phone || null,
          role: parsed.data.role,
          is_active: true,
          notes: parsed.data.notes || null,
        });
      }
      toast.success(isEdit ? "Contactpersoon bijgewerkt" : "Contactpersoon toegevoegd");
      onOpenChange(false);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("uniq_client_contacts_primary_per_client")) {
        toast.error("Er is al een primair contact voor deze klant");
      } else if (msg.includes("uniq_client_contacts_backup_per_client")) {
        toast.error("Er is al een backup contact voor deze klant");
      } else {
        toast.error(msg || "Opslaan mislukt");
      }
    }
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg tracking-tight">
            {isEdit ? "Contactpersoon bewerken" : "Nieuwe contactpersoon"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <span className="label-luxe">Naam *</span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="field-luxe"
            />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="label-luxe">E-mail</span>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="field-luxe"
              />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
            </div>
            <div>
              <span className="label-luxe">Telefoon</span>
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                className="field-luxe"
              />
            </div>
          </div>
          <div>
            <span className="label-luxe">Rol *</span>
            <Select
              value={form.role}
              onValueChange={(v) => setForm((f) => ({ ...f, role: v as ClientContactRole }))}
            >
              <SelectTrigger className="btn-luxe w-full justify-between">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_CONTACT_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {CLIENT_CONTACT_ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.role && <p className="text-xs text-destructive mt-1">{errors.role}</p>}
          </div>
          <div>
            <span className="label-luxe">Notities</span>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="field-luxe"
            />
          </div>
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
              disabled={saving}
              className="btn-luxe btn-luxe--primary !h-9"
            >
              {saving ? "Opslaan..." : isEdit ? "Bijwerken" : "Toevoegen"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
