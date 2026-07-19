-- ============================================================================
-- Spyda admin credit controls
--
-- 1. Makes coupon values genuinely customizable while retaining quick presets.
-- 2. Adds an admin-only credit transfer by a user's public Spyda ID.
-- 3. Keeps all credit changes server-side and visible in wallet activity.
-- ============================================================================

create or replace function public.is_spyda_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = auth.uid()
       and lower(coalesce(u.email, '')) = 'admin@spydadesigns.xyz'
  );
$$;

revoke all on function public.is_spyda_admin() from public;
grant execute on function public.is_spyda_admin() to authenticated;

create table if not exists public.coupons (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,
  credit_amount  integer not null,
  status         text not null default 'active',
  created_by     uuid references auth.users(id) on delete set null,
  redeemed_by    uuid references auth.users(id) on delete set null,
  redeemed_at    timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.coupons add column if not exists code text;
alter table public.coupons add column if not exists credit_amount integer;
alter table public.coupons add column if not exists status text default 'active';
alter table public.coupons add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.coupons add column if not exists redeemed_by uuid references auth.users(id) on delete set null;
alter table public.coupons add column if not exists redeemed_at timestamptz;
alter table public.coupons add column if not exists created_at timestamptz default now();

-- Older deployments limited coupons to the three preset values with a check
-- constraint. Remove only checks that reference credit_amount, then replace
-- them with the full supported range.
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

create unique index if not exists coupons_code_unique_idx
  on public.coupons (upper(code));

alter table public.coupons enable row level security;
revoke all on table public.coupons from anon, authenticated;

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
    v_code := 'SPY-'
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

drop function if exists public.admin_list_coupons();
create function public.admin_list_coupons()
returns table (
  id uuid,
  code text,
  credit_amount integer,
  status text,
  redeemed_by uuid,
  redeemed_email text,
  redeemed_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can view coupon codes.'
      using errcode = '42501';
  end if;

  return query
    select
      c.id,
      c.code,
      c.credit_amount,
      c.status::text,
      c.redeemed_by,
      u.email::text,
      c.redeemed_at,
      c.created_at
    from public.coupons c
    left join auth.users u on u.id = c.redeemed_by
    order by c.created_at desc;
end;
$$;

revoke all on function public.admin_list_coupons() from public;
grant execute on function public.admin_list_coupons() to authenticated;

drop function if exists public.redeem_coupon(text);
create function public.redeem_coupon(
  p_code text
) returns table (
  credit_amount integer,
  new_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_coupon public.coupons;
begin
  if v_uid is null then
    raise exception 'You must be signed in to redeem a coupon.'
      using errcode = '28000';
  end if;

  select c.*
    into v_coupon
    from public.coupons c
   where upper(c.code) = upper(btrim(coalesce(p_code, '')))
     and c.status = 'active'
   for update;

  if v_coupon.id is null then
    raise exception 'That coupon code is invalid or has already been redeemed.';
  end if;

  insert into public.profiles (id, wallet_balance)
  values (v_uid, 0)
  on conflict (id) do nothing;

  perform set_config('spyda.credit_activity_type', 'funded', true);
  perform set_config('spyda.credit_activity_source', 'coupon', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Redeemed coupon ' || v_coupon.code,
    true
  );

  update public.profiles p
     set wallet_balance = coalesce(p.wallet_balance, 0) + v_coupon.credit_amount
   where p.id = v_uid
   returning p.wallet_balance into new_balance;

  update public.coupons c
     set status = 'redeemed',
         redeemed_by = v_uid,
         redeemed_at = now()
   where c.id = v_coupon.id;

  credit_amount := v_coupon.credit_amount;
  return next;
end;
$$;

revoke all on function public.redeem_coupon(text) from public;
grant execute on function public.redeem_coupon(text) to authenticated;

drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id uuid,
  email text,
  spyda_id text,
  wallet_balance integer,
  is_admin boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can view users.'
      using errcode = '42501';
  end if;

  return query
    select
      u.id,
      coalesce(u.email, '')::text,
      (
        'SPY-'
        || upper(substr(u.id::text, 1, 4))
        || '-'
        || upper(right(u.id::text, 4))
      )::text,
      coalesce(p.wallet_balance, 0),
      lower(coalesce(u.email, '')) = 'admin@spydadesigns.xyz',
      u.created_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated;

drop function if exists public.admin_adjust_credits(uuid, integer);
create function public.admin_adjust_credits(
  p_user_id uuid,
  p_delta integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can adjust credits.'
      using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 or abs(p_delta) > 10000000 then
    raise exception 'Adjustment must be a non-zero amount up to 10,000,000 credits.';
  end if;

  insert into public.profiles (id, wallet_balance)
  values (p_user_id, 0)
  on conflict (id) do nothing;

  select coalesce(p.wallet_balance, 0)
    into v_balance
    from public.profiles p
   where p.id = p_user_id
   for update;

  if v_balance + p_delta < 0 then
    raise exception 'This adjustment would make the wallet balance negative.';
  end if;

  perform set_config('spyda.credit_activity_type', 'adjustment', true);
  perform set_config('spyda.credit_activity_source', 'admin_adjustment', true);
  perform set_config('spyda.credit_activity_description', 'Admin wallet adjustment', true);

  update public.profiles p
     set wallet_balance = p.wallet_balance + p_delta
   where p.id = p_user_id
   returning p.wallet_balance into v_balance;

  return v_balance;
end;
$$;

revoke all on function public.admin_adjust_credits(uuid, integer) from public;
grant execute on function public.admin_adjust_credits(uuid, integer) to authenticated;

create or replace function public.admin_send_credits_by_spyda_id(
  p_spyda_id text,
  p_amount integer,
  p_note text default null
) returns table (
  target_user_id uuid,
  spyda_id text,
  new_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text := upper(btrim(coalesce(p_spyda_id, '')));
  v_targets uuid[];
  v_target uuid;
  v_balance integer;
  v_description text;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can send credits.'
      using errcode = '42501';
  end if;
  if v_normalized !~ '^SPY-[A-F0-9]{4}-[A-F0-9]{4}$' then
    raise exception 'Enter a valid Spyda ID in the format SPY-XXXX-XXXX.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 then
    raise exception 'Transfer amount must be between 1 and 10,000,000 Spyda credits.';
  end if;

  select array_agg(p.id)
    into v_targets
    from public.profiles p
   where (
     'SPY-'
     || upper(substr(p.id::text, 1, 4))
     || '-'
     || upper(right(p.id::text, 4))
   ) = v_normalized;

  if coalesce(cardinality(v_targets), 0) = 0 then
    raise exception 'No Spyda wallet was found for that Spyda ID.';
  end if;
  if cardinality(v_targets) > 1 then
    raise exception 'That Spyda ID is ambiguous. Contact support before sending credits.';
  end if;

  v_target := v_targets[1];
  select p.wallet_balance
    into v_balance
    from public.profiles p
   where p.id = v_target
   for update;

  v_description := case
    when nullif(btrim(coalesce(p_note, '')), '') is null
      then 'Credits received from Spyda Admin'
    else 'Spyda Admin: ' || left(btrim(p_note), 120)
  end;

  perform set_config('spyda.credit_activity_type', 'funded', true);
  perform set_config('spyda.credit_activity_source', 'admin_transfer', true);
  perform set_config('spyda.credit_activity_description', v_description, true);

  update public.profiles p
     set wallet_balance = coalesce(p.wallet_balance, 0) + p_amount
   where p.id = v_target
   returning p.wallet_balance into v_balance;

  target_user_id := v_target;
  spyda_id := v_normalized;
  new_balance := v_balance;
  return next;
end;
$$;

revoke all on function public.admin_send_credits_by_spyda_id(text, integer, text) from public;
grant execute on function public.admin_send_credits_by_spyda_id(text, integer, text) to authenticated;

drop function if exists public.admin_overview_stats();
create function public.admin_overview_stats()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can view platform statistics.'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'total_credits', (select coalesce(sum(p.wallet_balance), 0) from public.profiles p),
    'coupons_active', (select count(*) from public.coupons c where c.status = 'active'),
    'coupons_redeemed', (select count(*) from public.coupons c where c.status = 'redeemed'),
    'credits_from_coupons', (
      select coalesce(sum(c.credit_amount), 0)
        from public.coupons c
       where c.status = 'redeemed'
    )
  );
end;
$$;

revoke all on function public.admin_overview_stats() from public;
grant execute on function public.admin_overview_stats() to authenticated;
