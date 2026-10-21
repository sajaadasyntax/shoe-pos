# SolePOS SaaS implementation plan

## Product goal

Turn the Android-only, offline-first shoe-store POS into a multi-tenant SaaS. Each customer organization must be isolated from other shops while using the same Supabase project. Shop owners manage their own stores and staff; platform operators use a separate Next.js portal for SaaS operations.

## Implemented foundation

- The Expo Android app has the local POS workflows and SQLite data store.
- Supabase migrations define the tenant-oriented backend foundation, memberships, store scope, RLS, and first-shop provisioning.
- The mobile app has a cloud-account preview for email-link sign-in, first-shop creation, and viewing the signed-in user's memberships and stores.
- A separate Next.js operator portal supports pre-authorized operator sign-in, tenant listing, manually maintained subscription records, and reasoned, time-limited support-access sessions.
- The portal uses authenticated Supabase access and guarded database RPCs; it does not require a service-role key.

## Current limitations

- Mobile POS authentication and operational data still use local SQLite. Cloud sign-in does not yet bind a tenant or staff identity to the local POS database, and POS records do not synchronize.
- Subscription records are operator-maintained metadata. Payment processing, automated renewals, and subscription/device entitlement enforcement are not implemented.
- The operator portal migration still needs to be applied to the hosted Supabase project. Any corrections made locally to a migration that has already been applied remotely must be delivered through a new additive migration.
- Production authentication, RLS, and support-access workflows have not yet been tested against the hosted project.

## Remaining work

### 1. Complete backend setup

- Apply outstanding migrations in order and add corrective migrations for changes to already-applied schema.
- Create operator Auth users and allowlist their user IDs from a trusted administrator context.
- Configure Supabase Auth redirect URLs for the Android app and deployed portal.
- Test tenant isolation, operator authorization, audit logging, subscription updates, support-access expiry, and early revocation against the hosted project.

### 2. Connect mobile identities and local data to tenants

- Define how shop owners invite sales users and map Supabase identities to local staff roles.
- Add tenant/store selection and enforce organization and store boundaries in the local database.
- Preserve offline access safely while handling sign-out, account changes, multiple organizations, and device-local data separation.
- Replace the cloud preview with the normal SaaS login/onboarding flow without breaking offline operation.

### 3. Implement safe offline synchronization

- Add a durable SQLite outbox with stable IDs, retry state, and idempotency keys.
- Implement authenticated, atomic server RPCs for sales, expenses, procurement, stock movements, and account-ledger transfers.
- Validate tenant/store ownership and financial invariants on the server; never rely on client-side authorization or validation.
- Reconcile server acknowledgements with local records and provide visible retry/error states.
- Keep offline sales that exceed available stock locally and flag them for manager review rather than dropping them or silently creating negative stock.
- Upload and associate bank receipts with the correct transaction, with suitable size/type limits and access controls.

### 4. Finish SaaS operations and commercial readiness

- Add a manager workflow for synchronization conflicts and stock-review decisions.
- Integrate a payment provider, webhook-driven subscription state, invoices, and entitlement enforcement.
- Replace or integrate the existing activation flow with subscription-aware device enrollment and revocation.
- Deploy the operator portal and document operator provisioning, recovery, and audit procedures.
- Add automated tests for migrations, RLS cross-tenant denial, offline retry/idempotency, financial transactions, and Android end-to-end workflows.

## Release gate

Do not describe the product as synchronized or production-ready for multi-shop SaaS until the hosted migrations, tenant-bound mobile identity, offline outbox, atomic financial RPCs, receipt handling, and cross-tenant authorization tests have all been completed.
