-- ============================================================================
-- Reliable admin wallet transfers
--
-- Resolves recipients from auth.users (the source used to display Spyda IDs),
-- creates missing profile wallets, records a durable transfer receipt, and
-- returns both post-transfer balances to the client.
-- ============================================================================

create table if not exists public.admin_credit_transfers (
  id                 uuid primary key default gen_random_uuid(),
  sender_id          uuid not null references auth.users(id) on delete restrict,
  recipient_id       uuid not null references auth.users(id) on delete restrict,
  spyda_id            text not null,
  amount              integer not null check (amount > 0),
  sender_balance      integer not null,
  recipient_balance   integer not null,
  note                text,
  created_at          timestamptz not null default now()
);

create index if not exists admin_credit_transfers_recipient_created_idx
  on public.admin_credit_transfers(recipient_id, created_at desc);

alter table public.admin_credit_transfers enable row level security;
revoke all on table public.admin_credit_transfers from anon, authenticated;

drop function if exists public.admin_lookup_spyda_wallet(text);
create function public.admin_lookup_spyda_wallet(
  p_spyda_id text
) returns table (
  user_id uuid,
  email text,
  spyda_id text,
  current_balance integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_normalized text := upper(btrim(coalesce(p_spyda_id, '')));
  v_targets uuid[];
  v_target uuid;
  v_email text;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only admin@spydadesigns.xyz can inspect Spyda wallets.'
      using errcode = '42501';
  end if;
  if v_normalized !~ '^SPY-[A-F0-9]{4}-[A-F0-9]{4}$' then
    raise exception 'Enter a valid Spyda ID in the format SPY-XXXX-XXXX.';
  end if;

  select array_agg(u.id), min(coalesce(u.email, '')::text)
    into v_targets, v_email
    from auth.users u
    where (
      'SPY-'
      || upper(substr(u.id::text, 1, 4))
      || '-'
      || upper(right(u.id::text, 4))
    ) = v_normalized;

  if coalesce(cardinality(v_targets), 0) = 0 then
    raise exception 'No Spyda account was found for that Spyda ID.';
  end if;
  if cardinality(v_targets) > 1 then
    raise exception 'That Spyda ID is ambiguous. Contact support before sending credits.';
  end if;

  v_target := v_targets[1];
  return query
    select
      v_target,
      v_email,
      v_normalized,
      coalesce(p.wallet_balance, 0)::integer
    from (select 1) seed
    left join public.profiles p on p.id = v_target;
end;
$$;

revoke all on function public.admin_lookup_spyda_wallet(text) from public;
grant execute on function public.admin_lookup_spyda_wallet(text) to authenticated;

drop function if exists public.admin_send_credits_by_spyda_id(text, integer, text);
create function public.admin_send_credits_by_spyda_id(
  p_spyda_id text,
  p_amount integer,
  p_note text default null
) returns table (
  transfer_id uuid,
  target_user_id uuid,
  recipient_email text,
  spyda_id text,
  previous_balance integer,
  new_balance integer,
  sender_balance integer
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_sender uuid := auth.uid();
  v_normalized text := upper(btrim(coalesce(p_spyda_id, '')));
  v_targets uuid[];
  v_target uuid;
  v_recipient_email text;
  v_sender_balance integer;
  v_previous_balance integer;
  v_recipient_balance integer;
  v_transfer_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_spyda_admin() then
    raise exception 'Only admin@spydadesigns.xyz can send Spyda Credits.'
      using errcode = '42501';
  end if;
  if v_sender is null then
    raise exception 'The admin account must be signed in.'
      using errcode = '28000';
  end if;
  if v_normalized !~ '^SPY-[A-F0-9]{4}-[A-F0-9]{4}$' then
    raise exception 'Enter a valid Spyda ID in the format SPY-XXXX-XXXX.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000000 then
    raise exception 'Transfer amount must be between 1 and 10,000,000 Spyda Credits.';
  end if;

  select array_agg(u.id), min(coalesce(u.email, ''))
    into v_targets, v_recipient_email
    from auth.users u
    where (
      'SPY-'
      || upper(substr(u.id::text, 1, 4))
      || '-'
      || upper(right(u.id::text, 4))
    ) = v_normalized;

  if coalesce(cardinality(v_targets), 0) = 0 then
    raise exception 'No Spyda account was found for that Spyda ID.';
  end if;
  if cardinality(v_targets) > 1 then
    raise exception 'That Spyda ID is ambiguous. Contact support before sending credits.';
  end if;

  v_target := v_targets[1];
  if v_target = v_sender then
    raise exception 'The admin wallet cannot send credits to itself.';
  end if;

  insert into public.profiles (id, wallet_balance)
  values (v_sender, 0), (v_target, 0)
  on conflict (id) do nothing;

  select coalesce(p.wallet_balance, 0)
    into v_sender_balance
    from public.profiles p
   where p.id = v_sender
   for update;

  if v_sender_balance < p_amount then
    raise exception 'The admin wallet does not have enough Spyda Credits.';
  end if;

  select coalesce(p.wallet_balance, 0)
    into v_previous_balance
    from public.profiles p
   where p.id = v_target
   for update;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'admin_transfer', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Sent to ' || v_normalized
      || case when v_note is null then '' else ': ' || left(v_note, 120) end,
    true
  );

  update public.profiles p
     set wallet_balance = coalesce(p.wallet_balance, 0) - p_amount
   where p.id = v_sender
   returning p.wallet_balance into v_sender_balance;

  perform set_config('spyda.credit_activity_type', 'funded', true);
  perform set_config('spyda.credit_activity_source', 'admin_transfer', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Received from Spyda Admin'
      || case when v_note is null then '' else ': ' || left(v_note, 120) end,
    true
  );

  update public.profiles p
     set wallet_balance = coalesce(p.wallet_balance, 0) + p_amount
   where p.id = v_target
   returning p.wallet_balance into v_recipient_balance;

  insert into public.admin_credit_transfers (
    sender_id,
    recipient_id,
    spyda_id,
    amount,
    sender_balance,
    recipient_balance,
    note
  ) values (
    v_sender,
    v_target,
    v_normalized,
    p_amount,
    v_sender_balance,
    v_recipient_balance,
    v_note
  )
  returning id into v_transfer_id;

  transfer_id := v_transfer_id;
  target_user_id := v_target;
  recipient_email := v_recipient_email;
  spyda_id := v_normalized;
  previous_balance := v_previous_balance;
  new_balance := v_recipient_balance;
  sender_balance := v_sender_balance;
  return next;
end;
$$;

revoke all on function public.admin_send_credits_by_spyda_id(text, integer, text) from public;
grant execute on function public.admin_send_credits_by_spyda_id(text, integer, text) to authenticated;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end;
$$;
