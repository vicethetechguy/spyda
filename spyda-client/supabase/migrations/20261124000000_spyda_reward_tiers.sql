-- SPYDA rewards by signup order, until 1 billion SPYDA has been earned.
--
-- Each 1,000 Spyda credits spent on eligible actions earns, by the person's
-- signup position:
--   users 1 - 1,000             10,000 SPYDA
--   users 1,001 - 10,000         1,000 SPYDA
--   users 10,001 - 100,000         100 SPYDA
--   users 100,001 - 1,000,000       10 SPYDA
--   users 1,000,001 onward           1 SPYDA
-- Rewards accrue in proportion to the credits spent (a 100-credit download
-- earns a tenth of the rate). Accrual stops when users have earned
-- 1,000,000,000 SPYDA in total: the launch trigger. Past spending is
-- re-rated at each person's tier. Apply after 20261123000000_download_charges.sql.

-- 1. Signup position: existing accounts by creation date, new accounts next in line.
alter table public.profiles add column if not exists signup_rank bigint;

create sequence if not exists public.spyda_signup_rank_seq;

with ranked as (
  select p.id, row_number() over (order by coalesce(u.created_at, now()), p.id) as rank
    from public.profiles p
    left join auth.users u on u.id = p.id
)
update public.profiles p
   set signup_rank = r.rank
  from ranked r
 where r.id = p.id
   and p.signup_rank is null;

select setval(
  'public.spyda_signup_rank_seq',
  greatest(1, coalesce((select max(signup_rank) from public.profiles), 1)),
  (select max(signup_rank) from public.profiles) is not null
);

create unique index if not exists profiles_signup_rank_key on public.profiles(signup_rank);

