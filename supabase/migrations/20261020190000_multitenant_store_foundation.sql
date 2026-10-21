-- Multi-tenant POS foundation.
-- Apply this migration to a new Supabase project before connecting the mobile app.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  created_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  timezone text not null default 'UTC',
  currency_code text not null default 'USD' check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (org_id, id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'sales')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (role <> 'sales' or store_id is not null),
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade
);

create unique index memberships_org_user_idx
  on public.memberships(org_id, user_id) where store_id is null;
create unique index memberships_store_user_idx
  on public.memberships(org_id, store_id, user_id) where store_id is not null;
create index memberships_user_org_idx on public.memberships(user_id, org_id) where active;

-- Support access is granted per organization, expires automatically, and requires a reason.
-- Manage platform_support_users only from a trusted backend using the service role.
create table public.platform_support_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.support_access_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references auth.users(id) on delete restrict,
  org_id uuid not null references public.organizations(id) on delete cascade,
  reason text not null check (length(trim(reason)) between 10 and 500),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (expires_at > starts_at)
);
create index support_access_active_idx
  on public.support_access_sessions(operator_id, org_id, expires_at)
  where revoked_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 160),
  size text not null check (length(trim(size)) between 1 and 40),
  price_minor bigint not null check (price_minor > 0),
  cost_minor bigint not null default 0 check (cost_minor >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, store_id, id),
  unique (store_id, name, size),
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('cash', 'bank')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (org_id, store_id, id),
  unique (store_id, name),
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade
);

create table public.sales (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  seller_id uuid not null references auth.users(id) on delete restrict,
  seller_name text not null,
  account_id uuid not null,
  payment_method text not null check (payment_method in ('cash', 'bank')),
  total_minor bigint not null check (total_minor > 0),
  receipt_path text,
  created_at timestamptz not null,
  unique (org_id, store_id, id),
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade,
  foreign key (org_id, store_id, account_id) references public.accounts(org_id, store_id, id) on delete restrict
);
create index sales_store_created_idx on public.sales(store_id, created_at desc);
create index sales_seller_created_idx on public.sales(store_id, seller_id, created_at desc);

create table public.sale_lines (
  id uuid primary key,
  org_id uuid not null,
  store_id uuid not null,
  sale_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  size text not null,
  quantity integer not null check (quantity > 0),
  unit_price_minor bigint not null check (unit_price_minor > 0),
  unit_cost_minor bigint not null check (unit_cost_minor >= 0),
  foreign key (org_id, store_id, sale_id) references public.sales(org_id, store_id, id) on delete cascade,
  foreign key (org_id, store_id, product_id) references public.products(org_id, store_id, id) on delete restrict
);
create index sale_lines_sale_idx on public.sale_lines(sale_id);

create table public.stock_movements (
  id uuid primary key,
  org_id uuid not null,
  store_id uuid not null,
  product_id uuid not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null check (reason in ('opening_stock', 'sale', 'procurement', 'adjustment')),
  source_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (org_id, store_id, product_id) references public.products(org_id, store_id, id) on delete restrict
);
create index stock_movements_product_idx on public.stock_movements(store_id, product_id, created_at);

create table public.expenses (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  category text not null check (length(trim(category)) between 1 and 60),
  amount_minor bigint not null check (amount_minor > 0),
  account_id uuid not null,
  note text,
  receipt_path text,
  created_at timestamptz not null,
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade,
  foreign key (org_id, store_id, account_id) references public.accounts(org_id, store_id, id) on delete restrict
);
create index expenses_store_created_idx on public.expenses(store_id, created_at desc);
create index expenses_user_created_idx on public.expenses(store_id, user_id, created_at desc);

create table public.procurements (
  id uuid primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  supplier text not null check (length(trim(supplier)) between 1 and 120),
  created_by uuid not null references auth.users(id) on delete restrict,
  total_minor bigint not null check (total_minor > 0),
  paid_minor bigint not null default 0 check (paid_minor >= 0 and paid_minor <= total_minor),
  account_id uuid,
  receipt_path text,
  created_at timestamptz not null,
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade,
  foreign key (org_id, store_id, account_id) references public.accounts(org_id, store_id, id) on delete restrict
);
create index procurements_store_created_idx on public.procurements(store_id, created_at desc);

