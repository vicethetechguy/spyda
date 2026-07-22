-- ============================================================================
-- Admin-managed community tasks
--
-- These are separate from the one-time welcome reward. Each task has a
-- per-user claim and is paid from the authenticated Spyda Admin wallet only
-- after the admin approves the participant's submitted proof.
-- ============================================================================

create table if not exists public.community_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 3 and 600),
  action_url text,
  action_label text not null default 'Open task' check (char_length(btrim(action_label)) between 2 and 40),
  verification_hint text not null default 'Paste the link or handle that proves you completed this task.' check (char_length(btrim(verification_hint)) between 3 and 500),
  reward_credits integer not null check (reward_credits between 1 and 1000000),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_task_claims (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.community_tasks(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  proof text,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected')),
  admin_note text,
  credits_awarded integer not null default 0 check (credits_awarded >= 0),
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(task_id, user_id)
);

create index if not exists community_tasks_active_created_idx on public.community_tasks(is_active, created_at desc);
create index if not exists community_task_claims_review_idx on public.community_task_claims(status, submitted_at desc);
create index if not exists community_task_claims_user_idx on public.community_task_claims(user_id, updated_at desc);

alter table public.community_tasks enable row level security;
alter table public.community_task_claims enable row level security;
revoke all on public.community_tasks, public.community_task_claims from anon, authenticated;

create or replace function public.list_community_tasks()
returns table (
  id uuid,
  title text,
  description text,
  action_url text,
  action_label text,
  verification_hint text,
  reward_credits integer,
  is_active boolean,
  created_at timestamptz,
  claim_id uuid,
  claim_status text,
  proof text,
  admin_note text,
  credits_awarded integer,
  submitted_at timestamptz,
  reviewed_at timestamptz
)
language sql security definer set search_path = public
as $$
  select
    t.id, t.title, t.description, t.action_url, t.action_label, t.verification_hint,
    t.reward_credits, t.is_active, t.created_at,
    c.id, c.status, c.proof, c.admin_note, c.credits_awarded, c.submitted_at, c.reviewed_at
  from public.community_tasks t
  left join public.community_task_claims c
    on c.task_id = t.id and c.user_id = auth.uid()
  where t.is_active or c.id is not null
  order by t.is_active desc, t.created_at desc;
$$;

create or replace function public.get_community_task_badge_count()
returns integer language sql security definer set search_path = public
as $$
  select count(*)::integer
  from public.community_tasks t
  left join public.community_task_claims c
    on c.task_id = t.id and c.user_id = auth.uid()
  where t.is_active
    and coalesce(c.status, 'draft') not in ('pending', 'approved');
$$;

create or replace function public.submit_community_task_claim(p_task_id uuid, p_proof text)
returns public.community_task_claims
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_task public.community_tasks;
  v_claim public.community_task_claims;
  v_proof text := nullif(btrim(coalesce(p_proof, '')), '');
begin
  if v_uid is null then raise exception 'You must be signed in.' using errcode = '28000'; end if;
  if public.is_spyda_admin() then raise exception 'The admin account cannot claim community task rewards.' using errcode = '42501'; end if;
  if v_proof is null or char_length(v_proof) < 2 then raise exception 'Add a link, handle, or short proof before submitting.'; end if;

  select * into v_task from public.community_tasks where id = p_task_id and is_active = true;
  if v_task.id is null then raise exception 'This task is no longer active.'; end if;

  insert into public.community_task_claims(task_id, user_id, proof, status, submitted_at)
  values (p_task_id, v_uid, v_proof, 'pending', now())
  on conflict (task_id, user_id) do update
    set proof = excluded.proof,
        status = case when public.community_task_claims.status = 'approved' then 'approved' else 'pending' end,
        admin_note = case when public.community_task_claims.status = 'approved' then public.community_task_claims.admin_note else null end,
        submitted_at = case when public.community_task_claims.status = 'approved' then public.community_task_claims.submitted_at else now() end,
        reviewed_by = case when public.community_task_claims.status = 'approved' then public.community_task_claims.reviewed_by else null end,
        reviewed_at = case when public.community_task_claims.status = 'approved' then public.community_task_claims.reviewed_at else null end,
        updated_at = now()
  returning * into v_claim;

  if v_claim.status = 'approved' then raise exception 'This task reward has already been paid.'; end if;
  return v_claim;
end;
$$;

create or replace function public.admin_create_community_task(
  p_title text,
  p_description text,
  p_action_url text,
  p_action_label text,
  p_verification_hint text,
  p_reward_credits integer
) returns public.community_tasks
language plpgsql security definer set search_path = public
as $$
declare v_task public.community_tasks;
begin
  if not public.is_spyda_admin() then raise exception 'Only Spyda Admin can create tasks.' using errcode = '42501'; end if;
  insert into public.community_tasks(title, description, action_url, action_label, verification_hint, reward_credits, created_by)
  values (
    btrim(p_title), btrim(p_description), nullif(btrim(coalesce(p_action_url, '')), ''),
    coalesce(nullif(btrim(coalesce(p_action_label, '')), ''), 'Open task'),
    coalesce(nullif(btrim(coalesce(p_verification_hint, '')), ''), 'Paste the link or handle that proves you completed this task.'),
    p_reward_credits, auth.uid()
  ) returning * into v_task;
  return v_task;
end;
$$;

create or replace function public.admin_set_community_task_active(p_task_id uuid, p_is_active boolean)
returns public.community_tasks
language plpgsql security definer set search_path = public
as $$
declare v_task public.community_tasks;
begin
  if not public.is_spyda_admin() then raise exception 'Only Spyda Admin can manage tasks.' using errcode = '42501'; end if;
  update public.community_tasks set is_active = p_is_active, updated_at = now() where id = p_task_id returning * into v_task;
  if v_task.id is null then raise exception 'Task not found.'; end if;
  return v_task;
end;
$$;

create or replace function public.admin_list_community_tasks()
returns table (
  id uuid, title text, description text, action_url text, action_label text,
  verification_hint text, reward_credits integer, is_active boolean, created_at timestamptz,
  participant_count integer, pending_count integer, approved_count integer
)
language sql security definer set search_path = public
as $$
  select t.id, t.title, t.description, t.action_url, t.action_label, t.verification_hint,
    t.reward_credits, t.is_active, t.created_at,
    count(c.id)::integer,
    count(c.id) filter (where c.status = 'pending')::integer,
    count(c.id) filter (where c.status = 'approved')::integer
  from public.community_tasks t
  left join public.community_task_claims c on c.task_id = t.id
  where public.is_spyda_admin()
  group by t.id
  order by t.is_active desc, t.created_at desc;
$$;

create or replace function public.admin_list_community_task_claims(p_status text default 'pending')
returns table (
  claim_id uuid, task_id uuid, task_title text, reward_credits integer,
  user_id uuid, email text, spyda_id text, proof text, status text,
  admin_note text, credits_awarded integer, submitted_at timestamptz, reviewed_at timestamptz
)
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_spyda_admin() then raise exception 'Only Spyda Admin can review task claims.' using errcode = '42501'; end if;
  if p_status is not null and p_status not in ('draft', 'pending', 'approved', 'rejected') then raise exception 'Unknown task claim status.'; end if;
  return query
    select c.id, t.id, t.title, t.reward_credits, c.user_id, coalesce(u.email, ''),
      ('SPY-' || upper(substr(c.user_id::text, 1, 4)) || '-' || upper(right(c.user_id::text, 4)))::text,
      c.proof, c.status, c.admin_note, c.credits_awarded, c.submitted_at, c.reviewed_at
    from public.community_task_claims c
    join public.community_tasks t on t.id = c.task_id
    join auth.users u on u.id = c.user_id
    where p_status is null or c.status = p_status
    order by c.submitted_at desc nulls last, c.updated_at desc;
end;
$$;

create or replace function public.admin_review_community_task_claim(p_claim_id uuid, p_approved boolean, p_note text default null)
returns table (status text, user_balance integer, admin_balance integer, recipient_email text, spyda_id text, credits_awarded integer)
language plpgsql security definer set search_path = public, auth
as $$
declare
  v_admin uuid := auth.uid(); v_claim public.community_task_claims; v_task public.community_tasks;
  v_admin_balance integer; v_user_balance integer; v_email text; v_spyda_id text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_spyda_admin() then raise exception 'Only Spyda Admin can award task participants.' using errcode = '42501'; end if;
  select * into v_claim from public.community_task_claims where id = p_claim_id for update;
  if v_claim.id is null then raise exception 'Task claim not found.'; end if;
  if v_claim.status <> 'pending' then raise exception 'Only pending task claims can be reviewed.'; end if;
  select * into v_task from public.community_tasks where id = v_claim.task_id;
  select coalesce(email, '') into v_email from auth.users where id = v_claim.user_id;
  v_spyda_id := 'SPY-' || upper(substr(v_claim.user_id::text, 1, 4)) || '-' || upper(right(v_claim.user_id::text, 4));

  insert into public.profiles(id, wallet_balance) values (v_admin, 0), (v_claim.user_id, 0) on conflict (id) do nothing;
  if not p_approved then
    update public.community_task_claims set status = 'rejected', admin_note = coalesce(v_note, 'Your proof could not be verified. Please update it and submit again.'), reviewed_by = v_admin, reviewed_at = now(), updated_at = now() where id = p_claim_id;
    select wallet_balance into v_user_balance from public.profiles where id = v_claim.user_id;
    select wallet_balance into v_admin_balance from public.profiles where id = v_admin;
    status := 'rejected'; user_balance := coalesce(v_user_balance, 0); admin_balance := coalesce(v_admin_balance, 0); recipient_email := v_email; spyda_id := v_spyda_id; credits_awarded := 0; return next; return;
  end if;

  select coalesce(wallet_balance, 0) into v_admin_balance from public.profiles where id = v_admin for update;
  if v_admin_balance < v_task.reward_credits then raise exception 'The admin wallet needs at least % credits to award this task.', v_task.reward_credits; end if;
  select coalesce(wallet_balance, 0) into v_user_balance from public.profiles where id = v_claim.user_id for update;
  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'community_task_reward', true);
  perform set_config('spyda.credit_activity_description', 'Task reward paid to ' || v_spyda_id || ': ' || v_task.title, true);
  update public.profiles set wallet_balance = wallet_balance - v_task.reward_credits where id = v_admin returning wallet_balance into v_admin_balance;
  perform set_config('spyda.credit_activity_type', 'earned', true);
  perform set_config('spyda.credit_activity_source', 'community_task_reward', true);
  perform set_config('spyda.credit_activity_description', 'Completed task: ' || v_task.title, true);
  update public.profiles set wallet_balance = wallet_balance + v_task.reward_credits where id = v_claim.user_id returning wallet_balance into v_user_balance;
  update public.community_task_claims set status = 'approved', admin_note = v_note, credits_awarded = v_task.reward_credits, reviewed_by = v_admin, reviewed_at = now(), updated_at = now() where id = p_claim_id;
  status := 'approved'; user_balance := v_user_balance; admin_balance := v_admin_balance; recipient_email := v_email; spyda_id := v_spyda_id; credits_awarded := v_task.reward_credits; return next;
