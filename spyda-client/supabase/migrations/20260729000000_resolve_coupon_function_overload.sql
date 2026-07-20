-- ============================================================================
-- Resolve generate_coupon overload ambiguity
--
-- Some deployments contain both generate_coupon(integer) and
-- generate_coupon(integer, text default null). PostgREST cannot choose between
-- those functions when only p_credit_amount is supplied. Remove every overload
-- and expose one canonical function.
-- ============================================================================

do $$
declare
  v_function record;
begin
  for v_function in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generate_coupon'
  loop
    execute format(
      'drop function %I.%I(%s)',
      v_function.schema_name,
      v_function.function_name,
      v_function.identity_arguments
    );
  end loop;
end;
$$;

create function public.generate_coupon(
  p_credit_amount integer,
  p_code text default null
) returns public.coupons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_coupon public.coupons;
begin
  if not public.is_spyda_admin() then
    raise exception 'Only the Spyda administrator can create coupon codes.'
      using errcode = '42501';
  end if;
  if p_credit_amount is null
     or p_credit_amount < 1
     or p_credit_amount > 10000000 then
    raise exception 'Coupon amount must be between 1 and 10,000,000 Spyda credits.';
  end if;

  if v_code = '' then
    loop
      v_code := 'SPYDA-'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
        || '-'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
      exit when not exists (
        select 1 from public.coupons c where upper(c.code) = v_code
      );
    end loop;
  else
    if v_code !~ '^SPYDA-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
      raise exception 'Custom coupon codes must use SPYDA-XXXX-XXXX format.';
    end if;
    if exists (
      select 1 from public.coupons c where upper(c.code) = v_code
    ) then
      raise exception 'That coupon code already exists.';
    end if;
  end if;

  insert into public.coupons (code, credit_amount, status, created_by)
  values (v_code, p_credit_amount, 'active', auth.uid())
  returning * into v_coupon;

  return v_coupon;
end;
$$;

revoke all on function public.generate_coupon(integer, text) from public;
grant execute on function public.generate_coupon(integer, text) to authenticated;

notify pgrst, 'reload schema';