create table public.procurement_lines (
  id uuid primary key,
  org_id uuid not null,
  store_id uuid not null,
  procurement_id uuid not null,
  product_id uuid not null,
  product_name text not null,
  size text not null,
  quantity integer not null check (quantity > 0),
  unit_cost_minor bigint not null check (unit_cost_minor >= 0),
  foreign key (org_id, store_id, procurement_id) references public.procurements(org_id, store_id, id) on delete cascade,
  foreign key (org_id, store_id, product_id) references public.products(org_id, store_id, id) on delete restrict
);

create table public.account_movements (
  id uuid primary key,
  org_id uuid not null,
  store_id uuid not null,
  account_id uuid not null,
  amount_minor bigint not null check (amount_minor <> 0),
  movement_type text not null check (
    movement_type in ('opening_balance', 'sale', 'expense', 'procurement', 'transfer_in', 'transfer_out', 'adjustment')
  ),
  source_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),
  foreign key (org_id, store_id, account_id) references public.accounts(org_id, store_id, id) on delete restrict
);
create index account_movements_account_created_idx
  on public.account_movements(store_id, account_id, created_at desc);

create table public.whatsapp_share_status (
  sale_id uuid primary key references public.sales(id) on delete cascade,
  status text not null check (status in ('opened', 'confirmed', 'skipped')),
  updated_at timestamptz not null default now()
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  store_id uuid not null,
  device_id text not null,
  entity_type text not null check (entity_type in ('sale', 'expense', 'procurement', 'stock_movement')),
  entity_id uuid not null,
  conflict_type text not null check (conflict_type in ('insufficient_stock', 'duplicate', 'invalid_reference', 'permission_revoked')),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'rejected')),
  resolution_note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete restrict,
  resolved_at timestamptz,
  foreign key (org_id, store_id) references public.stores(org_id, id) on delete cascade
);
create index sync_conflicts_pending_idx on public.sync_conflicts(store_id, created_at)
  where status = 'pending';

create table public.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  store_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  support_session_id uuid references public.support_access_sessions(id) on delete set null,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  occurred_at timestamptz not null default now()
);
create index audit_log_org_time_idx on public.audit_log(org_id, occurred_at desc);

create or replace function public.is_platform_support()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_support_users s
    where s.user_id = (select auth.uid()) and s.enabled
  );
$$;

create or replace function public.has_org_access(target_org uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org and m.user_id = (select auth.uid()) and m.active
  ) or exists (
    select 1 from public.support_access_sessions s
    join public.platform_support_users p on p.user_id = s.operator_id and p.enabled
    where s.org_id = target_org and s.operator_id = (select auth.uid())
      and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now()
  );
$$;

create or replace function public.has_store_access(target_org uuid, target_store uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org and m.user_id = (select auth.uid()) and m.active
      and (m.store_id = target_store or (m.store_id is null and m.role in ('owner', 'admin')))
  ) or exists (
    select 1 from public.support_access_sessions s
    join public.platform_support_users p on p.user_id = s.operator_id and p.enabled
    where s.org_id = target_org and s.operator_id = (select auth.uid())
      and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now()
  );
$$;

create or replace function public.has_store_role(target_org uuid, target_store uuid, allowed_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = target_org and m.user_id = (select auth.uid()) and m.active
      and m.role = any(allowed_roles)
      and (m.store_id = target_store or (m.store_id is null and m.role in ('owner', 'admin')))
  ) or exists (
    select 1 from public.support_access_sessions s
    join public.platform_support_users p on p.user_id = s.operator_id and p.enabled
    where s.org_id = target_org and s.operator_id = (select auth.uid())
      and s.revoked_at is null and s.starts_at <= now() and s.expires_at > now()
  );
$$;

