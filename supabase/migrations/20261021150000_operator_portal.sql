create table public.saas_subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan_code text not null check (plan_code in ('starter', 'growth', 'enterprise')),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled')),
  started_at timestamptz not null default now(),
  current_period_end timestamptz,
  billing_provider text not null default 'manual' check (billing_provider in ('manual', 'stripe')),
  external_customer_id text,
  notes text not null default '' check (length(notes) <= 1000),
  managed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.saas_subscriptions enable row level security;
revoke all on public.saas_subscriptions from anon, authenticated;

create or replace function public.write_audit_log()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  row_data jsonb;
  target_org uuid;
  target_store uuid;
  target_id text;
  active_support_session uuid;
begin
  row_data := case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if TG_TABLE_NAME = 'organizations' then
    target_org := (row_data ->> 'id')::uuid;
  else
    target_org := (row_data ->> 'org_id')::uuid;
  end if;
  target_store := nullif(row_data ->> 'store_id', '')::uuid;
  target_id := coalesce(row_data ->> 'id', row_data ->> 'sale_id', row_data ->> 'account_id', row_data ->> 'org_id');
  if target_org is not null then
    select s.id into active_support_session
    from public.support_access_sessions s
    where s.operator_id = (select auth.uid()) and s.org_id = target_org
      and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now()
    order by s.starts_at desc limit 1;
    insert into public.audit_log
      (org_id, store_id, actor_id, support_session_id, table_name, record_id, operation)
    values (target_org, target_store, (select auth.uid()), active_support_session, TG_TABLE_NAME, coalesce(target_id, 'unknown'), TG_OP);
  end if;
  if TG_OP = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger audit_saas_subscriptions after insert or update or delete on public.saas_subscriptions
  for each row execute function public.write_audit_log();

create or replace function public.begin_support_access(target_org uuid, access_reason text, duration_minutes integer default 30)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  session_id uuid;
begin
  if not public.is_platform_support() then
    raise exception using errcode = '42501', message = 'Platform support access is required.';
  end if;
  if target_org is null or not exists (select 1 from public.organizations o where o.id = target_org) then
    raise exception using errcode = 'P0002', message = 'Organization not found.';
  end if;
  if access_reason is null or length(trim(access_reason)) not between 10 and 500
    or duration_minutes is null or duration_minutes not between 5 and 120 then
    raise exception using errcode = '22023', message = 'A reason and a duration between 5 and 120 minutes are required.';
  end if;
  insert into public.support_access_sessions (operator_id, org_id, reason, expires_at)
    values ((select auth.uid()), target_org, trim(access_reason), now() + make_interval(mins => duration_minutes))
    returning id into session_id;
  return session_id;
end;
$$;

create or replace function public.operator_list_tenants()
returns table (
  organization_id uuid,
  organization_name text,
  slug text,
  created_at timestamptz,
  store_count bigint,
  plan_code text,
  subscription_status text,
  current_period_end timestamptz,
  subscription_notes text
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_platform_support() then
    raise exception using errcode = '42501', message = 'Platform operator access is required.';
  end if;
  return query
    select o.id, o.name, o.slug, o.created_at, count(distinct st.id),
      sub.plan_code, sub.status, sub.current_period_end, sub.notes
    from public.organizations o
    left join public.stores st on st.org_id = o.id
    left join public.saas_subscriptions sub on sub.org_id = o.id
    group by o.id, o.name, o.slug, o.created_at, sub.plan_code, sub.status, sub.current_period_end, sub.notes
    order by o.created_at desc;
end;
$$;

create or replace function public.operator_set_subscription(
  target_org uuid,
  selected_plan text,
  selected_status text,
  period_end timestamptz,
  operator_notes text default ''
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_platform_support() then
    raise exception using errcode = '42501', message = 'Platform operator access is required.';
  end if;
  if selected_plan is null or selected_plan not in ('starter', 'growth', 'enterprise')
    or selected_status is null or selected_status not in ('trialing', 'active', 'past_due', 'canceled')
    or coalesce(length(operator_notes), 0) > 1000 then
    raise exception using errcode = '22023', message = 'Subscription details are invalid.';
  end if;
  if not exists (select 1 from public.organizations o where o.id = target_org) then
    raise exception using errcode = 'P0002', message = 'Organization not found.';
  end if;
  insert into public.saas_subscriptions
    (org_id, plan_code, status, current_period_end, notes, managed_by, updated_at)
  values (target_org, selected_plan, selected_status, period_end, coalesce(operator_notes, ''), (select auth.uid()), now())
  on conflict (org_id) do update set
    plan_code = excluded.plan_code,
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    notes = excluded.notes,
    managed_by = excluded.managed_by,
    updated_at = now();
end;
$$;

revoke all on function public.operator_list_tenants() from public, anon;
revoke all on function public.operator_set_subscription(uuid, text, text, timestamptz, text) from public, anon;
grant execute on function public.operator_list_tenants() to authenticated;
grant execute on function public.operator_set_subscription(uuid, text, text, timestamptz, text) to authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;
