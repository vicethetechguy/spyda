-- ============================================================================
-- Spyda Credits activity ledger
--
-- Records every profile wallet_balance change and enriches known server-side
-- actions with a useful source and description. Existing balances receive one
-- opening-balance entry because older individual transactions cannot be
-- reconstructed safely.
-- ============================================================================

-- Keep this migration self-contained for projects that have not yet applied
-- the earlier marketplace/token migrations.
alter table public.profiles
  add column if not exists credits_spent_total integer not null default 0;

alter table public.profiles
  add column if not exists spyda_token_balance integer not null default 0;

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

create table if not exists public.template_purchases (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketplace_templates(id) on delete cascade,
  buyer_id    uuid not null references auth.users(id) on delete cascade,
  amount      integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (template_id, buyer_id)
);

create index if not exists marketplace_templates_category_idx on public.marketplace_templates(category);
create index if not exists marketplace_templates_owner_idx on public.marketplace_templates(owner_id);
create index if not exists marketplace_templates_created_idx on public.marketplace_templates(created_at desc);
create index if not exists template_purchases_buyer_idx on public.template_purchases(buyer_id);

alter table public.template_categories enable row level security;
alter table public.marketplace_templates enable row level security;
alter table public.template_purchases enable row level security;

drop policy if exists "template_categories_read" on public.template_categories;
create policy "template_categories_read"
  on public.template_categories for select using (true);

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

drop policy if exists "template_purchases_read_own" on public.template_purchases;
create policy "template_purchases_read_own"
  on public.template_purchases for select
  using (auth.uid() = buyer_id);

insert into storage.buckets (id, name, public)
values ('template-images', 'template-images', true)
on conflict (id) do nothing;

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

create table if not exists public.credit_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  activity_type    text not null check (activity_type in ('funded', 'spent', 'earned', 'adjustment')),
  source           text not null default 'wallet',
  description      text not null,
  amount           integer not null check (amount <> 0),
  balance_after    integer not null,
  created_at       timestamptz not null default now()
);

create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions(user_id, created_at desc);

alter table public.credit_transactions enable row level security;

drop policy if exists "credit_transactions_read_own" on public.credit_transactions;
create policy "credit_transactions_read_own"
  on public.credit_transactions for select
  using (auth.uid() = user_id);

create or replace function public.capture_credit_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta       integer;
  v_type        text;
  v_source      text;
  v_description text;
begin
  v_delta := coalesce(new.wallet_balance, 0) - coalesce(old.wallet_balance, 0);
  if v_delta = 0 then
    return new;
  end if;

  v_type := nullif(current_setting('spyda.credit_activity_type', true), '');
  v_source := nullif(current_setting('spyda.credit_activity_source', true), '');
  v_description := nullif(current_setting('spyda.credit_activity_description', true), '');

  if v_type is null then
    v_type := case when v_delta > 0 then 'funded' else 'spent' end;
  end if;
  if v_source is null then
    v_source := case
      when coalesce(new.credits_spent_total, 0) > coalesce(old.credits_spent_total, 0) then 'generation'
      else 'wallet'
    end;
  end if;
  if v_description is null then
    v_description := case
      when v_source = 'generation' then 'AI design generation'
      when v_delta > 0 then 'Spyda credits added to wallet'
      else 'Spyda credits spent'
    end;
  end if;

  insert into public.credit_transactions (
    user_id, activity_type, source, description, amount, balance_after
  ) values (
    new.id, v_type, v_source, v_description, v_delta, new.wallet_balance
  );

  return new;
end;
$$;

drop trigger if exists profiles_capture_credit_transaction on public.profiles;
create trigger profiles_capture_credit_transaction
  after update of wallet_balance on public.profiles
  for each row
  when (old.wallet_balance is distinct from new.wallet_balance)
  execute function public.capture_credit_transaction();

insert into public.credit_transactions (
  user_id, activity_type, source, description, amount, balance_after
)
select
  p.id,
  'funded',
  'opening_balance',
  'Opening wallet balance',
  p.wallet_balance,
  p.wallet_balance
from public.profiles p
where p.wallet_balance <> 0
  and not exists (
    select 1 from public.credit_transactions t where t.user_id = p.id
  );

