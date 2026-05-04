# Sprint 9, Deploy-checklist

**Doel**: pentest-remediatie + NewOrder/warehouse-flow naar productie zonder
breuk in inlog-flow of bestaande tenant-relaties.

**Volgorde is belangrijk**, migratie eerst, dan edge functions, dan dashboard-stap,
dan frontend. Andersom kan een redeploy van de frontend tegen een nog-oude DB
oplopen of, erger, een nieuwe DB met dichtgezette signup tegenkomen terwijl het
oude frontend-pad nog signup gebruikt.

## Pre-flight

- [ ] `git status` schoon, `main` is up-to-date met `origin/main`.
- [ ] CI groen op de laatste commit (security-tests + vitest + typecheck).
- [ ] Backup van Supabase prod-DB minder dan 24u oud (Supabase Dashboard >
  Database > Backups).
- [ ] Communicatie naar klant: korte mail dat er een security-update gaat lopen,
  inschatting downtime <2 minuten.

## Stap 1, Migraties uitrollen

```bash
cd orderflow-suite
supabase db push --linked
```

Verwacht: twee nieuwe migraties worden toegepast.

- `20260504120000_warehouse_flow_references.sql` (NewOrder/warehouse-flow,
  PR #22, mogelijk al toegepast als de codex-PR-deploy al gelopen is, dan
  skipt push deze).
- `20260505000000_secure_tenant_membership.sql` (CRITICAL-1).

Check na push:

```sql
-- in Supabase SQL Editor
SELECT version FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 5;
```

Versies `20260505000000` en `20260504120000` moeten in de top staan.

## Stap 2, Edge functions deployen

```bash
supabase functions deploy office-login google-places google-places-business kvk-lookup
```

Verwacht: vier "Deployed Function ..."-regels. Geen rebuild-fouten.

Verifieer in Supabase Dashboard > Edge Functions dat de version-counter is opgehoogd
en de last-deployed timestamp van zojuist is.

## Stap 3, Supabase Dashboard handmatige stap

In de Supabase Dashboard:

1. Auth > **Settings** > scroll naar "User Signups".
2. Zet **Allow signups** op **off** (was on).
3. **Save**.

Dit dicht het publieke `/auth/v1/signup`-endpoint. Vanaf dit moment kunnen nieuwe
users uitsluitend ontstaan via een geaccepteerde tenant-invitation (of via
service_role-RPC vanuit de backend).

## Stap 4, Frontend redeploy

Vercel/Netlify dashboard:

1. Open het project.
2. Trigger een **redeploy** vanaf `main` (of push een lege commit
   `git commit --allow-empty -m "trigger redeploy" && git push`).
3. Wacht tot de build slaagt.

Verwacht: nieuwe build-hash, geen build-errors.

## Stap 5, Smoke-tests na deploy

Vervang `$SUPABASE_URL`, `$ANON_KEY`, `$ADMIN_JWT`, `$VICTIM_JWT` met de juiste
waarden uit `.env.production` of de Supabase dashboard.

### Smoke 1, signup is dicht

```bash
curl -i -X POST "$SUPABASE_URL/auth/v1/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest@example.com","password":"ChangeMe!2026","data":{"tenant_id":"00000000-0000-0000-0000-000000000000"}}'
```

Verwacht: HTTP `422` of `400` met "Signups not allowed". Voor de fix gaf dit
`200` + tenant-injection.

### Smoke 2, login-lockout schopt in

Probeer 6x inloggen met fout wachtwoord op `office-login`:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "attempt $i, status %{http_code}\n" \
    -X POST "$SUPABASE_URL/functions/v1/office-login" \
    -H "apikey: $ANON_KEY" \
    -H "Content-Type: application/json" \
    -d '{"email":"jaimy+demo@rcs-schiphol.nl","password":"verkeerd"}'
done
```

Verwacht: pogingen 1-5 geven `401` (invalid credentials), poging 6 geeft `423` of
`429` met "account tijdelijk geblokkeerd". Lockout 15 minuten zichtbaar in
`office_user_security_settings.locked_until`.

### Smoke 3, MEDIUM-1 (alleen na MEDIUM-1-migratie)

Haal een willekeurig user_role-id op en probeer als gewone user:

```bash
curl -i -X PATCH "$SUPABASE_URL/rest/v1/user_roles?id=eq.<some_uuid>" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $VICTIM_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"role":"admin"}'
```

Verwacht: HTTP `403` met "new row violates row-level security policy". Voor de fix
gaf dit `200` + lege array.

## Stap 6, Tenant-invitation roken

Maak een test-invite via de SQL Editor:

```sql
SELECT * FROM public.create_tenant_invitation(
  '<tenant_id_van_demo_tenant>'::uuid,
  'invite-smoke@example.com',
  'planner'
);
```

Verwacht: één rij met token, expires_at = nu + 7 dagen, accepted_at = NULL. Sla
het token op voor de klant-test (zie `docs/klant-testplan.md`).

## Rollback

Als smoke 2 of 3 faalt:

1. **Edge functions**: `supabase functions deploy <function> --version <vorige>` om
   terug te rollen.
2. **Frontend**: Vercel/Netlify > Deployments > klik vorige succesvolle deploy >
   "Promote to production".
3. **Migratie**: niet revertbaar zonder data-loss. In dat geval, edge function en
   frontend terugrollen, en in Dashboard "Allow signups" terug op on. De
   `tenant_invitations`-tabel kan blijven staan (geen data-conflict).
4. Communiceer naar klant.

## Klaar?

- [ ] Smoke 1, 2, 3 geslaagd.
- [ ] `docs/where-we-are.md` bijwerken met "Sprint 9 deployed YYYY-MM-DD".
- [ ] Klant op de hoogte brengen, met link naar het uitgebreide
  `docs/klant-testplan.md`.
