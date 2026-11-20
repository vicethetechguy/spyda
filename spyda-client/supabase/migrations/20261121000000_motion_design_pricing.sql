-- Motion designs (Claude Opus 5.5) cost 50 credits each and count toward
-- SPYDA rewards like every other generation. Apply after
-- 20261120000000_server_side_generation_billing.sql.

create or replace function public.reserve_generation_credits(
  p_user_id    uuid,
  p_model_mode text,
  p_byok       boolean default false
) returns table (
  charge_id           uuid,
  wallet_balance      integer,
  credits_spent_total integer,
  spyda_token_balance integer,
  tokens_awarded      integer,
  credits_charged     integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount    integer;
  v_bal       integer;
  v_spent_old integer;
  v_award     integer;
  v_charge    uuid;
begin
  if p_user_id is null then
    raise exception 'You must be signed in.' using errcode = '28000';
  end if;

  -- Motion runs on Spyda's own Anthropic account, so a personal OpenAI key
  -- never discounts it: its price is checked before the BYOK rate.
  v_amount := case
    when p_model_mode = 'motion' then 50
    when coalesce(p_byok, false) then 5
    when p_model_mode = 'groq' then 20
    when p_model_mode = 'openai' then 30
    else null
  end;
  if v_amount is null then
    raise exception 'Unknown generation model.' using errcode = '22023';
  end if;

  select p.wallet_balance, p.credits_spent_total
    into v_bal, v_spent_old
    from public.profiles p
   where p.id = p_user_id
   for update;

  if v_bal is null then
    raise exception 'Wallet not found for this account.' using errcode = 'P0002';
  end if;
  if v_bal < v_amount then
    raise exception 'Not enough Spyda credits for this generation.' using errcode = 'P0001';
  end if;

  v_award := floor((v_spent_old + v_amount) / 1000.0)::int
             - floor(v_spent_old / 1000.0)::int;

  perform set_config('spyda.credit_activity_type', 'spent', true);
  perform set_config('spyda.credit_activity_source', 'generation', true);
  perform set_config(
    'spyda.credit_activity_description',
    case
      when p_model_mode = 'motion' then 'Claude motion design generation'
      when coalesce(p_byok, false) then 'BYOK AI design generation'
      else 'Managed AI design generation'
    end,
    true
  );

  update public.profiles p
     set wallet_balance      = p.wallet_balance - v_amount,
         credits_spent_total = p.credits_spent_total + v_amount,
         spyda_token_balance = p.spyda_token_balance + v_award
   where p.id = p_user_id
   returning p.wallet_balance, p.credits_spent_total, p.spyda_token_balance
     into wallet_balance, credits_spent_total, spyda_token_balance;

  insert into public.generation_charges (user_id, model_mode, byok, amount, tokens_awarded)
  values (p_user_id, coalesce(p_model_mode, ''), coalesce(p_byok, false), v_amount, v_award)
  returning id into v_charge;

  charge_id := v_charge;
  tokens_awarded := v_award;
  credits_charged := v_amount;
  return next;
end;
$$;

revoke execute on function public.reserve_generation_credits(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.reserve_generation_credits(uuid, text, boolean) to service_role;