-- Generation spending gets an explicit label while retaining atomic credit
-- spending and the 1-token-per-1,000-credits reward rule.
create or replace function public.spend_credits(
  p_amount integer
) returns table (
  wallet_balance      integer,
  credits_spent_total integer,
  spyda_token_balance integer,
  tokens_awarded      integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_bal       integer;
  v_spent_old integer;
  v_award     integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Spend amount must be a positive number of credits.';
  end if;

  select p.wallet_balance, p.credits_spent_total
    into v_bal, v_spent_old
    from public.profiles p
   where p.id = v_uid
   for update;

  if v_bal is null then
    raise exception 'Wallet not found for this account.';
  end if;
  if v_bal < p_amount then
    raise exception 'Not enough Spyda credits for this generation.' using errcode = 'P0001';
  end if;

  v_award := floor((v_spent_old + p_amount) / 1000.0)::int
             - floor(v_spent_old / 1000.0)::int;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'generation', true);
  perform set_config(
    'spyda.credit_activity_description',
    case when p_amount = 5 then 'BYOK AI design generation' else 'Managed AI design generation' end,
    true
  );

  update public.profiles p
     set wallet_balance      = p.wallet_balance - p_amount,
         credits_spent_total = p.credits_spent_total + p_amount,
         spyda_token_balance = p.spyda_token_balance + v_award
   where p.id = v_uid
   returning p.wallet_balance, p.credits_spent_total, p.spyda_token_balance
     into wallet_balance, credits_spent_total, spyda_token_balance;

  tokens_awarded := v_award;
  return next;
end;
$$;

grant execute on function public.spend_credits(integer) to authenticated;

-- Marketplace listing keeps the existing atomic fee behavior and records it.
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

  select wallet_balance into v_balance
    from public.profiles where id = v_uid for update;
  if v_balance is null then
    raise exception 'Wallet not found for this account.';
  end if;
  if v_balance < v_fee then
    raise exception 'You need % Spyda credits to list a template.', v_fee using errcode = 'P0001';
  end if;

  insert into public.template_categories (name, created_by)
  values (v_category, v_uid)
  on conflict (name) do nothing;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'template_listing', true);
  perform set_config('spyda.credit_activity_description', 'Template marketplace listing fee', true);

  update public.profiles
     set wallet_balance = wallet_balance - v_fee
   where id = v_uid;

  insert into public.marketplace_templates (
    owner_id, name, category, description, price, image_url, image_path
  ) values (
    v_uid, v_name, v_category,
    nullif(btrim(coalesce(p_description, '')), ''),
    p_price, p_image_url, p_image_path
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.list_marketplace_template(text, text, integer, text, text, text) to authenticated;

-- Template purchases record both the buyer's spend and the owner's earning.
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
  if v_tpl.owner_id = v_uid then
    return null;
  end if;

  select * into v_purchase
    from public.template_purchases
   where template_id = p_template_id and buyer_id = v_uid;
  if v_purchase.id is not null then
    return v_purchase;
  end if;

  if v_tpl.price <= 0 then
    insert into public.template_purchases (template_id, buyer_id, amount)
    values (p_template_id, v_uid, 0)
    returning * into v_purchase;
    return v_purchase;
  end if;

  select wallet_balance into v_balance
    from public.profiles where id = v_uid for update;
  if v_balance is null then
    raise exception 'Wallet not found for this account.';
  end if;
  if v_balance < v_tpl.price then
    raise exception 'You need % Spyda credits to use this template.', v_tpl.price using errcode = 'P0001';
  end if;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'template_purchase', true);
  perform set_config('spyda.credit_activity_description', 'Purchased template: ' || v_tpl.name, true);
  update public.profiles
     set wallet_balance = wallet_balance - v_tpl.price
   where id = v_uid;

  perform set_config('spyda.credit_activity_type', 'earned', true);
  perform set_config('spyda.credit_activity_source', 'template_sale', true);
  perform set_config('spyda.credit_activity_description', 'Template used: ' || v_tpl.name, true);
  update public.profiles
     set wallet_balance = coalesce(wallet_balance, 0) + v_tpl.price
   where id = v_tpl.owner_id;

  insert into public.template_purchases (template_id, buyer_id, amount)
  values (p_template_id, v_uid, v_tpl.price)
  returning * into v_purchase;

  return v_purchase;
end;
$$;

grant execute on function public.purchase_marketplace_template(uuid) to authenticated;
