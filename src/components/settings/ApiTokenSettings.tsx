import { useState } from "react";
import { Plus, Copy, Trash2, Key, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  AVAILABLE_SCOPES,
  useApiTokens,
  useCreateApiToken,
  useRevokeApiToken,
  type ApiToken,
} from "@/hooks/useApiTokens";

interface Props {
  /** Null = alleen tenant-tokens (admin-view). UUID = tokens voor die klant. */
  clientId?: string | null;
  /** Als true: geen trips:read optie tonen (klant-context). */
  hideTenantOnlyScopes?: boolean;
  /** Kop. */
  title?: string;
  /** Subkop. */
  subtitle?: string;
}

export function ApiTokenSettings({
  clientId = null,
  hideTenantOnlyScopes = false,
  title = "API-tokens",
  subtitle = "Geef externe systemen toegang tot jouw OrderFlow-data via de publieke REST API.",
}: Props) {
  const tokens = useApiTokens(clientId);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlaintext, setNewPlaintext] = useState<{ plaintext: string; name: string } | null>(null);

  const activeTokens = (tokens.data ?? []).filter((t) => !t.revoked_at);
  const revokedTokens = (tokens.data ?? []).filter((t) => t.revoked_at);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Nieuw token
        </Button>
      </div>

      {tokens.isLoading && (
        <div className="card--luxe p-6 text-sm text-muted-foreground">Laden...</div>
      )}

      {!tokens.isLoading && activeTokens.length === 0 && revokedTokens.length === 0 && (
        <div className="card--luxe p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nog geen tokens. Maak er een aan om via de REST API data op te vragen.
          </p>
        </div>
      )}

      {activeTokens.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Actief
          </h3>
          {activeTokens.map((t) => <TokenRow key={t.id} token={t} />)}
        </div>
      )}

      {revokedTokens.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Ingetrokken
          </h3>
          {revokedTokens.map((t) => <TokenRow key={t.id} token={t} />)}
        </div>
      )}

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        clientId={clientId}
        hideTenantOnlyScopes={hideTenantOnlyScopes}
        onCreated={(pt, name) => setNewPlaintext({ plaintext: pt, name })}
      />

      <TokenRevealDialog
        open={newPlaintext !== null}
        onOpenChange={(o) => !o && setNewPlaintext(null)}
        plaintext={newPlaintext?.plaintext ?? ""}
        name={newPlaintext?.name ?? ""}
      />
    </div>
  );
}

function TokenRow({ token }: { token: ApiToken }) {
  const revoke = useRevokeApiToken();
  const isExpired = token.expires_at ? new Date(token.expires_at) < new Date() : false;
  const isRevoked = !!token.revoked_at;

  return (
    <div className="card--luxe p-4 flex items-start gap-4">
      <Key className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{token.name}</span>
          <span className="font-mono text-xs bg-muted/30 px-1.5 py-0.5 rounded">
            {token.token_prefix}...
          </span>
          {isRevoked && <Badge variant="secondary" className="text-xs">Ingetrokken</Badge>}
          {!isRevoked && isExpired && <Badge variant="destructive" className="text-xs">Verlopen</Badge>}
        </div>
        <div className="flex gap-1 flex-wrap mt-2">
          {token.scopes.map((s) => (
            <Badge key={s} variant="outline" className="text-[11px] font-mono">{s}</Badge>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground mt-2 flex gap-4 flex-wrap">
          <span>Aangemaakt {new Date(token.created_at).toLocaleDateString("nl-NL")}</span>
          {token.last_used_at && (
            <span>Laatst gebruikt {new Date(token.last_used_at).toLocaleString("nl-NL")}</span>
          )}
          {token.expires_at && !isRevoked && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Verloopt {new Date(token.expires_at).toLocaleDateString("nl-NL")}
            </span>
          )}
        </div>
      </div>
      {!isRevoked && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Token "${token.name}" intrekken? Dit kan niet ongedaan gemaakt worden.`)) {
              revoke.mutate(token.id);
            }
          }}
          className="text-destructive hover:text-destructive shrink-0"
          title="Intrekken"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

function CreateTokenDialog({
  open,
  onOpenChange,
  clientId,
  hideTenantOnlyScopes,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: string | null;
  hideTenantOnlyScopes: boolean;
  onCreated: (plaintext: string, name: string) => void;
}) {
  const create = useCreateApiToken();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>([]);
  const [expiresIn, setExpiresIn] = useState<"never" | "30d" | "90d" | "1y">("never");

  const reset = () => {
    setName("");
    setScopes([]);
    setExpiresIn("never");
  };

  const toggleScope = (s: string) => {
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const computeExpiresAt = (): string | null => {
    if (expiresIn === "never") return null;
    const d = new Date();
    if (expiresIn === "30d") d.setDate(d.getDate() + 30);
    if (expiresIn === "90d") d.setDate(d.getDate() + 90);
    if (expiresIn === "1y") d.setFullYear(d.getFullYear() + 1);
    return d.toISOString();
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("Naam is verplicht"); return; }
    if (scopes.length === 0) { toast.error("Kies minstens één scope"); return; }
    try {
      const res = await create.mutateAsync({
        name: name.trim(),
        scopes,
        expires_at: computeExpiresAt(),
        client_id: clientId,
      });
      onCreated(res.plaintext, res.token.name);
      reset();
      onOpenChange(false);
    } catch {
      /* toast in hook */
    }
  };

  const visibleScopes = AVAILABLE_SCOPES.filter((s) =>
    hideTenantOnlyScopes ? !s.value.startsWith("trips:") : true
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nieuw API-token</DialogTitle>
          <DialogDescription>
            De token wordt eenmaal getoond na aanmaak. Bewaar hem direct, hij is daarna niet meer opvraagbaar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="tok-name">Naam</Label>
            <Input
              id="tok-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ERP-integratie, BI-tool, enz."
            />
          </div>

          <div>
            <Label className="mb-2 block">Scopes</Label>
            <div className="space-y-2">
              {visibleScopes.map((s) => (
                <label
                  key={s.value}
                  className="flex items-center gap-2 text-sm cursor-pointer p-2 rounded hover:bg-muted/30"
                >
                  <Checkbox
                    checked={scopes.includes(s.value)}
                    onCheckedChange={() => toggleScope(s.value)}
                  />
                  <span className="font-mono text-xs">{s.value}</span>
                  <span className="text-muted-foreground text-xs">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Verloopt</Label>
            <div className="flex gap-2">
              {(["never", "30d", "90d", "1y"] as const).map((opt) => (
                <Button
                  key={opt}
                  type="button"
                  variant={expiresIn === opt ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExpiresIn(opt)}
                >
                  {opt === "never" ? "Nooit" : opt === "30d" ? "30 dagen" : opt === "90d" ? "90 dagen" : "1 jaar"}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuleren</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Aanmaken..." : "Token aanmaken"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TokenRevealDialog({
  open,
  onOpenChange,
  plaintext,
  name,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  plaintext: string;
  name: string;
}) {
  const copy = () => {
    navigator.clipboard.writeText(plaintext);
    toast.success("Token gekopieerd");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Token voor "{name}"</DialogTitle>
          <DialogDescription>
            Kopieer dit token nu. Het wordt niet meer getoond. Gebruik het als Bearer-token in je Authorization-header.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/30 border border-border rounded p-3 font-mono text-xs break-all">
          {plaintext}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={copy} className="gap-2">
            <Copy className="h-4 w-4" />
            Kopieer
          </Button>
          <Button onClick={() => onOpenChange(false)}>Sluit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
