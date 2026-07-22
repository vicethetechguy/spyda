-- Generation price is determined inside the database so the selected model
-- controls the charge instead of a browser-supplied credit amount.
create or replace function public.charge_generation_credits(
  p_model_mode text,
  p_byok boolean default false
) returns table (
  wallet_balance integer,
  credits_spent_total integer,
  spyda_token_balance integer,
  tokens_awarded integer,
  credits_charged integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  v_amount := case
    when coalesce(p_byok, false) then 5
    when p_model_mode = 'groq' then 20
    when p_model_mode = 'openai' then 30
    else null
  end;

  if v_amount is null then
    raise exception 'Unknown generation model.' using errcode = '22023';
  end if;

  return query
  select
    spent.wallet_balance,
    spent.credits_spent_total,
    spent.spyda_token_balance,
    spent.tokens_awarded,
    v_amount
  from public.spend_credits(v_amount) as spent;
end;
$$;

-- Direct arbitrary credit spending is no longer a client-facing operation.
-- The controlled function above retains the existing atomic wallet update.
revoke execute on function public.spend_credits(integer) from public;
revoke execute on function public.charge_generation_credits(text, boolean) from public;
grant execute on function public.charge_generation_credits(text, boolean) to authenticated;

notify pgrst, 'reload schema';
