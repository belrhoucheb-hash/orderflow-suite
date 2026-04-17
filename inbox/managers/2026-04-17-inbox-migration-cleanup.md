# Ops-taak: env-IMAP fallback verwijderen

Eigenaar: Engineering Manager
Aangemaakt: 2026-04-17
Doelversie: één release na go-live van `tenant_inboxes`

## Context

De feature `tenant_inboxes` (zie PR inbox-koppeling) laat klanten per-tenant meerdere IMAP-inboxen koppelen. Ter overgang blijft `poll-inbox` bij een lege `tenant_inboxes`-tabel terugvallen op de oude env-vars `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_PORT`. Deze fallback hoort weg zodra alle actieve tenants minimaal één rij in `tenant_inboxes` hebben.

## Definition of done

- [ ] Alle actieve tenants hebben ≥1 rij in `tenant_inboxes` waar `is_active = true` en `password_secret_id IS NOT NULL`.
- [ ] Fallback-blok verwijderd uit `supabase/functions/poll-inbox/index.ts` (functies `buildEnvFallbackConfig`, `resolveEnvFallbackTenant`, en de `count == 0` check in `loadInboxConfigs`).
- [ ] Env-vars `IMAP_HOST`, `IMAP_USER`, `IMAP_PASSWORD`, `IMAP_PORT` verwijderd uit Supabase project settings én uit `.env.example`.
- [ ] Migratie-checklist hieronder afgevinkt.
- [ ] Smoke-test opnieuw gedraaid (`docs/inbox-smoke.md`).

## Migratie-checklist per tenant

Query om te valideren:

```sql
SELECT t.id, t.name,
       COUNT(i.id) FILTER (WHERE i.is_active AND i.password_secret_id IS NOT NULL) AS active_inboxes
FROM public.tenants t
LEFT JOIN public.tenant_inboxes i ON i.tenant_id = t.id
WHERE t.is_active
GROUP BY t.id, t.name
ORDER BY active_inboxes ASC;
```

Tenants met `active_inboxes = 0` moeten eerst gemigreerd worden, bel ze of log in als admin en koppel hun inbox via Settings → Inboxen.

## Bekende risico's bij verwijderen fallback

- Een tenant waarvan de wachtwoorden in vault corrupt zijn raakt polling kwijt totdat iemand handmatig opnieuw inlogt. Mitigatie: auto-deactivate + alert op `consecutive_failures >= 3`.
- Als een tenant zijn inbox vergeet te koppelen vóór verwijdering, stoppen orders binnen te komen zonder hele stille failure. Mitigatie: query hierboven runnen **vóór** de deploy die de fallback weghaalt.
