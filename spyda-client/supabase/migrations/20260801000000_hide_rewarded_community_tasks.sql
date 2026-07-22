-- Rewarded community tasks are complete work, not ongoing tasks. Keep their
-- audit record in the database, but remove them from the participant's task
-- list immediately after approval.

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
  where (t.is_active or c.id is not null)
    and coalesce(c.status, 'draft') <> 'approved'
  order by t.is_active desc, t.created_at desc;
$$;

notify pgrst, 'reload schema';