end;
$$;

create or replace function public.notify_admin_community_task_submitted()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_title text;
begin
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    select title into v_title from public.community_tasks where id = new.task_id;
    insert into public.admin_notifications(event_type, title, detail, actor_user_id, metadata)
    values ('community_task_submitted', 'Task proof submitted', coalesce(v_title, 'Community task') || ' is ready for review.', new.user_id, jsonb_build_object('claim_id', new.id, 'task_id', new.task_id));
  end if;
  return new;
end;
$$;

drop trigger if exists community_task_admin_notification on public.community_task_claims;
create trigger community_task_admin_notification after insert or update of status on public.community_task_claims
for each row execute function public.notify_admin_community_task_submitted();

revoke all on function public.list_community_tasks(), public.get_community_task_badge_count(), public.submit_community_task_claim(uuid, text) from public;
grant execute on function public.list_community_tasks(), public.get_community_task_badge_count(), public.submit_community_task_claim(uuid, text) to authenticated;
revoke all on function public.admin_create_community_task(text, text, text, text, text, integer), public.admin_set_community_task_active(uuid, boolean), public.admin_list_community_tasks(), public.admin_list_community_task_claims(text), public.admin_review_community_task_claim(uuid, boolean, text) from public;
grant execute on function public.admin_create_community_task(text, text, text, text, text, integer), public.admin_set_community_task_active(uuid, boolean), public.admin_list_community_tasks(), public.admin_list_community_task_claims(text), public.admin_review_community_task_claim(uuid, boolean, text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_tasks') then alter publication supabase_realtime add table public.community_tasks; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'community_task_claims') then alter publication supabase_realtime add table public.community_task_claims; end if;
end;
$$;

notify pgrst, 'reload schema';
