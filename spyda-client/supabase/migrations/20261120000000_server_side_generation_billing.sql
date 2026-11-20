-- Generation billing moves to the server.
--
-- Until now the browser called charge_generation_credits after an image came
-- back, so a direct API call could generate without paying. The API now
-- reserves the charge with the service role before calling the image model and
-- refunds it if generation fails. Prices stay as they were (5 BYOK, 20 Groq +
-- GPT-Image, 30 GPT-Image only) and the 1-SPYDA-per-1,000-credits award still
-- happens when the credits are charged.

create table if not exists public.generation_charges (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  model_mode       text not null,
  byok             boolean not null default false,
  amount           integer not null check (amount > 0),
  tokens_awarded   integer not null default 0,
  status           text not null default 'charged' check (status in ('charged', 'refunded')),
  created_at       timestamptz not null default now(),
  refunded_at      timestamptz
);

create index if not exists generation_charges_user_created_idx
  on public.generation_charges(user_id, created_at desc);

alter table public.generation_charges enable row level security;

drop policy if exists "generation_charges_read_own" on public.generation_charges;
create policy "generation_charges_read_own"
  on public.generation_charges for select
  using (auth.uid() = user_id);

-- Charge one generation for p_user_id. Service role only: the API verifies the
-- caller's access token and passes their id.
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

  v_amount := case
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

  v_award := floor((v_spent_old + v_amount) / 1000.0)::int
             - floor(v_spent_old / 1000.0)::int;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'generation', true);
  perform set_config(
    'spyda.credit_activity_description',
    case when coalesce(p_byok, false) then 'BYOK AI design generation' else 'Managed AI design generation' end,
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

-- Undo a charge whose generation failed: credits back, spent total and any
-- SPYDA award reversed. Refunding twice is a no-op.
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

  update public.generation_charges
     set status = 'refunded', refunded_at = now()
   where id = v_charge.id;

  refunded := true;
  return next;
end;
$$;

revoke execute on function public.reserve_generation_credits(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.refund_generation_credits(uuid) from public, anon, authenticated;
grant execute on function public.reserve_generation_credits(uuid, text, boolean) to service_role;
grant execute on function public.refund_generation_credits(uuid) to service_role;

-- The browser no longer charges after generation; leaving this callable would
-- let an older client charge a second time.
revoke execute on function public.charge_generation_credits(text, boolean) from authenticated;

notify pgrst, 'reload schema';
