-- ============================================================================
-- Spyda Template Marketplace
-- Users can list their own templates (5 Spyda credit listing fee) and set a
-- price in Spyda credits. When another user uses the template, credits move
-- from the buyer to the lister. Categories grow automatically: a custom
-- category supplied at listing time is added to the shared category list.
--
-- Apply with the Supabase CLI (`supabase db push`) or by pasting this file
-- into the Supabase SQL editor. Idempotent — safe to run more than once.
-- ============================================================================

-- ── Categories (auto-growing shared list) ───────────────────────────────────
create table if not exists public.template_categories (
  name        text primary key,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

insert into public.template_categories (name) values
  ('Technology'), ('Finance'), ('Marketing'), ('Business'),
  ('Food & Drink'), ('Fashion'), ('Events'),
  ('Education'), ('Health'), ('Real Estate')
on conflict (name) do nothing;

-- ── Listed templates ────────────────────────────────────────────────────────
create table if not exists public.marketplace_templates (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  category    text not null references public.template_categories(name),
  description text,
  price       integer not null default 0 check (price >= 0 and price <= 1000000),
  image_url   text not null,
  image_path  text,
  created_at  timestamptz not null default now()
);

create index if not exists marketplace_templates_category_idx on public.marketplace_templates(category);
create index if not exists marketplace_templates_owner_idx    on public.marketplace_templates(owner_id);
create index if not exists marketplace_templates_created_idx  on public.marketplace_templates(created_at desc);

-- ── Purchases (one paid unlock per buyer per template — keeps re-use free) ────
create table if not exists public.template_purchases (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  buyer_id    uuid not null references auth.users(id) on delete cascade,
  amount      integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (template_id, buyer_id)
);

create index if not exists template_purchases_buyer_idx on public.template_purchases(buyer_id);

-- ── Row level security ───────────────────────────────────────────────────────
alter table public.template_categories   enable row level security;
alter table public.marketplace_templates enable row level security;
alter table public.template_purchases    enable row level security;

-- Categories: readable by everyone. New categories are inserted through the
-- listing RPC (security definer), so no direct INSERT policy is needed.
drop policy if exists "template_categories_read" on public.template_categories;
create policy "template_categories_read"
  on public.template_categories for select using (true);

-- Templates: public marketplace read. Listings are created through the RPC;
-- owners can still edit or remove their own rows directly.
drop policy if exists "marketplace_templates_read" on public.marketplace_templates;
create policy "marketplace_templates_read"
  on public.marketplace_templates for select using (true);

drop policy if exists "marketplace_templates_owner_update" on public.marketplace_templates;
create policy "marketplace_templates_owner_update"
  on public.marketplace_templates for update
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "marketplace_templates_owner_delete" on public.marketplace_templates;
create policy "marketplace_templates_owner_delete"
  on public.marketplace_templates for delete
  using (auth.uid() = owner_id);

-- Purchases: a buyer can see their own unlocks; writes happen through the RPC.
drop policy if exists "template_purchases_read_own" on public.template_purchases;
create policy "template_purchases_read_own"
  on public.template_purchases for select
  using (auth.uid() = buyer_id);

-- ── List a template (charges the 5-credit listing fee atomically) ────────────
create or replace function public.list_marketplace_template(
  p_name        text,
  p_category    text,
  p_price       integer,
  p_image_url   text,
  p_image_path  text default null,
  p_description text default null
) returns public.marketplace_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_fee      constant integer := 5;
  v_balance  integer;
  v_name     text := nullif(btrim(p_name), '');
  v_category text := nullif(btrim(p_category), '');
  v_row      public.marketplace_templates;
begin
  if v_uid is null then
    raise exception 'You must be signed in to list a template.' using errcode = '28000';
  end if;
  if v_name is null then
    raise exception 'Template name is required.';
  end if;
  if v_category is null then
    raise exception 'Choose or enter a category.';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'Price must be zero or a positive number of credits.';
  end if;
  if nullif(btrim(coalesce(p_image_url, '')), '') is null then
    raise exception 'A template image is required.';
  end if;

  -- Lock the lister's wallet and confirm they can cover the listing fee.
  select wallet_balance into v_balance from public.profiles where id = v_uid for update;
  if v_balance is null then
    raise exception 'Wallet not found for this account.';
  end if;
  if v_balance < v_fee then
    raise exception 'You need % Spyda credits to list a template.', v_fee using errcode = 'P0001';
  end if;

  -- Auto-add a custom category to the shared list.
  insert into public.template_categories (name, created_by)
  values (v_category, v_uid)
  on conflict (name) do nothing;

  -- Charge the listing fee.
  update public.profiles set wallet_balance = wallet_balance - v_fee where id = v_uid;

  -- Create the listing.
  insert into public.marketplace_templates (owner_id, name, category, description, price, image_url, image_path)
  values (v_uid, v_name, v_category, nullif(btrim(coalesce(p_description, '')), ''), p_price, p_image_url, p_image_path)
  returning * into v_row;

  return v_row;
end;
$$;

-- ── Use / purchase a template (moves credits buyer → lister) ─────────────────
-- Returns the purchase row. Idempotent: an owner or an already-unlocked buyer
-- is never charged again. A NULL return means "your own template, use freely".
create or replace function public.purchase_marketplace_template(
  p_template_id uuid
) returns public.template_purchases
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_tpl      public.marketplace_templates;
  v_balance  integer;
  v_purchase public.template_purchases;
begin
  if v_uid is null then
    raise exception 'You must be signed in to use a template.' using errcode = '28000';
  end if;

  select * into v_tpl from public.marketplace_templates where id = p_template_id;
  if v_tpl.id is null then
    raise exception 'This template is no longer available.';
  end if;

  -- The lister uses their own template for free.
  if v_tpl.owner_id = v_uid then
    return null;
  end if;

  -- Already unlocked — reuse without charging again.
  select * into v_purchase
    from public.template_purchases
   where template_id = p_template_id and buyer_id = v_uid;
  if v_purchase.id is not null then
    return v_purchase;
  end if;

  -- Free template — record the unlock, no credit movement.
  if v_tpl.price <= 0 then
    insert into public.template_purchases (template_id, buyer_id, amount)
    values (p_template_id, v_uid, 0)
    returning * into v_purchase;
    return v_purchase;
  end if;

  -- Lock the buyer's wallet and confirm the balance.
  select wallet_balance into v_balance from public.profiles where id = v_uid for update;
  if v_balance is null then
    raise exception 'Wallet not found for this account.';
  end if;
  if v_balance < v_tpl.price then
    raise exception 'You need % Spyda credits to use this template.', v_tpl.price using errcode = 'P0001';
  end if;

  -- Move credits from the buyer to the lister.
  update public.profiles set wallet_balance = wallet_balance - v_tpl.price where id = v_uid;
  update public.profiles set wallet_balance = coalesce(wallet_balance, 0) + v_tpl.price where id = v_tpl.owner_id;

  insert into public.template_purchases (template_id, buyer_id, amount)
  values (p_template_id, v_uid, v_tpl.price)
  returning * into v_purchase;

  return v_purchase;
end;
$$;

grant execute on function public.list_marketplace_template(text, text, integer, text, text, text) to authenticated;
grant execute on function public.purchase_marketplace_template(uuid) to authenticated;

-- ── Storage bucket for template preview images ───────────────────────────────
insert into storage.buckets (id, name, public)
values ('template-images', 'template-images', true)
on conflict (id) do nothing;

-- Anyone can view template images; owners upload/manage under their own uid/ folder.
drop policy if exists "template_images_public_read" on storage.objects;
create policy "template_images_public_read"
  on storage.objects for select
  using (bucket_id = 'template-images');

drop policy if exists "template_images_owner_insert" on storage.objects;
create policy "template_images_owner_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'template-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "template_images_owner_delete" on storage.objects;
create policy "template_images_owner_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'template-images' and (storage.foldername(name))[1] = auth.uid()::text);
