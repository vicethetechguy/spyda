-- ============================================================================
-- Real-time user wallet state and notification read receipts
-- ============================================================================

alter table public.credit_transactions
  add column if not exists read_at timestamptz;

-- Existing history predates notifications and should not appear as unread.
update public.credit_transactions
   set read_at = created_at
 where read_at is null;

create index if not exists credit_transactions_user_unread_idx
  on public.credit_transactions(user_id, created_at desc)
  where read_at is null;

drop function if exists public.mark_wallet_notifications_read(uuid[]);
create function public.mark_wallet_notifications_read(
  p_ids uuid[] default null
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  update public.credit_transactions t
     set read_at = now()
   where t.user_id = v_uid
     and t.read_at is null
     and (p_ids is null or t.id = any(p_ids));

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.mark_wallet_notifications_read(uuid[]) from public;
grant execute on function public.mark_wallet_notifications_read(uuid[]) to authenticated;

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

  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'credit_transactions'
  ) then
    alter publication supabase_realtime add table public.credit_transactions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