create or replace function public.assign_signup_rank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.signup_rank is null then
    new.signup_rank := nextval('public.spyda_signup_rank_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_signup_rank on public.profiles;
create trigger profiles_assign_signup_rank
  before insert on public.profiles
  for each row execute function public.assign_signup_rank();

-- 2. The rate for a signup position: SPYDA per 1,000 credits.
create or replace function public.spyda_reward_rate(p_rank bigint)
returns integer
language sql
immutable
as $$
  select case
    when p_rank is null then 1
    when p_rank <= 1000 then 10000
    when p_rank <= 10000 then 1000
    when p_rank <= 100000 then 100
    when p_rank <= 1000000 then 10
    else 1
  end
$$;

-- 3. The pool: SPYDA earned by all users, capped at the 1 billion launch trigger.
create table if not exists public.spyda_supply (
  id      integer primary key default 1 check (id = 1),
  accrued bigint not null default 0,
  cap     bigint not null default 1000000000
);
insert into public.spyda_supply (id) values (1) on conflict (id) do nothing;
alter table public.spyda_supply enable row level security;
drop policy if exists "spyda_supply_read" on public.spyda_supply;
create policy "spyda_supply_read" on public.spyda_supply for select using (true);

-- 4. The award for one charge. Internal: called by the charge functions.
create or replace function public.spyda_award(p_user uuid, p_spent_old integer, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rate    bigint;
  v_old     bigint := greatest(0, coalesce(p_spent_old, 0));
  v_award   bigint;
  v_accrued bigint;
  v_cap     bigint;
begin
  if coalesce(p_amount, 0) <= 0 then
    return 0;
  end if;
  select public.spyda_reward_rate(p.signup_rank) into v_rate from public.profiles p where p.id = p_user;
  v_rate := coalesce(v_rate, 1);
  v_award := ((v_old + p_amount) * v_rate) / 1000 - (v_old * v_rate) / 1000;
  if v_award <= 0 then
    return 0;
  end if;

  select s.accrued, s.cap into v_accrued, v_cap from public.spyda_supply s where s.id = 1 for update;
  v_award := least(v_award, greatest(0, coalesce(v_cap, 1000000000) - coalesce(v_accrued, 0)));
  if v_award > 0 then
    update public.spyda_supply s set accrued = s.accrued + v_award where s.id = 1;
  end if;
  return v_award::integer;
end;
$$;

revoke execute on function public.spyda_award(uuid, integer, integer) from public, anon, authenticated;

-- 5. Every charge earns through the tiered award.
create or replace function public.spend_credits(
  p_amount integer
) returns table (
  wallet_balance      integer,
  credits_spent_total integer,
  spyda_token_balance integer,
  tokens_awarded      integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_bal       integer;
  v_spent_old integer;
  v_award     integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Spend amount must be a positive number of credits.';
  end if;

  select p.wallet_balance, p.credits_spent_total
    into v_bal, v_spent_old
    from public.profiles p
   where p.id = v_uid
   for update;

  if v_bal is null then
    raise exception 'Wallet not found for this account.';
  end if;
  if v_bal < p_amount then
    raise exception 'Not enough Spyda credits for this generation.' using errcode = 'P0001';
  end if;

  v_award := public.spyda_award(v_uid, v_spent_old, p_amount);

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'generation', true);
  perform set_config(
    'spyda.credit_activity_description',
    case when p_amount = 5 then 'BYOK AI design generation' else 'Managed AI design generation' end,
    true
  );

  update public.profiles p
     set wallet_balance      = p.wallet_balance - p_amount,
         credits_spent_total = p.credits_spent_total + p_amount,
         spyda_token_balance = p.spyda_token_balance + v_award
   where p.id = v_uid
   returning p.wallet_balance, p.credits_spent_total, p.spyda_token_balance
     into wallet_balance, credits_spent_total, spyda_token_balance;

  tokens_awarded := v_award;
  return next;
end;
$$;

grant execute on function public.spend_credits(integer) to authenticated;

create or replace function public.reserve_generation_credits(
  p_user_id    uuid,
  p_model_mode text,
  p_byok       boolean default false
) returns table (
  charge_id           uuid,
  wallet_balance      integer,
  credits_spent_total integer,
  spyda_token_balance integer,
  tokens_awarded      integer,
  credits_charged     integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount    integer;
  v_bal       integer;
  v_spent_old integer;
  v_award     integer;
  v_charge    uuid;
begin
  if p_user_id is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  -- Motion runs on Spyda's own Anthropic account, so a personal OpenAI key
  -- never discounts it: its price is checked before the BYOK rate.
  v_amount := case
    when p_model_mode = 'motion' then 50
    when coalesce(p_byok, false) then 5
    when p_model_mode = 'groq' then 20
    when p_model_mode = 'openai' then 30
    else null
  end;
  if v_amount is null then
    raise exception 'Unknown generation model.' using errcode = '22023';
  end if;

  select p.wallet_balance, p.credits_spent_total
    into v_bal, v_spent_old
    from public.profiles p
   where p.id = p_user_id
   for update;

  if v_bal is null then
    raise exception 'Wallet not found for this account.' using errcode = 'P0002';
  end if;
  if v_bal < v_amount then
    raise exception 'Not enough Spyda credits for this generation.' using errcode = 'P0001';
  end if;

  v_award := public.spyda_award(p_user_id, v_spent_old, v_amount);

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'generation', true);
  perform set_config(
    'spyda.credit_activity_description',
    case
      when p_model_mode = 'motion' then 'Claude motion design generation'
      when coalesce(p_byok, false) then 'BYOK AI design generation'
      else 'Managed AI design generation'
    end,
    true
  );

  update public.profiles p
     set wallet_balance      = p.wallet_balance - v_amount,
         credits_spent_total = p.credits_spent_total + v_amount,
         spyda_token_balance = p.spyda_token_balance + v_award
   where p.id = p_user_id
   returning p.wallet_balance, p.credits_spent_total, p.spyda_token_balance
     into wallet_balance, credits_spent_total, spyda_token_balance;

  insert into public.generation_charges (user_id, model_mode, byok, amount, tokens_awarded)
  values (p_user_id, coalesce(p_model_mode, ''), coalesce(p_byok, false), v_amount, v_award)
  returning id into v_charge;

  charge_id := v_charge;
  tokens_awarded := v_award;
  credits_charged := v_amount;
  return next;
end;
$$;

revoke execute on function public.reserve_generation_credits(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.reserve_generation_credits(uuid, text, boolean) to service_role;

create or replace function public.refund_generation_credits(
  p_charge_id uuid
) returns table (
  refunded       boolean,
  wallet_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_charge public.generation_charges;
begin
  select * into v_charge
    from public.generation_charges c
   where c.id = p_charge_id
   for update;

  if v_charge.id is null or v_charge.status <> 'charged' then
    refunded := false;
    select p.wallet_balance into wallet_balance from public.profiles p where p.id = v_charge.user_id;
    return next;
    return;
  end if;

  perform set_config('spyda.credit_activity_type', 'adjustment', true);
  perform set_config('spyda.credit_activity_source', 'generation_refund', true);
  perform set_config('spyda.credit_activity_description', 'Refund for a failed AI design generation', true);

  update public.profiles p
     set wallet_balance      = p.wallet_balance + v_charge.amount,
         credits_spent_total = greatest(0, p.credits_spent_total - v_charge.amount),
         spyda_token_balance = greatest(0, p.spyda_token_balance - v_charge.tokens_awarded)
   where p.id = v_charge.user_id
   returning p.wallet_balance into wallet_balance;

  -- The SPYDA this charge earned goes back to the pool.
  update public.spyda_supply s set accrued = greatest(0, s.accrued - v_charge.tokens_awarded) where s.id = 1;

  update public.generation_charges
     set status = 'refunded', refunded_at = now()
   where id = v_charge.id;

  refunded := true;
  return next;
end;
$$;

revoke execute on function public.refund_generation_credits(uuid) from public, anon, authenticated;
grant execute on function public.refund_generation_credits(uuid) to service_role;

create or replace function public.charge_download(
  p_kind       text,
  p_compressed boolean default false,
  p_file_name  text default null
) returns table (
  charge_id       uuid,
  wallet_balance  integer,
  credits_charged integer,
  tokens_awarded  integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_amount    integer := 100 + case when coalesce(p_compressed, false) then 50 else 0 end;
  v_bal       integer;
  v_spent_old integer;
  v_award     integer;
  v_charge    uuid;
  v_name      text := left(nullif(trim(coalesce(p_file_name, '')), ''), 160);
begin
  if v_user is null then
    raise exception 'Sign in to download.' using errcode = '28000';
  end if;
  if p_kind is null or p_kind not in ('image', 'video', 'file') then
    raise exception 'Unknown download type.' using errcode = '22023';
  end if;

  select p.wallet_balance, p.credits_spent_total
    into v_bal, v_spent_old
    from public.profiles p
   where p.id = v_user
   for update;

  if v_bal is null then
    raise exception 'Wallet not found for this account.' using errcode = 'P0002';
  end if;
  if v_bal < v_amount then
    raise exception 'Not enough Spyda credits: this download costs % credits.', v_amount using errcode = 'P0001';
  end if;

  v_award := public.spyda_award(v_user, v_spent_old, v_amount);

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'download', true);
  perform set_config(
    'spyda.credit_activity_description',
    case when coalesce(p_compressed, false) then 'Compressed download' else 'Download' end
      || coalesce(' · ' || v_name, ''),
    true
  );

  update public.profiles p
     set wallet_balance      = p.wallet_balance - v_amount,
         credits_spent_total = coalesce(p.credits_spent_total, 0) + v_amount,
         spyda_token_balance = coalesce(p.spyda_token_balance, 0) + v_award
   where p.id = v_user
   returning p.wallet_balance into wallet_balance;

  insert into public.download_charges (user_id, kind, compressed, amount, file_name, tokens_awarded)
  values (v_user, p_kind, coalesce(p_compressed, false), v_amount, v_name, v_award)
  returning id into v_charge;

  charge_id := v_charge;
  credits_charged := v_amount;
  tokens_awarded := v_award;
  return next;
end;
$$;

revoke execute on function public.charge_download(text, boolean, text) from public, anon;
grant execute on function public.charge_download(text, boolean, text) to authenticated;

-- 6. Re-rate what people have already earned (1 SPYDA per 1,000 credits until now) at their tier.
--    Runs once, even if this migration is applied again.
create table if not exists public.spyda_migration_flags (name text primary key, applied_at timestamptz not null default now());
alter table public.spyda_migration_flags enable row level security;

do $rerate$
begin
  if not exists (select 1 from public.spyda_migration_flags where name = 'reward_tiers_rerate') then
    update public.profiles p
       set spyda_token_balance = greatest(0,
             coalesce(p.spyda_token_balance, 0)
             - floor(coalesce(p.credits_spent_total, 0) / 1000.0)::int
             + least(1000000000::bigint, (coalesce(p.credits_spent_total, 0)::bigint * public.spyda_reward_rate(p.signup_rank)) / 1000)::int)
     where coalesce(p.credits_spent_total, 0) > 0;
    insert into public.spyda_migration_flags (name) values ('reward_tiers_rerate');
  end if;
end
$rerate$;

update public.spyda_supply s
   set accrued = (select coalesce(sum(spyda_token_balance), 0) from public.profiles)
 where s.id = 1;

-- 7. Each person can read their own rank and rate.
create or replace function public.my_spyda_rate()
returns table (signup_rank bigint, spyda_per_1000_credits integer, community_accrued bigint, community_cap bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.signup_rank, public.spyda_reward_rate(p.signup_rank), s.accrued, s.cap
    from public.profiles p
    cross join public.spyda_supply s
   where p.id = auth.uid() and s.id = 1
$$;

revoke execute on function public.my_spyda_rate() from public, anon;
grant execute on function public.my_spyda_rate() to authenticated;
