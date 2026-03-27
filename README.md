# OrderFlow Suite — Open Source TMS

Multi-tenant Transport Management System built for logistics companies that need modern order management, intelligent planning, and full fleet oversight.

## Features

- **AI-Powered Inbox** — Automatically parse incoming transport orders from email using Google Gemini AI
- **Drag-and-Drop Planning** — Visual planning board to assign orders to drivers and vehicles
- **Fleet Management** — Track vehicles, maintenance schedules, documents, and availability
- **Driver Management** — Manage driver profiles, assignments, and ride history
- **Client Management** — Client database with locations, rates, and extraction templates
- **Reporting** — Dashboards and reports for operational insights
- **Multi-Tenant** — Full tenant isolation with per-tenant data, members, and roles
- **Configurable Branding** — Per-tenant branding and settings

## Tech Stack

| Layer | Technology |
|-------|------------|
| Build | [Vite](https://vitejs.dev/) |
| UI | [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) |
| Backend | [Supabase](https://supabase.com/) (Postgres, Auth, Edge Functions, RLS) |
| AI | [Google Gemini AI](https://ai.google.dev/) |

## Quick Start

### Prerequisites

- Node.js 18+
- npm or bun
- A Supabase project
- A Google Cloud account (for Gemini AI features)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/orderflow-suite.git
cd orderflow-suite

# Install dependencies
npm install

# Copy the example environment file and fill in your values
cp .env.example .env

# Start the development server
npm run dev
```

The app will be available at `http://localhost:5173`.

## Environment Variables

Create a `.env` file in the project root based on `.env.example`:

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_PROJECT_ID` | Your Supabase project ID |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public key |
| `VITE_SUPABASE_URL` | Full Supabase project URL (e.g. `https://<id>.supabase.co`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to your GCP service account JSON file |
| `GEMINI_API_KEY` | Google Gemini API key for AI features |

## Project Structure

```
orderflow-suite/
├── src/
│   ├── pages/              # Top-level route pages
│   │   ├── Dashboard.tsx
│   │   ├── Inbox.tsx
│   │   ├── Orders.tsx
│   │   ├── Planning.tsx
│   │   ├── Fleet.tsx
│   │   ├── Clients.tsx
│   │   ├── ChauffeursRit.tsx
│   │   ├── Rapportage.tsx
│   │   ├── Settings.tsx
│   │   └── ...
│   ├── components/         # Reusable UI components
│   │   ├── ui/             # shadcn/ui primitives
│   │   ├── inbox/          # AI inbox components
│   │   ├── planning/       # Planning board components
│   │   ├── fleet/          # Fleet management components
│   │   ├── orders/         # Order components
│   │   ├── clients/        # Client components
│   │   ├── dashboard/      # Dashboard widgets
│   │   ├── settings/       # Settings panels
│   │   └── ...
│   └── hooks/              # Custom React hooks
│       ├── useOrders.ts
│       ├── useDrivers.ts
│       ├── useFleet.ts
│       ├── useClients.ts
│       ├── useNotifications.ts
│       └── ...
├── supabase/
│   ├── migrations/         # Database migration SQL files
│   └── functions/          # Supabase Edge Functions
│       ├── create-order/
│       ├── parse-order/
│       ├── poll-inbox/
│       ├── import-email/
│       ├── send-confirmation/
│       ├── send-follow-up/
│       └── google-places/
├── .env.example
├── tailwind.config.ts
├── vite.config.ts
└── package.json
```

## Supabase Setup

OrderFlow Suite uses Supabase as its backend. All database schema changes are tracked as migration files in `supabase/migrations/`.

### Running Migrations

```bash
# Link your Supabase project
npx supabase link --project-ref <your-project-id>

# Apply all migrations
npx supabase db push
```

### Database Tables

The migrations create the following tables:

| Table | Purpose |
|-------|---------|
| `tenants` | Tenant (organization) records for multi-tenancy |
| `tenant_members` | Maps users to tenants with roles |
| `profiles` | User profiles linked to Supabase Auth |
| `user_roles` | Role assignments for access control |
| `orders` | Transport orders with status tracking |
| `clients` | Client companies |
| `client_locations` | Pickup/delivery addresses per client |
| `client_rates` | Pricing rates per client |
| `client_extraction_templates` | AI extraction templates per client |
| `drivers` | Driver profiles |
| `vehicles` | Vehicle records |
| `vehicle_types` | Vehicle type definitions |
| `vehicle_availability` | Vehicle availability windows |
| `vehicle_documents` | Vehicle documents (insurance, registration, etc.) |
| `vehicle_maintenance` | Maintenance logs |
| `loading_units` | Loading unit definitions |
| `requirement_types` | Order requirement type definitions |
| `notifications` | In-app notifications |
| `activity_log` | Audit trail of actions |
| `ai_usage_log` | Tracks AI feature usage |

Row Level Security (RLS) policies are applied to all tables to enforce tenant isolation.

### Edge Functions

Supabase Edge Functions handle server-side logic:

- **poll-inbox** — Polls email inboxes for new transport orders
- **import-email** — Imports raw email content
- **parse-order** — Uses Gemini AI to extract structured order data from emails
- **create-order** — Creates orders in the database
- **send-confirmation** — Sends order confirmation emails
- **send-follow-up** — Sends follow-up communications
- **google-places** — Proxies Google Places API for address autocomplete

## License

Copyright 2026 OrderFlow Suite Contributors

Licensed under the Apache License, Version 2.0. See [LICENSE](./LICENSE) for the full license text.
