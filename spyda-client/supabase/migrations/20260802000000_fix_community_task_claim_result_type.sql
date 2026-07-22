-- auth.users.email is varchar while this RPC declares email as text. PostgreSQL
-- requires an exact result shape for RETURN QUERY, so cast the email explicitly.

create or replace function public.admin_list_community_task_claims(p_status text default 'pending')
returns table (
  claim_id uuid, task_id uuid, task_title text, reward_credits integer,
  user_id uuid, email text, spyda_id text, proof text, status text,
  admin_note text, credits_awarded integer, submitted_at timestamptz, reviewed_at timestamptz
)
language plpgsql security definer set search_path = public, auth
as $$
begin
  if not public.is_spyda_admin() then
    raise exception 'Only Spyda Admin can review task claims.' using errcode = '42501';
  end if;
  if p_status is not null and p_status not in ('draft', 'pending', 'approved', 'rejected') then
    raise exception 'Unknown task claim status.';
  end if;

  return query
    select
      c.id,
      t.id,
      t.title::text,
      t.reward_credits,
      c.user_id,
      coalesce(u.email, '')::text,
      ('SPY-' || upper(substr(c.user_id::text, 1, 4)) || '-' || upper(right(c.user_id::text, 4)))::text,
      c.proof::text,
      c.status::text,
      c.admin_note::text,
      c.credits_awarded,
      c.submitted_at,
      c.reviewed_at
    from public.community_task_claims c
    join public.community_tasks t on t.id = c.task_id
    join auth.users u on u.id = c.user_id
    where p_status is null or c.status = p_status
    order by c.submitted_at desc nulls last, c.updated_at desc;
end;
$$;

notify pgrst, 'reload schema';
