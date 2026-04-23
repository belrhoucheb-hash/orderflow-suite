import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Inbox, Plus, Trash2, Edit, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useTenantOptional } from "@/contexts/TenantContext";
import { useTenantInboxes, type TenantInbox, type InboxInput } from "@/hooks/useTenantInboxes";

interface FormState {
  id: string | null;
  label: string;
  host: string;
  port: number;
  username: string;
  folder: string;
  password: string;
}

const EMPTY: FormState = {
  id: null,
  label: "",
  host: "",
  port: 993,
  username: "",
  folder: "INBOX",
  password: "",
};

function statusBadge(inbox: TenantInbox) {
  if (!inbox.is_active) {
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Inactief</span>;
  }
  if (inbox.last_error) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 inline-flex items-center gap-1">
        <AlertCircle className="h-3 w-3" /> Fout, {inbox.consecutive_failures}x
      </span>
    );
  }
  if (inbox.last_polled_at) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 inline-flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> Actief
      </span>
    );
  }
  return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Nog niet gepolld</span>;
}

export function InboxSettings() {
  const { tenant } = useTenantOptional();
  const inboxes = useTenantInboxes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [testState, setTestState] = useState<"idle" | "pending" | "ok" | "error">("idle");
  const [testError, setTestError] = useState<string | null>(null);

  const isEdit = form.id !== null;

  function openCreate() {
    setForm(EMPTY);
    setTestState("idle");
    setTestError(null);
    setDialogOpen(true);
  }

  function openEdit(inbox: TenantInbox) {
    setForm({
      id: inbox.id,
      label: inbox.label,
      host: inbox.host,
      port: inbox.port,
      username: inbox.username,
      folder: inbox.folder,
      password: "",
    });
    setTestState("idle");
    setTestError(null);
    setDialogOpen(true);
  }

  async function runTest() {
    if (!tenant?.id) return;
    if (!form.host || !form.username) {
      setTestState("error");
      setTestError("Host en gebruikersnaam zijn verplicht");
      return;
    }
    // Bij edit zonder wachtwoord, test bestaande inbox via inboxId
    const canUseSavedPassword = isEdit && !form.password;
    if (!canUseSavedPassword && !form.password) {
      setTestState("error");
      setTestError("Vul een wachtwoord in om te testen");
      return;
    }

    setTestState("pending");
    setTestError(null);
    try {
      const result = canUseSavedPassword && form.id
        ? await inboxes.testConnection.mutateAsync({ inboxId: form.id })
        : await inboxes.testConnection.mutateAsync({
            tenantId: tenant.id,
            label: form.label,
            host: form.host,
            port: form.port,
            username: form.username,
            password: form.password,
            folder: form.folder,
          });
      if (result.ok) {
        setTestState("ok");
      } else {
        setTestState("error");
        setTestError(result.error || "Verbinding faalde");
      }
    } catch (e: any) {
      setTestState("error");
      setTestError(e?.message || "Test faalde");
    }
  }

  async function save() {
    if (testState !== "ok") {
      toast.error("Test de verbinding eerst");
      return;
    }
    try {
      if (isEdit && form.id) {
        const patch: Partial<InboxInput> & { id: string } = {
          id: form.id,
          label: form.label,
          host: form.host,
          port: form.port,
          username: form.username,
          folder: form.folder,
        };
        if (form.password) patch.password = form.password;
        await inboxes.update.mutateAsync(patch);
        toast.success("Inbox bijgewerkt");
      } else {
        await inboxes.create.mutateAsync({
          label: form.label,
          host: form.host,
          port: form.port,
          username: form.username,
          folder: form.folder,
          password: form.password,
        });
        toast.success("Inbox aangemaakt");
      }
      setDialogOpen(false);
    } catch (e: any) {
      toast.error("Opslaan faalde", { description: e?.message });
    }
  }

  async function remove(inbox: TenantInbox) {
    if (!confirm(`Inbox "${inbox.label}" verwijderen? Het wachtwoord wordt ook verwijderd.`)) return;
    try {
      await inboxes.remove.mutateAsync(inbox.id);
      toast.success("Inbox verwijderd");
    } catch (e: any) {
      toast.error("Verwijderen faalde", { description: e?.message });
    }
  }

  async function toggleActive(inbox: TenantInbox) {
    try {
      await inboxes.setActive.mutateAsync({ id: inbox.id, is_active: !inbox.is_active });
    } catch (e: any) {
      toast.error("Wijziging faalde", { description: e?.message });
    }
  }

  const data = inboxes.data || [];

  return (
    <Card className="card--luxe">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-4.5 w-4.5" strokeWidth={1.5} />
            Inboxen
          </CardTitle>
          <CardDescription>
            Koppel IMAP-mailboxen, inkomende mail wordt omgezet in order-concepten.
          </CardDescription>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nieuwe inbox
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{isEdit ? "Inbox bewerken" : "Nieuwe inbox"}</DialogTitle>
              <DialogDescription>
                Vul de IMAP-gegevens in en test de verbinding voor het opslaan.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="inbox-label">Naam</Label>
                <Input
                  id="inbox-label"
                  value={form.label}
                  onChange={(e) => { setForm({ ...form, label: e.target.value }); setTestState("idle"); }}
                  placeholder="bv. orders@mijnbedrijf.nl"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Label htmlFor="inbox-host">IMAP-host</Label>
                  <Input
                    id="inbox-host"
                    value={form.host}
                    onChange={(e) => { setForm({ ...form, host: e.target.value }); setTestState("idle"); }}
                    placeholder="imap.gmail.com"
                  />
                </div>
                <div>
                  <Label htmlFor="inbox-port">Poort</Label>
                  <Input
                    id="inbox-port"
                    type="number"
                    value={form.port}
                    onChange={(e) => { setForm({ ...form, port: parseInt(e.target.value) || 993 }); setTestState("idle"); }}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="inbox-user">Gebruikersnaam</Label>
                <Input
                  id="inbox-user"
                  value={form.username}
                  onChange={(e) => { setForm({ ...form, username: e.target.value }); setTestState("idle"); }}
                  placeholder="bv. orders@mijnbedrijf.nl"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="inbox-pass">Wachtwoord {isEdit && <span className="text-muted-foreground text-xs">(leeg laten behoudt huidige)</span>}</Label>
                <Input
                  id="inbox-pass"
                  type="password"
                  value={form.password}
                  onChange={(e) => { setForm({ ...form, password: e.target.value }); setTestState("idle"); }}
                  placeholder={isEdit ? "••••••••" : "App-wachtwoord of IMAP-wachtwoord"}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <Label htmlFor="inbox-folder">Folder</Label>
                <Input
                  id="inbox-folder"
                  value={form.folder}
                  onChange={(e) => { setForm({ ...form, folder: e.target.value }); setTestState("idle"); }}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={runTest}
                  disabled={testState === "pending"}
                >
                  {testState === "pending" ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Testen...</>
                  ) : (
                    "Test verbinding"
                  )}
                </Button>
                {testState === "ok" && (
                  <span className="text-sm text-emerald-600 inline-flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Verbinding gelukt
                  </span>
                )}
                {testState === "error" && (
                  <span className="text-sm text-red-600 inline-flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {testError}
                  </span>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>Annuleren</Button>
              <Button
                onClick={save}
                disabled={testState !== "ok" || inboxes.create.isPending || inboxes.update.isPending}
              >
                {(inboxes.create.isPending || inboxes.update.isPending) && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                Opslaan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {inboxes.isLoading ? (
          <p className="text-sm text-muted-foreground">Laden...</p>
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Nog geen inboxen gekoppeld. Klik op "Nieuwe inbox" om te beginnen.
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((inbox) => (
              <div
                key={inbox.id}
                className="flex items-center justify-between p-3 rounded-xl border border-[hsl(var(--gold)/0.2)] bg-[hsl(var(--gold-soft)/0.15)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{inbox.label}</p>
                    {statusBadge(inbox)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {inbox.username} @ {inbox.host}:{inbox.port}
                  </p>
                  {inbox.last_error && (
                    <p className="text-xs text-red-600 mt-1 truncate" title={inbox.last_error}>
                      {inbox.last_error}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Switch
                    checked={inbox.is_active}
                    onCheckedChange={() => toggleActive(inbox)}
                    aria-label="Activeren"
                  />
                  <Button variant="ghost" size="sm" onClick={() => openEdit(inbox)}>
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(inbox)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-600" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
