-- ============================================================================
-- Auditable welcome-reward payouts
--
-- X handles are verification evidence only. Payouts are always made to the
-- authenticated Spyda account that owns the claim, identified by user_id.
-- ============================================================================

create table if not exists public.welcome_reward_payouts (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references auth.users(id) on delete restrict,
  admin_id              uuid not null references auth.users(id) on delete restrict,
  x_handle              text not null,
  amount                integer not null check (amount = 60),
  user_balance_before   integer not null,
  user_balance_after    integer not null,
  admin_balance_after   integer not null,
  created_at            timestamptz not null default now()
);

create index if not exists welcome_reward_payouts_created_idx
  on public.welcome_reward_payouts(created_at desc);

alter table public.welcome_reward_payouts enable row level security;
revoke all on table public.welcome_reward_payouts from anon, authenticated;

-- Backfill receipts for earlier approvals only when the recipient's wallet
-- ledger proves that the +60 credit transaction already happened.
do $$
begin
  if to_regclass('public.credit_transactions') is not null then
    execute $backfill$
      insert into public.welcome_reward_payouts (
        user_id,
        admin_id,
        x_handle,
        amount,
        user_balance_before,
        user_balance_after,
        admin_balance_after,
        created_at
      )
      select
        c.user_id,
        c.reviewed_by,
        c.x_handle,
        60,
        ledger_entry.balance_after - 60,
        ledger_entry.balance_after,
        coalesce(admin_profile.wallet_balance, 0),
        coalesce(c.reviewed_at, ledger_entry.created_at)
      from public.welcome_reward_claims c
      join lateral (
        select t.balance_after, t.created_at
          from public.credit_transactions t
         where t.user_id = c.user_id
           and t.source = 'welcome_reward'
           and t.amount = 60
         order by t.created_at desc
         limit 1
      ) ledger_entry on true
      left join public.profiles admin_profile on admin_profile.id = c.reviewed_by
      where c.status = 'approved'
        and c.credits_awarded = 60
        and c.reviewed_by is not null
        and c.x_handle is not null
      on conflict (user_id) do nothing
    $backfill$;
  end if;
end;
$$;

