-- ============================================================================
-- Spyda Credits → Tokens
--
-- 1. Guarantees every auth user has a profiles row (fixes wallet balances that
--    "disappear" because reads/writes hit a missing row).
-- 2. Tracks lifetime credits spent and a Spyda token balance on the profile.
-- 3. spend_credits(): atomically spends Spyda credits on a generation and awards
--    exactly 1 Spyda token for every full 1,000 credits a user has spent.
--
-- Idempotent — safe to run more than once. Apply via `supabase db push` or paste
-- into the Supabase SQL editor.
-- ============================================================================

-- ── New profile columns ──────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists credits_spent_total integer not null default 0;

alter table public.profiles
  add column if not exists spyda_token_balance integer not null default 0;

-- ── Guarantee a profiles row for every user ──────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, wallet_balance)
  values (new.id, 0)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any existing users that never got a profile row.
insert into public.profiles (id, wallet_balance)
select u.id, 0
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

-- ── Own-row policies (harmless if RLS is disabled; corrective if it is on) ────
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- ── Spend credits on a generation, awarding tokens per 1,000 spent ───────────
-- Awards 1 Spyda token each time the user's lifetime spend crosses a multiple
-- of 1,000. Example: spending from 950 → 1,050 total awards 1 token; a single
-- 2,000-credit spend from 0 awards 2 tokens.
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

  -- Lock the wallet so concurrent generations cannot double-spend.
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

  -- Tokens earned = number of 1,000-credit thresholds crossed by this spend.
  v_award := floor((v_spent_old + p_amount) / 1000.0)::int
             - floor(v_spent_old / 1000.0)::int;

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