create or replace function public.can_view_profile(target_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select target_user = (select auth.uid()) or exists (
    select 1
    from public.memberships theirs
    where theirs.user_id = target_user and theirs.active
      and (
        exists (
          select 1 from public.memberships mine
          where mine.org_id = theirs.org_id and mine.user_id = (select auth.uid())
            and mine.active and mine.role in ('owner', 'admin')
        )
        or (public.is_platform_support() and public.has_org_access(theirs.org_id))
      )
  );
$$;

create or replace function public.create_shop(
  shop_name text,
  first_store_name text,
  shop_slug text,
  owner_name text
)
returns table (organization_id uuid, store_id uuid)
language plpgsql security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
  new_store_id uuid;
  normalized_slug text := lower(trim(shop_slug));
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if shop_name is null or first_store_name is null or shop_slug is null or owner_name is null
    or length(trim(shop_name)) not between 1 and 120
    or length(trim(first_store_name)) not between 1 and 120
    or length(trim(owner_name)) not between 1 and 120
    or normalized_slug !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' then
    raise exception using errcode = '22023', message = 'Invalid organization, store, owner, or slug.';
  end if;

  insert into public.organizations (name, slug)
    values (trim(shop_name), normalized_slug) returning id into new_org_id;
  insert into public.stores (org_id, name)
    values (new_org_id, trim(first_store_name)) returning id into new_store_id;
  insert into public.profiles (id, full_name)
    values ((select auth.uid()), trim(owner_name))
    on conflict (id) do update set full_name = excluded.full_name, updated_at = now();
  insert into public.memberships (org_id, store_id, user_id, role)
    values (new_org_id, null, (select auth.uid()), 'owner');
  insert into public.accounts (org_id, store_id, name, kind)
    values (new_org_id, new_store_id, 'Cash', 'cash');

  return query select new_org_id, new_store_id;
end;
$$;

create or replace function public.end_support_access(target_session uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.support_access_sessions
    set revoked_at = now()
    where id = target_session and operator_id = (select auth.uid())
      and public.is_platform_support() and revoked_at is null;
  if not found then
    raise exception using errcode = '42501', message = 'Active support session not found.';
  end if;
end;
$$;

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
  target_id := row_data ->> 'id';
  if target_id is null then target_id := row_data ->> 'sale_id'; end if;
  if target_id is null then target_id := row_data ->> 'account_id'; end if;
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

create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.write_audit_log();
create trigger audit_organizations after insert or update or delete on public.organizations
  for each row execute function public.write_audit_log();
create trigger audit_stores after insert or update or delete on public.stores
  for each row execute function public.write_audit_log();
create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function public.write_audit_log();
create trigger audit_support_sessions after insert or update or delete on public.support_access_sessions
  for each row execute function public.write_audit_log();
create trigger audit_sales after insert or update or delete on public.sales
  for each row execute function public.write_audit_log();
create trigger audit_sale_lines after insert or update or delete on public.sale_lines
  for each row execute function public.write_audit_log();
create trigger audit_stock_movements after insert or update or delete on public.stock_movements
  for each row execute function public.write_audit_log();
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.write_audit_log();
create trigger audit_procurements after insert or update or delete on public.procurements
  for each row execute function public.write_audit_log();
create trigger audit_procurement_lines after insert or update or delete on public.procurement_lines
  for each row execute function public.write_audit_log();
create trigger audit_accounts after insert or update or delete on public.accounts
  for each row execute function public.write_audit_log();
create trigger audit_account_movements after insert or update or delete on public.account_movements
  for each row execute function public.write_audit_log();
create trigger audit_sync_conflicts after insert or update or delete on public.sync_conflicts
  for each row execute function public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.stores enable row level security;
alter table public.memberships enable row level security;
alter table public.platform_support_users enable row level security;
alter table public.support_access_sessions enable row level security;
alter table public.products enable row level security;
alter table public.accounts enable row level security;
alter table public.sales enable row level security;
alter table public.sale_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.expenses enable row level security;
alter table public.procurements enable row level security;
alter table public.procurement_lines enable row level security;
alter table public.account_movements enable row level security;
alter table public.whatsapp_share_status enable row level security;
alter table public.sync_conflicts enable row level security;
alter table public.audit_log enable row level security;

revoke all on public.profiles, public.organizations, public.stores, public.memberships,
  public.platform_support_users, public.support_access_sessions, public.products,
  public.accounts, public.sales, public.sale_lines, public.stock_movements,
  public.expenses, public.procurements, public.procurement_lines,
  public.account_movements, public.whatsapp_share_status, public.sync_conflicts,
  public.audit_log from anon, authenticated;
grant select, insert, update, delete on public.profiles, public.organizations, public.stores,
  public.memberships, public.support_access_sessions, public.products, public.accounts,
  public.sales, public.sale_lines, public.stock_movements, public.expenses, public.procurements,
  public.procurement_lines, public.account_movements, public.whatsapp_share_status,
  public.sync_conflicts to authenticated;
grant select on public.audit_log to authenticated;

create policy profiles_read_scoped on public.profiles for select to authenticated
  using (public.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy organizations_read_member_support on public.organizations for select to authenticated
  using (public.has_org_access(id));
create policy organizations_update_admin on public.organizations for update to authenticated
  using (exists (select 1 from public.memberships m where m.org_id = id and m.user_id = (select auth.uid()) and m.active and m.role in ('owner', 'admin')))
  with check (exists (select 1 from public.memberships m where m.org_id = id and m.user_id = (select auth.uid()) and m.active and m.role in ('owner', 'admin')));

create policy stores_read_scoped on public.stores for select to authenticated
  using (public.has_store_access(org_id, id));
create policy stores_insert_admin on public.stores for insert to authenticated
  with check (public.has_store_role(org_id, id, array['owner', 'admin']));
create policy stores_update_admin on public.stores for update to authenticated
  using (public.has_store_role(org_id, id, array['owner', 'admin']))
  with check (public.has_store_role(org_id, id, array['owner', 'admin']));

create policy memberships_read_org on public.memberships for select to authenticated
  using (public.has_org_access(org_id));
create policy memberships_insert_admin on public.memberships for insert to authenticated
  with check (role <> 'owner' and public.has_store_role(org_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), array['owner', 'admin']));
create policy memberships_update_admin on public.memberships for update to authenticated
  using (role <> 'owner' and public.has_org_access(org_id) and public.has_store_role(org_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), array['owner', 'admin']))
  with check (role <> 'owner' and public.has_org_access(org_id) and public.has_store_role(org_id, coalesce(store_id, '00000000-0000-0000-0000-000000000000'::uuid), array['owner', 'admin']));

create policy support_sessions_read_scoped on public.support_access_sessions for select to authenticated
  using (operator_id = (select auth.uid()) or public.has_org_access(org_id));

create policy products_read_store on public.products for select to authenticated
  using (public.has_store_access(org_id, store_id));
create policy products_insert_admin on public.products for insert to authenticated
  with check (public.has_store_role(org_id, store_id, array['owner', 'admin']));
create policy products_update_admin on public.products for update to authenticated
  using (public.has_store_role(org_id, store_id, array['owner', 'admin']))
  with check (public.has_store_role(org_id, store_id, array['owner', 'admin']));
create policy products_delete_admin on public.products for delete to authenticated
  using (public.has_store_role(org_id, store_id, array['owner', 'admin']));

create policy accounts_read_store on public.accounts for select to authenticated
  using (public.has_store_access(org_id, store_id));
create policy accounts_insert_admin on public.accounts for insert to authenticated
  with check (public.has_store_role(org_id, store_id, array['owner', 'admin']));
create policy accounts_update_admin on public.accounts for update to authenticated
  using (public.has_store_role(org_id, store_id, array['owner', 'admin']))
  with check (public.has_store_role(org_id, store_id, array['owner', 'admin']));

create policy sales_read_role_scoped on public.sales for select to authenticated
  using (public.has_store_access(org_id, store_id)
    and (public.has_store_role(org_id, store_id, array['owner', 'admin']) or seller_id = (select auth.uid())));
create policy sale_lines_read_role_scoped on public.sale_lines for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id and s.org_id = org_id and s.store_id = store_id
    and public.has_store_access(s.org_id, s.store_id)
    and (public.has_store_role(s.org_id, s.store_id, array['owner', 'admin']) or s.seller_id = (select auth.uid()))));
