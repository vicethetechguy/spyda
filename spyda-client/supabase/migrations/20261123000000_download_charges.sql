-- Every download in Spyda costs 100 Spyda credits; the optional compressor
-- adds 50. The browser builds the file, then calls charge_download once the
-- file is ready, and saves it only when the charge succeeds. The price is set
-- here, never by the caller. Downloads count toward SPYDA rewards (1 SPYDA per
-- 1,000 credits spent), like generations.

create table if not exists public.download_charges (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  kind           text not null check (kind in ('image', 'video', 'file')),
  compressed     boolean not null default false,
  amount         integer not null check (amount > 0),
  file_name      text,
  tokens_awarded integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists download_charges_user_created_idx
  on public.download_charges(user_id, created_at desc);

alter table public.download_charges enable row level security;

drop policy if exists "download_charges_read_own" on public.download_charges;
create policy "download_charges_read_own"
  on public.download_charges for select
  using (auth.uid() = user_id);

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

  v_award := floor((coalesce(v_spent_old, 0) + v_amount) / 1000.0)::int
             - floor(coalesce(v_spent_old, 0) / 1000.0)::int;

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
