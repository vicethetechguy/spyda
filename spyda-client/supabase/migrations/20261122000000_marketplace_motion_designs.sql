-- ============================================================================
-- Spyda marketplace: flyers and motion designs
-- 1. Every listing is a 'flyer' or a 'motion' design.
-- 2. A listing can carry a deliverable file (the motion video or HTML) in a
--    PRIVATE bucket: only the lister, buyers who unlocked it, and anyone for a
--    free listing can read it. The preview image stays public.
-- 3. Admins list without the 5-credit listing fee.
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.marketplace_templates
  add column if not exists kind text not null default 'flyer',
  add column if not exists file_path text,
  add column if not exists file_type text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'marketplace_templates_kind_check'
  ) then
    alter table public.marketplace_templates
      add constraint marketplace_templates_kind_check check (kind in ('flyer', 'motion'));
  end if;
end $$;

create index if not exists marketplace_templates_kind_idx on public.marketplace_templates(kind);

-- Motion designs get their own starter categories.
insert into public.template_categories (name) values
  ('Product Reveal'), ('Logo Animation'), ('Social Story'), ('Promo Video')
on conflict (name) do nothing;

-- ── Listing: kind + deliverable file, fee waived for admins ─────────────────
drop function if exists public.list_marketplace_template(text, text, integer, text, text, text);

create or replace function public.list_marketplace_template(
  p_name        text,
  p_category    text,
  p_price       integer,
  p_image_url   text,
  p_image_path  text default null,
  p_description text default null,
  p_kind        text default 'flyer',
  p_file_path   text default null,
  p_file_type   text default null
) returns public.marketplace_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_fee      integer := 5;
  v_balance  integer;
  v_name     text := nullif(btrim(p_name), '');
  v_category text := nullif(btrim(p_category), '');
  v_kind     text := coalesce(nullif(btrim(p_kind), ''), 'flyer');
  v_file     text := nullif(btrim(coalesce(p_file_path, '')), '');
  v_row      public.marketplace_templates;
begin
  if v_uid is null then
    raise exception 'You must be signed in to list a design.' using errcode = '28000';
  end if;
  if v_kind not in ('flyer', 'motion') then
    raise exception 'A listing is either a flyer or a motion design.';
  end if;
  if v_name is null then
    raise exception 'Give your design a name.';
  end if;
  if v_category is null then
    raise exception 'Choose or enter a category.';
  end if;
  if p_price is null or p_price < 0 or p_price > 1000000 then
    raise exception 'Price must be between 0 and 1,000,000 Spyda credits.';
  end if;
  if nullif(btrim(coalesce(p_image_url, '')), '') is null then
    raise exception 'A preview image is required.';
  end if;
  if v_kind = 'motion' and v_file is null then
    raise exception 'Upload the motion design file (video or HTML).';
  end if;
  -- The file must sit in the lister's own folder of the private bucket.
  if v_file is not null and split_part(v_file, '/', 1) <> v_uid::text then
    raise exception 'That file does not belong to your account.';
  end if;

  if public.is_spyda_admin() then
    v_fee := 0;
  end if;

  if v_fee > 0 then
    select wallet_balance into v_balance from public.profiles where id = v_uid for update;
    if v_balance is null then
      raise exception 'Wallet not found for this account.';
    end if;
    if v_balance < v_fee then
      raise exception 'You need % Spyda credits to list a design.', v_fee using errcode = 'P0001';
    end if;
    update public.profiles set wallet_balance = wallet_balance - v_fee where id = v_uid;
  end if;

  insert into public.template_categories (name, created_by)
  values (v_category, v_uid)
  on conflict (name) do nothing;

  insert into public.marketplace_templates
    (owner_id, name, category, description, price, image_url, image_path, kind, file_path, file_type)
  values
    (v_uid, v_name, v_category, nullif(btrim(coalesce(p_description, '')), ''), p_price,
     p_image_url, p_image_path, v_kind, v_file, nullif(btrim(coalesce(p_file_type, '')), ''))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.list_marketplace_template(text, text, integer, text, text, text, text, text, text) to authenticated;

-- ── Private bucket for deliverable files ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('template-files', 'template-files', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;

drop policy if exists "template_files_owner_insert" on storage.objects;
create policy "template_files_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'template-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "template_files_owner_delete" on storage.objects;
create policy "template_files_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'template-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- Read: the lister, a buyer who unlocked the listing, or anyone signed in for a free one.
drop policy if exists "template_files_unlocked_read" on storage.objects;
create policy "template_files_unlocked_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'template-files' and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.marketplace_templates t
         where t.file_path = storage.objects.name
           and (
             t.price <= 0
             or exists (
               select 1 from public.template_purchases p
                where p.template_id = t.id and p.buyer_id = auth.uid()
             )
           )
      )
    )
  );