create policy stock_movements_read_store on public.stock_movements for select to authenticated
  using (public.has_store_access(org_id, store_id));

create policy expenses_read_role_scoped on public.expenses for select to authenticated
  using (public.has_store_access(org_id, store_id)
    and (public.has_store_role(org_id, store_id, array['owner', 'admin']) or user_id = (select auth.uid())));

create policy procurements_read_admin on public.procurements for select to authenticated
  using (public.has_store_role(org_id, store_id, array['owner', 'admin']));
create policy procurement_lines_read_admin on public.procurement_lines for select to authenticated
  using (exists (select 1 from public.procurements p where p.id = procurement_id and p.org_id = org_id and p.store_id = store_id
    and public.has_store_role(p.org_id, p.store_id, array['owner', 'admin'])));

create policy account_movements_read_store on public.account_movements for select to authenticated
  using (public.has_store_access(org_id, store_id));

create policy whatsapp_status_read_sale_scope on public.whatsapp_share_status for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id
    and (public.has_store_role(s.org_id, s.store_id, array['owner', 'admin']) or s.seller_id = (select auth.uid()))));
create policy whatsapp_status_insert_sale_scope on public.whatsapp_share_status for insert to authenticated
  with check (exists (select 1 from public.sales s where s.id = sale_id
    and (public.has_store_role(s.org_id, s.store_id, array['owner', 'admin']) or s.seller_id = (select auth.uid()))));
