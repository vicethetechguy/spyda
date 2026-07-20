-- Standardize newly issued coupon codes as SPYDA-XXXX-XXXX.
-- Existing SPY-XXXX-XXXX codes remain valid and redeemable.

drop function if exists public.generate_coupon(integer);
create function public.generate_coupon(
  p_credit_amount integer
) returns public.coupons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
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

  loop
    v_code := 'SPYDA-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))
      || '-'
      || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    exit when not exists (
      select 1 from public.coupons c where upper(c.code) = v_code
    );
  end loop;

  insert into public.coupons (code, credit_amount, status, created_by)
  values (v_code, p_credit_amount, 'active', auth.uid())
  returning * into v_coupon;

  return v_coupon;
end;
$$;

revoke all on function public.generate_coupon(integer) from public;
grant execute on function public.generate_coupon(integer) to authenticated;
