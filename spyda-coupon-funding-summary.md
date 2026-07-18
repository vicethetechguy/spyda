# Spyda Coupon & Funding System — Hand-off Summary

A spec of how Spyda's coupon-code credit system works today, written so another
model can replicate it on a different site. That other site currently has **one**
payment amount and needs to be extended to **three**.

## The core idea

Spyda runs on an internal currency called **Spyda Credits**. Users get credits in
two ways: by funding their wallet (card payment) or by redeeming a **coupon code**.
Credits are then spent inside the product on generations.

A coupon code is a single-use voucher that carries a fixed number of credits. An
admin generates it; a user redeems it; the credits land in the user's wallet; the
code is then dead forever.

## The 3 tiers (this is the part to replicate)

There are exactly three denominations. Each maps a **payment amount** to a
**credit amount**:

| Tier    | Payment (USD) | Payment (NGN) | Spyda Credits |
|---------|---------------|---------------|---------------|
| Starter | $5            | ₦7,500        | 500           |
| Creator | $10           | ₦15,000       | 1,000         |
| Studio  | $25           | ₦37,500       | 2,800         |

- Base rate elsewhere in the app: **$1 = 100 credits**. The $25 / 2,800 tier is a
  deliberate bonus (2,800 instead of 2,500).
- NGN figures use a fixed rate of **₦1,500 = $1**.
- The credit denominations (500 / 1,000 / 2,800) are the only values the coupon
  generator accepts — anything else is rejected.

## How a coupon flows, end to end

1. **Generate (admin).** In the admin panel the admin picks one of the three
   amounts (500 / 1,000 / 2,800) and the system mints a unique code in the format
   `SPYDA-XXXX-XXXX` (unambiguous characters only — no 0/O/1/I). Status = `active`.
2. **Distribute.** The code is handed to a user (in Spyda this is manual; on a
   paid site, the code would be issued **after a successful payment**).
3. **Redeem (user).** On the funding page the user enters the code. The server
   validates it, adds the credits to the user's wallet, and flips the code to
   `redeemed` in the same locked transaction.
4. **Single use, enforced.** Because the check-and-burn happens under a row lock,
   a code can only ever be redeemed once. A second attempt — even simultaneously
   by two people — fails with "already used." Two people can never share a code.

## What credits are used for (context)

- **Generations** cost credits per round: **20 credits** on managed AI, or
  **5 credits** if the user brings their own API key.
- **Spyda Token reward:** for every **1,000 credits actually spent** (not merely
  funded), the account accrues **1 SPYDA** pre-launch token. Funding alone earns
  nothing; only consumption does.

## Data model (minimal)

- `profiles.wallet_balance` — the user's Spyda Credit balance.
- `coupons` table — `code` (unique), `credit_amount`, `status`
  (`active` / `redeemed`), `redeemed_by`, `redeemed_at`, `created_at`.
- Redemption is a single atomic server function: lock the coupon row → if
  `active`, add credits to the wallet and mark it `redeemed` → return the new
  balance. Reject if missing or already used.

## What the other site needs to change

The other site already has **one** payment amount. To match Spyda it needs **two
more**, giving three tiers. Concretely:

1. Replace the single price with the three-tier table above (payment → credits).
2. On **successful payment**, mint a single-use coupon code for the credit amount
   that matches the tier the user paid for, and show/deliver that code to them.
3. Keep the single-use guarantee: validate + burn the code atomically on redeem so
   no code can be used twice.
4. Keep the denominations fixed to the three allowed values so a payment can only
   ever produce a 500, 1,000, or 2,800-credit code.

The key difference to communicate: on Spyda an admin generates codes by hand,
whereas on the paid site the **payment itself is the trigger** that generates the
user's own code — but the tier structure, the single-use rule, and the
payment→credit mapping are identical.
