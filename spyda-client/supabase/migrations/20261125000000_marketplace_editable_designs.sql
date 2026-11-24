-- ============================================================================
-- Spyda marketplace: editable designs
-- A listing can be an editable Spyda design: a flyer with its layers, or a
-- video project with its clips, titles and music. Its file is a Spyda design
-- package in the private template-files bucket (same read rules as motion
-- files: the lister, buyers who unlocked it, or anyone for a free listing).
-- The buyer opens it in the editor as their own copy.
-- Idempotent: safe to run more than once.
-- ============================================================================

alter table public.marketplace_templates
  add column if not exists editable boolean not null default false;

create index if not exists marketplace_templates_editable_idx on public.marketplace_templates(editable);

-- Starter categories for editable designs.
insert into public.template_categories (name) values
  ('Editable Flyer'), ('Video Template')
on conflict (name) do nothing;

-- ── Listing: same as before, plus p_editable ────────────────────────────────
drop function if exists public.list_marketplace_template(text, text, integer, text, text, text, text, text, text);

create or replace function public.list_marketplace_template(
  p_name        text,
  p_category    text,
  p_price       integer,
  p_image_url   text,
  p_image_path  text default null,
  p_description text default null,
  p_kind        text default 'flyer',
  p_file_path   text default null,
  p_file_type   text default null,
  p_editable    boolean default false
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
  if coalesce(p_editable, false) and v_file is null then
    raise exception 'An editable design needs its Spyda design file.';
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
    (owner_id, name, category, description, price, image_url, image_path, kind, file_path, file_type, editable)
  values
    (v_uid, v_name, v_category, nullif(btrim(coalesce(p_description, '')), ''), p_price,
     p_image_url, p_image_path, v_kind, v_file, nullif(btrim(coalesce(p_file_type, '')), ''), coalesce(p_editable, false))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.list_marketplace_template(text, text, integer, text, text, text, text, text, text, boolean) to authenticated;
