-- ============================================================================
-- Spyda admin activity notifications and custom coupon repair
--
-- Keeps the admin informed about meaningful platform activity and removes any
-- legacy coupon constraint that prevents custom values such as 100,000 credits.
-- ============================================================================

-- Older deployments may still have a preset-only credit_amount constraint.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.coupons'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%credit_amount%'
  loop
    execute format(
      'alter table public.coupons drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.coupons
  add constraint coupons_credit_amount_range_check
  check (credit_amount between 1 and 10000000) not valid;

drop function if exists public.generate_coupon(integer);
create function public.generate_coupon(
  p_credit_amount integer
) returns public.coupons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_coupon public.coupons;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can create coupon codes.'
      using errcode = '42501';
  end if;
  if p_credit_amount is null
     or p_credit_amount < 1
     or p_credit_amount > 10000000 then
    raise exception 'Coupon amount must be between 1 and 10,000,000 Spyda credits.';
  end if;

  loop
    v_code := 'SPYDA-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    exit when not exists (
      select 1 from public.coupons c where upper(c.code) = v_code
    );
  end loop;

  insert into public.coupons (code, credit_amount, status, created_by)
  values (v_code, p_credit_amount, 'active', auth.uid())
  returning * into v_coupon;

  return v_coupon;
end;
$$;

revoke all on function public.generate_coupon(integer) from public;
grant execute on function public.generate_coupon(integer) to authenticated;

create table if not exists public.admin_notifications (
  id             uuid primary key default gen_random_uuid(),
  event_type     text not null,
  title          text not null,
  message        text not null,
  actor_user_id  uuid references auth.users(id) on delete set null,
  metadata       jsonb not null default '{}'::jsonb,
  read_at        timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists admin_notifications_created_idx
  on public.admin_notifications(created_at desc);

create index if not exists admin_notifications_unread_idx
  on public.admin_notifications(created_at desc)
  where read_at is null;

alter table public.admin_notifications enable row level security;
revoke all on table public.admin_notifications from anon, authenticated;
grant select on table public.admin_notifications to authenticated;

drop policy if exists "spyda_admin_reads_notifications"
  on public.admin_notifications;
create policy "spyda_admin_reads_notifications"
  on public.admin_notifications
  for select
  to authenticated
  using (public.is_spyda_admin());

drop function if exists public.admin_list_notifications(integer);
create function public.admin_list_notifications(
  p_limit integer default 30
) returns table (
  id uuid,
  event_type text,
  title text,
  message text,
  actor_user_id uuid,
  metadata jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_spyda_admin() then
    raise exception 'Only Spyda Admin can view notifications.'
      using errcode = '42501';
  end if;

  return query
    select
      n.id,
      n.event_type,
      n.title,
      n.message,
      n.actor_user_id,
      n.metadata,
      n.read_at,
      n.created_at
    from public.admin_notifications n
    order by n.created_at desc
    limit greatest(1, least(coalesce(p_limit, 30), 100));
end;
$$;

revoke all on function public.admin_list_notifications(integer) from public;
grant execute on function public.admin_list_notifications(integer) to authenticated;

drop function if exists public.admin_mark_notifications_read(uuid[]);
create function public.admin_mark_notifications_read(
  p_ids uuid[] default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only Spyda Admin can update notifications.'
      using errcode = '42501';
  end if;

  update public.admin_notifications n
     set read_at = now()
   where n.read_at is null
     and (p_ids is null or n.id = any(p_ids));

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.admin_mark_notifications_read(uuid[]) from public;
grant execute on function public.admin_mark_notifications_read(uuid[]) to authenticated;

create or replace function public.notify_admin_user_joined()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if lower(coalesce(new.email, '')) <> 'admin@spydadesigns.xyz' then
    insert into public.admin_notifications (
      event_type, title, message, actor_user_id, metadata
    ) values (
      'user_joined',
      'New Spyda account',
      coalesce(new.email, 'A new user') || ' joined Spyda.',
      new.id,
      jsonb_build_object('email', coalesce(new.email, ''))
    );
  end if;
  return new;
end;
$$;

drop trigger if exists auth_user_joined_admin_notification on auth.users;
create trigger auth_user_joined_admin_notification
  after insert on auth.users
  for each row execute function public.notify_admin_user_joined();

create or replace function public.notify_admin_task_submitted()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then
    return new;
  end if;

  select coalesce(u.email, '') into v_email
    from auth.users u where u.id = new.user_id;

  insert into public.admin_notifications (
    event_type, title, message, actor_user_id, metadata
  ) values (
    'task_submitted',
    'Welcome tasks submitted',
    '@' || coalesce(new.x_handle, 'unknown') || ' submitted all three welcome tasks.',
    new.user_id,
    jsonb_build_object(
      'email', coalesce(v_email, ''),
      'x_handle', coalesce(new.x_handle, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists welcome_task_admin_notification
  on public.welcome_reward_claims;
create trigger welcome_task_admin_notification
  after insert or update of status on public.welcome_reward_claims
  for each row execute function public.notify_admin_task_submitted();

create or replace function public.notify_admin_coupon_redeemed()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  if new.status <> 'redeemed'
     or old.status is not distinct from new.status then
    return new;
  end if;

  select coalesce(u.email, '') into v_email
    from auth.users u where u.id = new.redeemed_by;

  insert into public.admin_notifications (
    event_type, title, message, actor_user_id, metadata
  ) values (
    'coupon_redeemed',
    'Coupon redeemed',
    coalesce(v_email, 'A user') || ' redeemed '
      || new.credit_amount::text || ' Spyda credits.',
    new.redeemed_by,
    jsonb_build_object(
      'coupon_code', new.code,
      'credit_amount', new.credit_amount,
      'email', coalesce(v_email, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists coupon_redeemed_admin_notification on public.coupons;
create trigger coupon_redeemed_admin_notification
  after update of status on public.coupons
  for each row execute function public.notify_admin_coupon_redeemed();

create or replace function public.notify_admin_credit_activity()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_direction text;
begin
  if new.source = 'opening_balance' then
    return new;
  end if;

  select coalesce(u.email, '') into v_email
    from auth.users u where u.id = new.user_id;
  v_direction := case when new.amount > 0 then 'received' else 'spent' end;

  insert into public.admin_notifications (
    event_type, title, message, actor_user_id, metadata
  ) values (
    'wallet_activity',
    'Wallet activity',
    coalesce(v_email, 'A Spyda user') || ' ' || v_direction || ' '
      || abs(new.amount)::text || ' credits: ' || new.description,
    new.user_id,
    jsonb_build_object(
      'amount', new.amount,
      'balance_after', new.balance_after,
      'source', new.source,
      'activity_type', new.activity_type,
      'email', coalesce(v_email, '')
    )
  );
  return new;
end;
$$;

drop trigger if exists credit_activity_admin_notification
  on public.credit_transactions;
create trigger credit_activity_admin_notification
  after insert on public.credit_transactions
  for each row execute function public.notify_admin_credit_activity();

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'admin_notifications'
  ) then
    alter publication supabase_realtime
      add table public.admin_notifications;
  end if;
end;
$$;

notify pgrst, 'reload schema';
