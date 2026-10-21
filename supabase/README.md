# Supabase backend foundation

This project is moving from a single-device SQLite app to an offline-first SaaS POS. Every customer is an isolated organization (tenant); the schema supports several stores per organization. A new account initially creates one organization and one store. Tenant staff cannot query another organization's data.

## Provision a Supabase project

1. Create a Supabase project and enable email magic-link sign-in.
2. Apply `migrations/20261020190000_multitenant_store_foundation.sql` followed by `migrations/20261021150000_operator_portal.sql` in the Supabase SQL Editor for a one-time setup, or apply outstanding migrations with the Supabase CLI.
3. Add the Supabase project URL and publishable/anon key from `.env.example` to `.env.local` (preserve any existing local variables). Never put a `service_role` key in the app.
4. The migration provides a `create_shop` RPC for provisioning the first organization, store, owner membership, and cash account after authentication.
5. Platform support accounts must be managed from a trusted server using the service role. Support staff must call `begin_support_access` with a reason before accessing a tenant; access expires within 5–120 minutes and write actions are recorded in `audit_log`.

## Current boundary

The migration and client configuration establish the tenant-safe backend foundation only. The existing app still authenticates users locally and SQLite remains the active data source. Do not treat the app as a deployed SaaS or connect customer data until the next implementation phase replaces local-only login with Supabase email-link authentication, tenant/store selection, and role-bound memberships. The current manual device activation also remains in the app; it needs to be replaced with subscription-aware device enrollment before customer onboarding.

Offline synchronization is also not wired yet. It must use stable local IDs and an idempotent outbox. Sales must be committed by a server-side transaction that checks stock while locking affected products; if stock is insufficient, the local sale stays saved and is queued as a manager-review conflict instead of being silently dropped or creating negative stock.

The current policies deliberately do not allow direct client writes to sales, expenses, procurement, stock movements, or account ledger entries. These multi-record operations must be added as atomic, validated Postgres RPCs before the app starts syncing them.

The standalone Next.js SaaS operator portal is under `operator-portal/`. Its additional migration adds manual subscription records and operator-only tenant listing/updating RPCs. Create operator Auth users first, then allowlist their user IDs in `platform_support_users` from a trusted administrator session. Do not expose that allowlist or a secret/service-role key to the portal.

## Security notes

- Row Level Security is enabled on every exposed table. The anon role has no table grants.
- Shop administration and sales-user access are tenant scoped.
- Support staff do not have standing tenant access; access is time-limited, per organization, and reasoned. The initial policies allow scoped support access to tenant data; changes made during support are recorded in the audit log.
- Do not expose the Supabase service-role key, database password, or signing secrets in Expo `EXPO_PUBLIC_*` variables.
- Before launch, add automated RLS tests for cross-tenant read/write denial and tenant-admin, sales, and support workflows.
