# SolePOS SaaS operator portal

This standalone Next.js application is for platform operators only. It provides a tenant overview, manual subscription records, and audited time-limited support-access controls. Shop owners and staff do not receive access to this portal.

## Local development

1. Install Node.js 20.9 or newer.
2. Copy `.env.example` to `.env.local`; set the Supabase project URL and publishable key. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
3. Apply the new `supabase/migrations/20261021150000_operator_portal.sql` migration after the base multi-tenant migration.
4. In Supabase Auth, create each platform operator as an existing Auth user. This portal intentionally sets `shouldCreateUser: false`.
5. In the SQL Editor, add each approved operator to the backend-only allowlist, replacing the UUID:

   ```sql
   insert into public.platform_support_users (user_id)
   values ('AUTH_USER_UUID');
   ```

   Do this only as a trusted project administrator. The portal cannot grant itself platform access.
6. Under **Authentication → URL Configuration**, add `http://localhost:3000/auth/callback` to **Additional Redirect URLs**. For production, add the exact HTTPS callback URL for the deployed portal.
7. Run `npm install`, then `npm run dev` from this directory and open `http://localhost:3000`.
8. Sign in using the pre-authorized operator email. Subscription records and support sessions are shown only after the database confirms platform-operator membership.

## Controls and limitations

- The portal never uses a Supabase secret/service-role key. All tenant listing and subscription writes are guarded by `SECURITY DEFINER` RPCs which check `is_platform_support()`.
- Support access must include a reason and expires in 5–120 minutes. Operators can revoke their own sessions early.
- Support access does not mean a staff impersonation login. It creates a bounded database authorization window; tenant actions are recorded in `audit_log`.
- Subscription status is currently a manual operator record. Payment collection, invoicing, webhooks, automatic renewals, and entitlement/device enforcement are not implemented.
- Apply database changes through the checked-in Supabase migrations. Do not edit the hosted database schema manually after migration tracking is established.
