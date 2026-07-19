-- ============================================================================
-- Admin wallet-to-wallet transfers
--
-- Only admin@spydadesigns.xyz can execute this function. Credits are debited
-- from the admin wallet, credited to the recipient, and recorded in both
-- wallets' activity ledgers.
-- ============================================================================

drop function if exists public.admin_send_credits_by_spyda_id(text, integer, text);

create function public.admin_send_credits_by_spyda_id(
  p_spyda_id text,
  p_amount integer,
  p_note text default null
) returns table (
  target_user_id uuid,
  spyda_id text,
  new_balance integer,
  sender_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid := auth.uid();
  v_normalized text := upper(btrim(coalesce(p_spyda_id, '')));
  v_targets uuid[];
  v_target uuid;
  v_sender_balance integer;
  v_recipient_balance integer;
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
  if v_target = v_sender then
    raise exception 'The admin wallet cannot send credits to itself.';
  end if;

  -- Lock both wallets before changing either balance. There is one sending
  -- admin, so every transfer follows the same lock order.
  select coalesce(p.wallet_balance, 0)
    into v_sender_balance
    from public.profiles p
   where p.id = v_sender
   for update;

  if v_sender_balance is null then
    raise exception 'The Spyda admin wallet could not be found.';
  end if;
  if v_sender_balance < p_amount then
    raise exception 'The admin wallet does not have enough Spyda Credits.';
  end if;

  select coalesce(p.wallet_balance, 0)
    into v_recipient_balance
    from public.profiles p
   where p.id = v_target
   for update;

  if v_recipient_balance is null then
    raise exception 'The recipient wallet could not be found.';
  end if;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'admin_transfer', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Sent to ' || v_normalized
      || case when v_note is null then '' else ': ' || left(v_note, 120) end,
    true
  );

  update public.profiles p
     set wallet_balance = p.wallet_balance - p_amount
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
     set wallet_balance = p.wallet_balance + p_amount
   where p.id = v_target
   returning p.wallet_balance into v_recipient_balance;

  target_user_id := v_target;
  spyda_id := v_normalized;
  new_balance := v_recipient_balance;
  sender_balance := v_sender_balance;
  return next;
end;
$$;

revoke all on function public.admin_send_credits_by_spyda_id(text, integer, text) from public;
grant execute on function public.admin_send_credits_by_spyda_id(text, integer, text) to authenticated;
