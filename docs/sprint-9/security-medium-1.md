# MEDIUM-1, PostgREST `200 []`-misleiding bij geblokkeerde UPDATE

**Status**: fix-aanbeveling, nog niet uitgevoerd
**Severity**: medium (geen data-lek, wel false-positive succes-signaal voor attackers)
**Scope**: `public.user_roles`, `public.tenant_members`, `public.profiles`, `public.office_user_security_settings`

## Wat is het probleem

Pentest-bevinding: een PATCH-call vanuit een gewone authenticated user op `user_roles`
of `tenant_members` levert HTTP `200 OK` met een lege array op (`[]`), terwijl de RLS
de UPDATE in werkelijkheid heeft tegengehouden. Voor de attacker leest dat als "succes,
maar leeg resultaat", in plaats van "verboden". Niet exploitable, want er is niets
gewijzigd in de database, maar wel verwarrend en het maskeert wat eigenlijk een 403 zou
moeten zijn in monitoring/IDS.

## Waarom doet PostgREST dit

PostgREST vertaalt een PATCH naar een SQL `UPDATE ... WHERE <pkey-filter>`. Postgres
combineert die WHERE met de **`USING`-clause van de RLS UPDATE-policy**. Als de
USING-clause de rij filtert (bijvoorbeeld `auth.uid() = user_id` faalt voor een
admin-only rij), dan raakt de UPDATE 0 rijen. PostgREST geeft daarop:

- Met `Prefer: return=representation`: HTTP `200` met lege array `[]` (de "geüpdatete"
  rijen, dus geen).
- Zonder `Prefer`-header: HTTP `204 No Content`.

Vanuit Postgres' oogpunt is "0 rijen geupdate" geen fout, gewoon een geen-match. PostgREST
volgt dat braaf. Resultaat: silent filter waar een echte autorisatie-fout op z'n plaats
was.

## Twee fix-opties

### Optie a, BEFORE UPDATE trigger

Voeg een trigger toe die expliciet `RAISE EXCEPTION` doet als `auth.uid()` niet de
eigenaar of een admin is. PostgREST vertaalt een unhandled exception naar HTTP `403`
(via `ERRCODE = '42501'`).

Nadeel: extra trigger per tabel, dubbele logica naast de RLS-policy. Bij policy-wijziging
kan trigger en USING-clause uit sync raken.

### Optie b, `WITH CHECK (false)` op UPDATE-policy (aanbevolen)

Splits de UPDATE-policy in tweeen:
- USING-clause matcht zo breed mogelijk (alle rijen van de tenant), zodat de UPDATE de
  rij wel raakt.
- WITH CHECK-clause is `false` voor non-admins, of dezelfde admin-check zoals bij
  INSERT. Postgres blokkeert dan de UPDATE en gooit `42501` (`new row violates row-level
  security policy`). PostgREST vertaalt dat naar HTTP `403`.

Voordeel: idiomatisch RLS, geen extra trigger, zelfde plek als de bestaande policy. Geen
risico op out-of-sync drift.

**Aanbeveling**: optie b.

## Voorbeeld-migratie-snippet (niet uitvoeren, alleen ter illustratie)

```sql
-- Sprint 9 / MEDIUM-1: pentest-noise weghalen door PostgREST 200 [] te vervangen door 403
-- bij verboden UPDATEs op gevoelige tabellen.
--
-- Strategie: policy USING-clause verbreden zodat de UPDATE de rij raakt, en de
-- autorisatie-check verplaatsen naar WITH CHECK. Postgres throwt dan 42501 ipv silent skip.

BEGIN;

-- 1. user_roles -------------------------------------------------------------

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;

CREATE POLICY "Admins can update roles"
  ON public.user_roles
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 2. tenant_members --------------------------------------------------------
-- Bestaande policy "Owners/admins can manage tenant members" is FOR ALL met USING.
-- Voor UPDATE specifiek een policy met expliciete WITH CHECK toevoegen.

DROP POLICY IF EXISTS "Tenant admins update members" ON public.tenant_members;

CREATE POLICY "Tenant admins update members"
  ON public.tenant_members
  FOR UPDATE TO authenticated
  USING (tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid)
  WITH CHECK (
    tenant_id = ((auth.jwt() -> 'app_metadata' ->> 'tenant_id'))::uuid
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.tenant_id = tenant_members.tenant_id
        AND tm.role IN ('admin','owner')
    )
  );

-- 3. profiles --------------------------------------------------------------
-- Huidige policy "Users can update own profile" heeft alleen USING. Aanvullen met
-- WITH CHECK zodat een PATCH met poging tot user_id-spoof ook 403 geeft ipv silent.

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. office_user_security_settings ----------------------------------------
-- Bestaande UPDATE-policy heeft al een WITH CHECK; dubbel-checken dat de USING-clause
-- niet stilletjes filtert. Indien de huidige USING al expressief admin-check doet,
-- vervangen door een bredere USING + dezelfde admin-check op WITH CHECK.

DROP POLICY IF EXISTS "office_user_security tenant admins update"
  ON public.office_user_security_settings;

CREATE POLICY "office_user_security tenant admins update"
  ON public.office_user_security_settings
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id())
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = office_user_security_settings.tenant_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin','owner')
    )
  );

COMMIT;
```

## Verificatie na deploy

Twee curl-calls om te bevestigen dat 200 [] is vervangen door 403:

```bash
# Voor de fix: 200 [] (silent)
# Na de fix:   403 met "new row violates row-level security policy"
curl -X PATCH "$SUPABASE_URL/rest/v1/user_roles?id=eq.<some_id>" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"role":"admin"}'

curl -X PATCH "$SUPABASE_URL/rest/v1/tenant_members?id=eq.<some_id>" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"role":"owner"}'
```

## Niet in scope van deze fix

- Read-policies, die geven al gewoon `[]` bij geen-match en dat is correct gedrag voor
  een SELECT.
- DELETE-policies, daar geeft Postgres ook al een lege response bij no-match en dat is
  ook gangbaar idioom (je vraagt een DELETE, er was niets te deleten).
- Andere tabellen waar de USING-clause al breed is (bijvoorbeeld `tenant_id`-scoped),
  daar is de WITH CHECK-clause typisch ook al strikt en gedraagt PostgREST zich correct
  met 403.