drop function if exists public.admin_list_welcome_reward_claims(text);
create function public.admin_list_welcome_reward_claims(
  p_status text default null
) returns table (
  user_id uuid,
  email text,
  spyda_id text,
  follow_spyda boolean,
  repost_pinned boolean,
  follow_vice boolean,
  x_handle text,
  status text,
  admin_note text,
  credits_awarded integer,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  wallet_balance integer,
  payout_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_spyda_admin() then
    raise exception 'Only Spyda Admin can review welcome rewards.'
      using errcode = '42501';
  end if;
  if p_status is not null
     and p_status not in ('draft', 'pending', 'approved', 'rejected') then
    raise exception 'Unknown reward status.';
  end if;

  return query
    select
      c.user_id,
      coalesce(u.email, '')::text,
      (
        'SPY-'
        || upper(substr(c.user_id::text, 1, 4))
        || '-'
        || upper(right(c.user_id::text, 4))
      )::text,
      c.follow_spyda,
      c.repost_pinned,
      c.follow_vice,
      c.x_handle,
      c.status,
      c.admin_note,
      c.credits_awarded,
      c.submitted_at,
      c.reviewed_at,
      c.created_at,
      c.updated_at,
      coalesce(p.wallet_balance, 0)::integer,
      payout.id
    from public.welcome_reward_claims c
    join auth.users u on u.id = c.user_id
    left join public.profiles p on p.id = c.user_id
    left join public.welcome_reward_payouts payout on payout.user_id = c.user_id
    where p_status is null or c.status = p_status
    order by
      case when c.status = 'pending' then 0 else 1 end,
      c.submitted_at desc nulls last,
      c.updated_at desc;
end;
$$;

revoke all on function public.admin_list_welcome_reward_claims(text) from public;
grant execute on function public.admin_list_welcome_reward_claims(text) to authenticated;

drop function if exists public.admin_review_welcome_reward_claim(uuid, boolean, text);
create function public.admin_review_welcome_reward_claim(
  p_user_id uuid,
  p_approved boolean,
  p_note text default null
) returns table (
  status text,
  user_balance integer,
  admin_balance integer,
  recipient_email text,
  spyda_id text,
  x_handle text,
  payout_id uuid
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid();
  v_claim public.welcome_reward_claims;
  v_admin_balance integer;
  v_user_balance_before integer;
  v_user_balance_after integer;
  v_recipient_email text;
  v_spyda_id text;
  v_payout_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reward constant integer := 60;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only Spyda Admin can review welcome rewards.'
      using errcode = '42501';
  end if;
  if p_approved is null then
    raise exception 'Choose approve or reject.';
  end if;

  select c.* into v_claim
    from public.welcome_reward_claims c
   where c.user_id = p_user_id
   for update;

  if v_claim.user_id is null then
    raise exception 'This reward claim no longer exists.';
  end if;
  if v_claim.status <> 'pending' then
    raise exception 'Only pending claims can be reviewed.';
  end if;

  select
    coalesce(u.email, '')::text,
    (
      'SPY-'
      || upper(substr(u.id::text, 1, 4))
      || '-'
      || upper(right(u.id::text, 4))
    )::text
    into v_recipient_email, v_spyda_id
    from auth.users u
   where u.id = p_user_id;

  if v_recipient_email is null then
    raise exception 'The Spyda account attached to this claim no longer exists.';
  end if;

  insert into public.profiles (id, wallet_balance)
  values (v_admin, 0), (p_user_id, 0)
  on conflict (id) do nothing;

  if not p_approved then
    update public.welcome_reward_claims c
       set status = 'rejected',
           admin_note = coalesce(v_note, 'The submitted X tasks could not be verified.'),
           reviewed_by = v_admin,
           reviewed_at = now(),
           updated_at = now()
     where c.user_id = p_user_id;

    select coalesce(p.wallet_balance, 0) into v_user_balance_after
      from public.profiles p where p.id = p_user_id;
    select coalesce(p.wallet_balance, 0) into v_admin_balance
      from public.profiles p where p.id = v_admin;

    status := 'rejected';
    user_balance := v_user_balance_after;
    admin_balance := v_admin_balance;
    recipient_email := v_recipient_email;
    spyda_id := v_spyda_id;
    x_handle := v_claim.x_handle;
    payout_id := null;
    return next;
    return;
  end if;

  if v_claim.credits_awarded <> 0 then
    raise exception 'This reward has already been marked as paid.';
  end if;
  if exists (
    select 1 from public.welcome_reward_payouts payout
     where payout.user_id = p_user_id
  ) then
    raise exception 'This Spyda account already has a welcome-reward payout receipt.';
  end if;

  select coalesce(p.wallet_balance, 0) into v_admin_balance
    from public.profiles p where p.id = v_admin for update;
  if v_admin_balance < v_reward then
    raise exception 'The Spyda admin wallet needs at least 60 credits to approve this claim.';
  end if;

  select coalesce(p.wallet_balance, 0) into v_user_balance_before
    from public.profiles p where p.id = p_user_id for update;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'welcome_reward', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Welcome reward paid to ' || v_spyda_id,
    true
  );
  update public.profiles p
     set wallet_balance = coalesce(p.wallet_balance, 0) - v_reward
   where p.id = v_admin
   returning p.wallet_balance into v_admin_balance;

  perform set_config('spyda.credit_activity_type', 'earned', true);
  perform set_config('spyda.credit_activity_source', 'welcome_reward', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Welcome reward for verified @' || v_claim.x_handle,
    true
  );
  update public.profiles p
     set wallet_balance = coalesce(p.wallet_balance, 0) + v_reward
   where p.id = p_user_id
   returning p.wallet_balance into v_user_balance_after;

  insert into public.welcome_reward_payouts (
    user_id,
    admin_id,
    x_handle,
    amount,
    user_balance_before,
    user_balance_after,
    admin_balance_after
  ) values (
    p_user_id,
    v_admin,
    v_claim.x_handle,
    v_reward,
    v_user_balance_before,
    v_user_balance_after,
    v_admin_balance
  )
  returning id into v_payout_id;

  update public.welcome_reward_claims c
     set status = 'approved',
         admin_note = v_note,
         credits_awarded = v_reward,
         reviewed_by = v_admin,
         reviewed_at = now(),
         updated_at = now()
   where c.user_id = p_user_id;

  status := 'approved';
  user_balance := v_user_balance_after;
  admin_balance := v_admin_balance;
  recipient_email := v_recipient_email;
  spyda_id := v_spyda_id;
  x_handle := v_claim.x_handle;
  payout_id := v_payout_id;
  return next;
end;
$$;

revoke all on function public.admin_review_welcome_reward_claim(uuid, boolean, text) from public;
grant execute on function public.admin_review_welcome_reward_claim(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
