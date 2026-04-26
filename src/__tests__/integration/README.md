# Integratietests

Deze tests draaien tegen een echte Supabase-instance. Doel: bewijzen dat row-level-security en database-constraints in de praktijk doen wat de migrations beweren.

## Wanneer gebruiken

- Cross-tenant isolatie checks (RLS-policies)
- Privilege-escalatie pogingen (owner vs member vs anon)
- Cascade-delete en foreign-key gedrag
- Trigger- en RPC-effecten

Voor pure logica-tests: gebruik vitest unit-tests onder `src/__tests__/`. Voor statische API-audits: `src/__tests__/security/`.

## Lokaal draaien

Vereist de Supabase CLI met een lokale stack:

```bash
supabase start
# noteer de URLs en keys uit de output

export SUPABASE_TEST_URL=http://localhost:54321
export SUPABASE_TEST_ANON_KEY=<anon-key uit supabase start output>
export SUPABASE_TEST_SERVICE_KEY=<service_role key uit supabase start output>

npx vitest run src/__tests__/integration
```

Als de drie env-vars niet gezet zijn, skipt de hele suite. Ze breken dus geen lokale `npm run test` runs.

## Structuur

```
integration/
├── README.md           # dit bestand
└── rls/
    ├── setup.ts                      # helpers: createTenant, signIn, cleanup
    └── crossTenantOrders.test.ts     # voorbeeldtest, dekking groeit hier
```

`setup.ts` exporteert:
- `hasTestDb` — boolean, basis voor `describe.skipIf`
- `setupTenants()` — creëert twee onafhankelijke tenants met owner-users en geauthenticeerde clients
- `TestContext.cleanup()` — verwijdert alle test-data, draait via `afterAll`

## Op CI

Nog niet automatisch. De Supabase CLI in een GitHub-runner zetten plus secret-management is een aparte stap (overwogen voor sprint-7). Tot dan: handmatig draaien voor security-relevante PRs.
