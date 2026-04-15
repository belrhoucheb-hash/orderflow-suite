# Security Audit — OrderFlow Suite
**Datum:** 2026-04-06
**Status:** IN PROGRESS

## CRITICAL Issues
1. RLS policies met `USING (true)` — cross-tenant data access mogelijk
2. Chauffeur PIN default "0000" en client-side lockout
3. CORS `Access-Control-Allow-Origin: *` op alle edge functions
4. Edge functions zonder JWT validatie (import-email, send-notification)
5. chauffeur_mode via localStorage (role bypass)
6. .env credentials in git history

## Fixes Applied
- [ ] RLS hardening (tenant isolation op alle tabellen)
- [ ] CORS restricties
- [ ] JWT validatie op edge functions
- [ ] PIN security verbetering
- [ ] chauffeur_mode fix
- [ ] Input sanitization