create policy whatsapp_status_update_sale_scope on public.whatsapp_share_status for update to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id
    and (public.has_store_role(s.org_id, s.store_id, array['owner', 'admin']) or s.seller_id = (select auth.uid()))))
  with check (exists (select 1 from public.sales s where s.id = sale_id
    and (public.has_store_role(s.org_id, s.store_id, array['owner', 'admin']) or s.seller_id = (select auth.uid()))));

create policy sync_conflicts_read_admin on public.sync_conflicts for select to authenticated
  using (public.has_store_role(org_id, store_id, array['owner', 'admin']));
create policy sync_conflicts_update_admin on public.sync_conflicts for update to authenticated
  using (public.has_store_role(org_id, store_id, array['owner', 'admin']))
  with check (public.has_store_role(org_id, store_id, array['owner', 'admin']));

create policy audit_log_read_admin_support on public.audit_log for select to authenticated
  using (public.has_org_access(org_id) and (
    exists (select 1 from public.memberships m where m.org_id = org_id and m.user_id = (select auth.uid()) and m.active and m.role in ('owner', 'admin'))
    or public.is_platform_support()
  ));

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
  if not exists (select 1 from public.organizations o where o.id = target_org) then
    raise exception using errcode = 'P0002', message = 'Organization not found.';
  end if;
  if length(trim(access_reason)) not between 10 and 500 or duration_minutes not between 5 and 120 then
    raise exception using errcode = '22023', message = 'A reason and a duration between 5 and 120 minutes are required.';
  end if;
  insert into public.support_access_sessions (operator_id, org_id, reason, expires_at)
    values ((select auth.uid()), target_org, trim(access_reason), now() + make_interval(mins => duration_minutes))
    returning id into session_id;
  return session_id;
end;
$$;

revoke all on function public.is_platform_support() from public, anon;
revoke all on function public.has_org_access(uuid) from public, anon;
revoke all on function public.has_store_access(uuid, uuid) from public, anon;
revoke all on function public.has_store_role(uuid, uuid, text[]) from public, anon;
revoke all on function public.can_view_profile(uuid) from public, anon;
revoke all on function public.create_shop(text, text, text, text) from public, anon;
revoke all on function public.begin_support_access(uuid, text, integer) from public, anon;
revoke all on function public.end_support_access(uuid) from public, anon;
revoke all on function public.write_audit_log() from public, anon, authenticated;
grant execute on function public.is_platform_support() to authenticated;
grant execute on function public.has_org_access(uuid) to authenticated;
grant execute on function public.has_store_access(uuid, uuid) to authenticated;
grant execute on function public.has_store_role(uuid, uuid, text[]) to authenticated;
grant execute on function public.can_view_profile(uuid) to authenticated;
grant execute on function public.create_shop(text, text, text, text) to authenticated;
grant execute on function public.begin_support_access(uuid, text, integer) to authenticated;
grant execute on function public.end_support_access(uuid) to authenticated;

-- No client role can grant itself platform support. Use a trusted backend only.
revoke all on public.platform_support_users from anon, authenticated;
