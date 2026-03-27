# Contributing to OrderFlow Suite

Thank you for your interest in contributing. This guide will help you get started.

## Development Setup

1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your Supabase and Google Cloud credentials.
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. For Supabase Edge Functions, install the [Supabase CLI](https://supabase.com/docs/guides/cli) and run:
   ```bash
   npx supabase start
   npx supabase functions serve
   ```

## Code Style

- **TypeScript** — All code must be written in TypeScript. Avoid `any` types; use proper interfaces and type definitions.
- **React** — Use functional components and React hooks. No class components.
- **Tailwind CSS** — Use Tailwind utility classes for styling. Avoid inline styles and custom CSS unless absolutely necessary.
- **shadcn/ui** — Use existing shadcn/ui components before building custom ones.
- **Imports** — Use path aliases (e.g. `@/components/...`) instead of relative paths.
- **Naming** — PascalCase for components and types, camelCase for functions and variables.

## Submitting Pull Requests

1. Create a feature branch from `main` (see branch naming below).
2. Make your changes in small, focused commits.
3. Ensure the app builds without errors: `npm run build`.
4. Open a pull request against `main`.
5. Describe what the PR does and why. Include screenshots for UI changes.
6. Link any related issues.

## Branch Naming

Use the following prefixes:

| Prefix | Use case |
|--------|----------|
| `feature/` | New features (e.g. `feature/sla-dashboard`) |
| `fix/` | Bug fixes (e.g. `fix/order-status-update`) |
| `refactor/` | Code refactoring with no behavior change |
| `docs/` | Documentation only |
| `chore/` | Tooling, dependencies, CI changes |

## Reporting Issues

Open a GitHub issue with a clear description, steps to reproduce, and expected vs. actual behavior. Include browser and OS information for UI bugs.
