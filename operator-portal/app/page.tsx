import { LoginForm } from './login-form';
import { EndSupportForm, SubscriptionForm, SupportAccessForm } from './operator-actions';
import { signOut } from './actions';
import { createClient } from '@/lib/supabase/server';

export const instant = false;

type TenantRecord = {
  organization_id: string;
  organization_name: string;
  slug: string;
  created_at: string;
  store_count: number;
  plan_code: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  subscription_notes: string | null;
};

type SupportSession = {
  id: string;
  org_id: string;
  reason: string;
  starts_at: string;
  expires_at: string;
  revoked_at: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return <main className="login-shell"><section className="login-card"><p className="eyebrow">SOLEPOS · OPERATOR PORTAL</p><h1>Operator portal unavailable</h1><p className="message error">{userError.message}</p></section></main>;
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <p className="eyebrow">SOLEPOS · OPERATOR PORTAL</p>
          <h1>Sign in securely</h1>
          <p className="muted">Only pre-authorized platform operators can access this portal.</p>
          {params.error && <p className="message error">The sign-in link is invalid or expired. Request a new link.</p>}
          <LoginForm />
        </section>
      </main>
    );
  }

  const { data: isOperator, error: operatorError } = await supabase.rpc('is_platform_support');
  if (operatorError) {
    return <main className="login-shell"><section className="login-card"><p className="eyebrow">SOLEPOS · OPERATOR PORTAL</p><h1>Authorization check failed</h1><p className="message error">{operatorError.message}</p><p className="muted">Apply the operator portal migration before using this portal.</p></section></main>;
  }
  if (!isOperator) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <p className="eyebrow">SOLEPOS · OPERATOR PORTAL</p>
          <h1>Access not authorized</h1>
          <p className="muted">This account is signed in but is not enabled as a platform operator.</p>
          <form action={signOut}><button className="button-secondary" type="submit">Sign out</button></form>
        </section>
      </main>
    );
  }

  const [{ data: tenantData, error: tenantsError }, { data: sessionsData, error: sessionsError }] = await Promise.all([
    supabase.rpc('operator_list_tenants'),
    supabase.from('support_access_sessions')
      .select('id, org_id, reason, starts_at, expires_at, revoked_at')
      .eq('operator_id', user.id)
      .order('starts_at', { ascending: false })
      .limit(30),
  ]);
  const tenants = (tenantData ?? []) as TenantRecord[];
  const sessions = (sessionsData ?? []) as SupportSession[];
  const unrevokedSessions = sessions.filter((session) => !session.revoked_at);

  return (
    <main className="portal">
      <header className="topbar">
        <div><p className="eyebrow">SOLEPOS · SAAS OPERATIONS</p><h1>Operator console</h1></div>
        <div className="operator-info"><span>{user.email}</span><form action={signOut}><button className="button-secondary" type="submit">Sign out</button></form></div>
      </header>

      <section className="summary-grid" aria-label="Platform overview">
        <article className="summary-card"><span>Shops</span><strong>{tenantsError ? '—' : tenants.length}</strong></article>
        <article className="summary-card"><span>Unrevoked support sessions</span><strong>{sessionsError ? '—' : unrevokedSessions.length}</strong></article>
        <article className="summary-card"><span>Operator</span><strong className="operator-status">Authorized</strong></article>
      </section>

      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">TENANTS</p><h2>Customer shops</h2></div><p className="muted">Support access is time-limited and must include a reason.</p></div>
        {tenantsError ? (
          <p className="message error">Could not load shops: {tenantsError.message}</p>
        ) : tenants.length === 0 ? (
          <p className="empty-state">No shops have been provisioned yet.</p>
        ) : (
          <div className="tenant-list">
            {tenants.map((tenant) => (
              <article className="tenant-card" key={tenant.organization_id}>
                <div className="tenant-heading">
                  <div><h3>{tenant.organization_name}</h3><p className="muted">{tenant.slug} · Created {formatDate(tenant.created_at)}</p></div>
                  <span className={`status status-${tenant.subscription_status ?? 'unconfigured'}`}>{tenant.subscription_status ?? 'Not configured'}</span>
                </div>
                <div className="tenant-facts">
                  <span><b>Stores</b>{tenant.store_count}</span>
                  <span><b>Plan</b>{tenant.plan_code ?? 'Not assigned'}</span>
                  <span><b>Period end</b>{formatDate(tenant.current_period_end)}</span>
                </div>
                <details className="operator-details">
                  <summary>Manage subscription and support access</summary>
                  <div className="management-grid">
                    <section><h4>Subscription record</h4><SubscriptionForm
                      organizationId={tenant.organization_id}
                      planCode={tenant.plan_code}
                      status={tenant.subscription_status}
                      periodEnd={tenant.current_period_end}
                      notes={tenant.subscription_notes}
                    /></section>
                    <section><h4>Tenant support</h4><SupportAccessForm organizationId={tenant.organization_id} /></section>
                  </div>
                </details>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">AUDITABLE ACCESS</p><h2>Your support sessions</h2></div></div>
        {sessionsError ? (
          <p className="message error">Could not load support sessions: {sessionsError.message}</p>
        ) : sessions.length === 0 ? (
          <p className="empty-state">No support access sessions started from this account.</p>
        ) : (
          <div className="session-list">
            {sessions.map((session) => {
              const unrevoked = !session.revoked_at;
              return (
                <article className="session-row" key={session.id}>
                  <div><b>{session.org_id}</b><p>{session.reason}</p><small>{formatDate(session.starts_at)} — ends {formatDate(session.expires_at)}</small></div>
                  {unrevoked ? <EndSupportForm sessionId={session.id} /> : <span className="muted">Ended</span>}
                </article>
              );
            })}
          </div>
        )}
      </section>
      <footer className="footer-note">Subscription status is currently an operator-managed record; payment processing and automatic renewals are not connected.</footer>
    </main>
  );
}
