# Inbox-koppeling smoke test

Verplicht vóór elke merge naar `main` die inbox-code raakt:

- `supabase/functions/poll-inbox/**`
- `supabase/functions/test-inbox-connection/**`
- `supabase/migrations/*tenant_inboxes*`
- `src/hooks/useTenantInboxes.ts`
- `src/components/settings/InboxSettings.tsx`

## Waarom

Deze code kan niet zinnig automatisch getest worden zonder een echte IMAP-server. De migratie raakt Vault-encryptie, dus een fout daar kan credentials lekken of polling stilleggen zonder dat de CI het ziet. Vóór prod draaien we het volledige pad met een test-mailbox.

## Wat je nodig hebt

1. Credentials voor de test-mailbox in 1Password, onder `Orderflow Smoke Inbox` (host, user, app-wachtwoord).
2. Een gedeployde Supabase-omgeving (staging of een preview branch).
3. JWT van een testgebruiker met tenant-admin rol voor die omgeving. Haal op via de app, kopieer uit devtools.

## Stappen

```bash
export SMOKE_TEST_HOST=imap.gmail.com
export SMOKE_TEST_PORT=993
export SMOKE_TEST_USER=orderflow.smoke@gmail.com
export SMOKE_TEST_PASS='<app-wachtwoord uit 1Password>'
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_ANON_KEY='<publishable key>'
export SUPABASE_AUTH_JWT='<user JWT>'
export SUPABASE_TENANT_ID='<tenant uuid>'

bash scripts/smoke-test-inbox.sh
```

Verwacht eindresultaat: `=== Smoke test geslaagd ===`.

## Wat je daarmee verifieert

- `test-inbox-connection` krijgt een echte IMAP-login voor elkaar, geen credentials in logs.
- `tenant_inboxes` insert + `set_tenant_inbox_password` RPC werken met user JWT en RLS.
- `poll-inbox` pakt de nieuwe inbox op, pollt succesvol, zet `last_polled_at` en `consecutive_failures=0`.
- Delete op de inbox ruimt de vault-secret mee op.

## Wat het NIET verifieert

- Order-concepten correctheid (inhoud). Daarvoor: stuur een testmail met een duidelijke order en check `Inbox` UI handmatig.
- Gmail OAuth flow, dat bestaat nog niet.
- Backoff-gedrag bij herhaalde fouten. Handmatig testen door foutieve creds te zetten en te wachten.

## Checklist voor de reviewer

- [ ] Smoke-script lokaal gedraaid tegen staging, output geplakt in PR.
- [ ] `npm run check:secret-leaks` groen.
- [ ] Supabase SQL `supabase/tests/tenant_inboxes_vault.sql` gedraaid in preview-branch, geen `RAISE` errors.
- [ ] Geen logs met `username`, `password`, `host` aangetroffen in staging edge-function logs.
