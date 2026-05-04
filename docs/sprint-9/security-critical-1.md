# Sprint 9 - CRITICAL-1: signup tenant-injection dichtgezet

## Wat was het probleem

Het publieke `/auth/v1/signup` endpoint van Supabase Auth accepteert een vrij `data`
veld dat in `auth.users.raw_user_meta_data` belandt. De oude
`public.handle_new_user`-trigger las daaruit blindelings `tenant_id` en deed:

```sql
INSERT INTO public.tenant_members (tenant_id, user_id, role)
VALUES (_tenant_id, NEW.id, 'planner') ON CONFLICT DO NOTHING;
UPDATE auth.users SET raw_app_meta_data = ... || jsonb_build_object('tenant_id', _tenant_id);
```

Een attacker kon dus zonder authenticatie planner worden in elke tenant waarvan hij
het UUID kende, en kreeg de bijbehorende JWT-claim er gratis bij. Dat omzeilt RLS,
omdat onze policies juist op `app_metadata.tenant_id` leunen.

## Wat de migratie doet

`supabase/migrations/20260505000000_secure_tenant_membership.sql`:

1. Vervangt `public.handle_new_user`. Profile en default `user_roles.role='medewerker'`
   blijven, maar `tenant_id` wordt niet meer uit user-metadata gelezen en er wordt
   geen `tenant_members`-rij of `app_metadata` mutatie meer gedaan.
2. Voegt `public.tenant_invitations` toe (tenant_id, email, role, token, expires_at,
   accepted_at, invited_by). RLS: alleen admins/owners van de eigen tenant zien,
   maken en intrekken. Geen UPDATE-policy, dus `accepted_at` kan alleen via de RPC.
3. `create_tenant_invitation(p_tenant_id, p_email, p_role)` SECURITY DEFINER. Checkt
   dat `auth.uid()` admin/owner is van die tenant en dat de role een geldige waarde
   heeft. Genereert een random token (`gen_random_uuid()::text`).
4. `accept_tenant_invitation(p_token)` SECURITY DEFINER. Zoekt de invitation, eist
   `accepted_at IS NULL`, `expires_at > now()` en `lower(email) = lower(auth.email())`,
   maakt dan pas de `tenant_members`-rij en zet `accepted_at`. Synchroniseert
   `app_metadata.tenant_id` en `profiles.tenant_id` alleen wanneer de user nog geen
   tenant heeft, zodat bestaande multi-tenant relaties intact blijven.

## Bestaande data behouden

- De migratie raakt geen bestaande rijen in `tenant_members`, `profiles`,
  `user_roles` of `auth.users`. Iedereen die vandaag is ingelogd, blijft ingelogd
  met dezelfde rol.
- `handle_new_user` wordt vervangen via `CREATE OR REPLACE`. De trigger op
  `auth.users` blijft hetzelfde, alleen het function-lichaam verandert. Geen
  downtime.
- `tenant_invitations` is nieuw, dus geen migratiepad nodig voor oude data.

## Supabase Auth dashboard hardenen (handmatige stap)

Na deploy van de migratie:

1. Ga naar `Authentication` → `Sign In / Providers` → `Email`.
2. Zet `Allow new users to sign up` uit. Onze frontend heeft geen signup-scherm,
   dit dicht het REST-endpoint zelf voor anon-tokens.
3. Laat `Confirm email` aan staan. De Supabase invite-flow stuurt sowieso eerst
   een bevestigingsmail.

Optioneel maar aanbevolen: in `Authentication` → `Rate Limits` de signup-quota op
0 zetten zodat je in dashboard-logs ziet als iemand het toch probeert.

## Hoe nodig je nu een gebruiker uit

### Variant A: Supabase invite-flow (laagdrempelig)

1. Een admin van tenant T roept de RPC aan:
   ```sql
   select * from create_tenant_invitation(
     'T-uuid'::uuid, 'nieuw@klant.nl', 'planner'
   );
   ```
   De rij bevat een `token`. Stuur die naar `nieuw@klant.nl` met een link
   `https://app.../accept-invitation?token=<token>`.
2. De uitgenodigde maakt een account aan via de standaard Supabase invite-mail
   (admin doet `Invite user` in dashboard, of we triggeren dat via de service-role
   key in een aparte edge function later).
3. Na inloggen opent de user de invitation-link en de frontend roept aan:
   ```ts
   await supabase.rpc('accept_tenant_invitation', { p_token: token });
   ```
   De RPC matcht het emailadres van de ingelogde user tegen de invite, koppelt
   hem aan de tenant en zet `accepted_at`.

### Variant B: Bestaande user toevoegen aan extra tenant

Identieke flow, maar de user is al ingelogd met een ander account. Zolang het
mailadres in de `auth.users`-rij overeenkomt met de invitation-email werkt het.

## Verificatie na deploy (curl)

Vervang `<ANON_KEY>` en `<PROJECT>` voor het juiste project. Het verwachte
gedrag verschilt in twee scenario's.

### A. Dashboard-stap is gezet (signup uitgeschakeld)

```bash
curl -i -X POST "https://<PROJECT>.supabase.co/auth/v1/signup" \
  -H "apikey: <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "attacker+test@example.com",
    "password": "Hunter2!Hunter2!",
    "data": { "tenant_id": "00000000-0000-0000-0000-000000000001" }
  }'
```

Verwacht: `422` met `signup_disabled`. Geen rij in `auth.users`, dus per definitie
geen `tenant_members`-injectie.

### B. Worst-case: iemand laat signup ooit weer aan

Zelfde request, maar nu komt er wel een 200 terug en wordt er een `auth.users`
rij aangemaakt. Bewijs dat de injection nog steeds dood is:

```sql
-- Connect met service-role key.
SELECT id FROM auth.users WHERE email = 'attacker+test@example.com';
-- pak het user-uuid en check:
SELECT * FROM public.tenant_members WHERE user_id = '<user-uuid>';
-- Verwacht: 0 rijen.
SELECT raw_app_meta_data FROM auth.users WHERE id = '<user-uuid>';
-- Verwacht: geen tenant_id key.
SELECT * FROM public.profiles WHERE user_id = '<user-uuid>';
-- Verwacht: rij met tenant_id = NULL.
```

Beide moeten leeg/NULL zijn. Test-user daarna opruimen met
`DELETE FROM auth.users WHERE email = 'attacker+test@example.com';`.

### C. Happy-path bewijzen

```sql
-- als admin van tenant T:
SELECT token FROM create_tenant_invitation('T-uuid'::uuid, 'echte@klant.nl', 'planner');
```
Log in als `echte@klant.nl`, dan:
```ts
await supabase.rpc('accept_tenant_invitation', { p_token: '<token>' });
```
Verwacht: nieuwe rij in `tenant_members` met role `planner` voor deze user in
tenant T, en `accepted_at` op de invitation gevuld. Tweede aanroep met hetzelfde
token faalt met `invitation not found, expired, already used, or e-mail mismatch`.

## Niet in deze sprint

- Een edge function voor het verzenden van de uitnodigingsmail. Voor nu lopen
  invites via de bestaande `supabase.auth.admin.inviteUserByEmail` of handmatig
  via dashboard.
- Een `/accept-invitation` route in de frontend. De RPC bestaat, de route is een
  vervolgticket.
