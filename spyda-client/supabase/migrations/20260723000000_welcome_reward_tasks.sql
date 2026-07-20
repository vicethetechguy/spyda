-- ============================================================================
-- Spyda welcome reward tasks
--
-- Every existing or future account may complete the campaign once. Users save
-- task progress and submit an X handle; only Spyda Admin can approve a claim.
-- Approval atomically transfers 60 credits from the admin wallet to the user.
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

create table if not exists public.welcome_reward_claims (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  follow_spyda     boolean not null default false,
  repost_pinned    boolean not null default false,
  follow_vice      boolean not null default false,
  x_handle         text,
  status           text not null default 'draft'
                   check (status in ('draft', 'pending', 'approved', 'rejected')),
  admin_note       text,
  credits_awarded  integer not null default 0 check (credits_awarded in (0, 60)),
  submitted_at     timestamptz,
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists welcome_reward_claims_status_submitted_idx
  on public.welcome_reward_claims(status, submitted_at desc);

alter table public.welcome_reward_claims enable row level security;
revoke all on table public.welcome_reward_claims from anon, authenticated;

create or replace function public.get_welcome_reward_claim()
returns setof public.welcome_reward_claims
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  return query
    select c.* from public.welcome_reward_claims c where c.user_id = auth.uid();
end;
$$;

revoke all on function public.get_welcome_reward_claim() from public;
grant execute on function public.get_welcome_reward_claim() to authenticated;

create or replace function public.save_welcome_reward_task(
  p_task text,
  p_completed boolean
) returns public.welcome_reward_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.welcome_reward_claims;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if public.is_spyda_admin() then
    raise exception 'The Spyda admin account is not eligible for the welcome reward.';
  end if;
  if p_task not in ('follow_spyda', 'repost_pinned', 'follow_vice') then
    raise exception 'Unknown welcome task.';
  end if;

  insert into public.welcome_reward_claims (user_id)
  values (v_uid)
  on conflict (user_id) do nothing;

  select c.* into v_claim
    from public.welcome_reward_claims c
   where c.user_id = v_uid
   for update;

  if v_claim.status in ('pending', 'approved') then
    raise exception 'This reward claim can no longer be edited.';
  end if;

  update public.welcome_reward_claims c
     set follow_spyda = case when p_task = 'follow_spyda' then p_completed else c.follow_spyda end,
         repost_pinned = case when p_task = 'repost_pinned' then p_completed else c.repost_pinned end,
         follow_vice = case when p_task = 'follow_vice' then p_completed else c.follow_vice end,
         status = 'draft',
         x_handle = case when c.status = 'rejected' then null else c.x_handle end,
         admin_note = case when c.status = 'rejected' then null else c.admin_note end,
         submitted_at = case when c.status = 'rejected' then null else c.submitted_at end,
         reviewed_by = case when c.status = 'rejected' then null else c.reviewed_by end,
         reviewed_at = case when c.status = 'rejected' then null else c.reviewed_at end,
         updated_at = now()
   where c.user_id = v_uid
   returning c.* into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.save_welcome_reward_task(text, boolean) from public;
grant execute on function public.save_welcome_reward_task(text, boolean) to authenticated;

create or replace function public.submit_welcome_reward_claim(
  p_x_handle text
) returns public.welcome_reward_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_handle text := regexp_replace(btrim(coalesce(p_x_handle, '')), '^@+', '');
  v_claim public.welcome_reward_claims;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if public.is_spyda_admin() then
    raise exception 'The Spyda admin account is not eligible for the welcome reward.';
  end if;
  if v_handle !~ '^[A-Za-z0-9_]{1,30}$' then
    raise exception 'Enter a valid X handle without spaces.';
  end if;

  select c.* into v_claim
    from public.welcome_reward_claims c
   where c.user_id = v_uid
   for update;

  if v_claim.user_id is null then
    raise exception 'Complete the three welcome tasks first.';
  end if;
  if v_claim.status = 'approved' or v_claim.credits_awarded = 60 then
    raise exception 'This account has already received the welcome reward.';
  end if;
  if v_claim.status = 'pending' then
    raise exception 'This reward claim is already awaiting review.';
  end if;
  if not (v_claim.follow_spyda and v_claim.repost_pinned and v_claim.follow_vice) then
    raise exception 'Complete all three welcome tasks before submitting.';
  end if;

  update public.welcome_reward_claims c
     set x_handle = v_handle,
         status = 'pending',
         admin_note = null,
         submitted_at = now(),
         reviewed_by = null,
         reviewed_at = null,
         updated_at = now()
   where c.user_id = v_uid
   returning c.* into v_claim;

  return v_claim;
end;
$$;

revoke all on function public.submit_welcome_reward_claim(text) from public;
grant execute on function public.submit_welcome_reward_claim(text) to authenticated;

create or replace function public.admin_list_welcome_reward_claims(
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
  updated_at timestamptz
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
      c.updated_at
    from public.welcome_reward_claims c
    join auth.users u on u.id = c.user_id
    where p_status is null or c.status = p_status
    order by
      case when c.status = 'pending' then 0 else 1 end,
      c.submitted_at desc nulls last,
      c.updated_at desc;
end;
$$;

revoke all on function public.admin_list_welcome_reward_claims(text) from public;
grant execute on function public.admin_list_welcome_reward_claims(text) to authenticated;

create or replace function public.admin_review_welcome_reward_claim(
  p_user_id uuid,
  p_approved boolean,
  p_note text default null
) returns table (
  status text,
  user_balance integer,
  admin_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_claim public.welcome_reward_claims;
  v_admin_balance integer;
  v_user_balance integer;
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

  if not p_approved then
    update public.welcome_reward_claims c
       set status = 'rejected',
           admin_note = coalesce(v_note, 'The submitted X tasks could not be verified.'),
           reviewed_by = v_admin,
           reviewed_at = now(),
           updated_at = now()
     where c.user_id = p_user_id;

    status := 'rejected';
    select coalesce(p.wallet_balance, 0) into v_user_balance
      from public.profiles p where p.id = p_user_id;
    select coalesce(p.wallet_balance, 0) into v_admin_balance
      from public.profiles p where p.id = v_admin;
    user_balance := v_user_balance;
    admin_balance := v_admin_balance;
    return next;
    return;
  end if;

  if v_claim.credits_awarded <> 0 then
    raise exception 'This reward has already been paid.';
  end if;

  select coalesce(p.wallet_balance, 0) into v_admin_balance
    from public.profiles p where p.id = v_admin for update;
  if v_admin_balance is null then
    raise exception 'The Spyda admin wallet could not be found.';
  end if;
  if v_admin_balance < v_reward then
    raise exception 'The Spyda admin wallet needs at least 60 credits to approve this claim.';
  end if;

  select coalesce(p.wallet_balance, 0) into v_user_balance
    from public.profiles p where p.id = p_user_id for update;
  if v_user_balance is null then
    raise exception 'The user wallet could not be found.';
  end if;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'welcome_reward', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Welcome reward paid to @' || v_claim.x_handle,
    true
  );
  update public.profiles p
     set wallet_balance = p.wallet_balance - v_reward
   where p.id = v_admin
   returning p.wallet_balance into v_admin_balance;

  perform set_config('spyda.credit_activity_type', 'earned', true);
  perform set_config('spyda.credit_activity_source', 'welcome_reward', true);
  perform set_config(
    'spyda.credit_activity_description',
    'Completed Spyda welcome tasks',
    true
  );
  update public.profiles p
     set wallet_balance = p.wallet_balance + v_reward
   where p.id = p_user_id
   returning p.wallet_balance into v_user_balance;

  update public.welcome_reward_claims c
     set status = 'approved',
         admin_note = v_note,
         credits_awarded = v_reward,
         reviewed_by = v_admin,
         reviewed_at = now(),
         updated_at = now()
   where c.user_id = p_user_id;

  status := 'approved';
  user_balance := v_user_balance;
  admin_balance := v_admin_balance;
  return next;
end;
$$;

revoke all on function public.admin_review_welcome_reward_claim(uuid, boolean, text) from public;
grant execute on function public.admin_review_welcome_reward_claim(uuid, boolean, text) to authenticated;

-- Make newly created RPCs immediately discoverable through the Supabase API.
notify pgrst, 'reload schema';
