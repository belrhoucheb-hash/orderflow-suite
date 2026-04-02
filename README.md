# OrderFlow Suite

OrderFlow Suite is een robuust, multi-tenant Transport Management Systeem (TMS) gebouwd voor logistieke planners. Het stroomlijnt de order-intake, ritplanning, en het beheer van chauffeurs en ritten. Ontworpen met een focus op snelheid, is OrderFlow Suite sterk afhankelijk van AI (via Google Gemini) om ongestructureerde e-mailaanvragen direct om te zetten in gestructureerde, planbare transportorders.

## Belangrijkste Functies

- **AI-gedreven Inbox:**
  Automatiseert het extraheren van transportdetails uit inkomende e-mails (.eml). Ondersteunt zowel rule-based parsing als directe Google Gemini API calls (via Edge Functions) om orders voor te bereiden.
- **Multi-Tenant Architectuur:**
  Volledig gescheiden data en configuratie per huurder (tenant) met Row Level Security (RLS). Bijna elke tabel, inclusief chauffeurs en rapportages, respecteert strikt de actieve tenant context.
- **Geavanceerde Ritplanning:**
  Visuele en kaartgerichte planning. Gebruikt PDOK (voor Nederlandse adressen) en Nominatim voor internationale geocoding in combinatie met een nearest-neighbor algoritme voor routering en ETA-berekening.
- **Chauffeurs- en Vlootbeheer:**
  Uitgebreid beheer van een eigen vloot en externe charters, met functies voor de registratie van certificeringen (zoals ADR of Code 95 expiratie-datums), wekelijkse inspecties en actuele statusupdates.
- **Financieel en KPI Dashboards:**
  Ingebouwd overzicht van wekelijkse kosten, uurgemiddelden, brandstofverbruik en gegenereerde facturen gebaseerd op werkelijke ritten en wachttijden.

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Shadcn UI
- **State Management:** React Query, Zustand
- **Backend/Database:** Supabase (PostgreSQL) inclusief pgvector
- **Edge Functions:** Deno-gebaseerde functies voor AI-koppelingen (`parse-order`, `poll-inbox`, `send-confirmation`, etc.)
- **Kaarten & Geocoding:** Leaflet, PDOK Locatieserver, Nominatim

## Installatie & Setup

1. **Clone repository:**
   ```bash
   git clone <repository_url>
   cd orderflow-suite
   ```

2. **Installeer dependencies:**
   ```bash
   npm install
   ```

3. **Supabase instellen:**
   Koppel uw project aan uw eigen Supabase instantie. Zorg dat alle migraties/SQL in `supabase/migrations/` (incl. policies en RLS) succesvol uitgevoerd zijn.
   Vergeet niet om omgevingsvariabelen in te stellen in uw `.env` (of Supabase dashboard):
   - `GEMINI_API_KEY`: Voor de edge functions
   - SMTP details (voor de email notificaties)

4. **Lokale ontwikkeling:**
   ```bash
   npm run dev
   ```

## Workflow & Edge Functions
De AI workflows functioneren op de achtergrond.
1. `import-email`: Frontend functie die EML bestanden uploadt en parsings start.
2. `parse-order`: Analyseert ordertekst met Google Gemini The function returns gestructureerde JSON. Gebruik in Edge logs `ai_usage_log` om tokens en kosten bij te houden.
3. `poll-inbox`: Kan gebruikt worden via cron-jobs om mailboxen automatisch leeg te trekken.

## Licentie

Dit project is gelicentieerd onder de **Apache 2.0 Licentie**. Zie het [LICENSE](LICENSE) bestand voor meer details.
