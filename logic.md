# Park-D Logic Guide

Last updated: 2026-03-09

This file explains the current business logic so future developers can safely change pricing, timing, and status behavior.

## 1. Scope

This guide covers:

- payment logic
- slot availability logic
- booking/check-in/checkout logic
- cancellation/refund logic
- owner/admin approval logic
- timezone and automation behavior
- where to edit when changing formulas/timers

## 2. Core Status Model

### 2.1 Booking statuses (`bookings.b_status`)

Main statuses used in runtime:

- `WAITING_FOR_PAYMENT`
- `PAYMENT_CONFIRMED`
- `CHECKING_IN`
- `CHECKIN_APPROVED`
- `CHECKIN_REJECTED`
- `CHECKING_OUT`
- `CHECKOUT_APPROVED`
- `CHECKOUT_REJECTED`
- `CANCELLED`

Also treated as occupied in slot logic (legacy/compat):

- `PENDING`
- `APPROVED_BY_OWNER`

### 2.2 Payment statuses (`payments.pay_status`)

- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`

### 2.3 Checkout settlement reasons (`booking_checkout_settlements.settlement_reason`)

- `OWNER_APPROVED`
- `AUTO_APPROVED_7H`
- `AUTO_CHECKOUT_NO_CHECKIN`

## 3. Timezone and Date Logic

System is Bangkok time (`UTC+07:00`) by design.

- DB pool sets timezone: `src/lib/db/mysql.ts`
  - `timezone: '+07:00'`
  - `SET time_zone = '+07:00'` on new connection
- Client date-time utilities: `src/lib/time-bangkok.ts`
  - parse local `datetime-local` values as Bangkok wall-clock
  - compute duration/check-out with Bangkok-safe math

Important: most SQL comparisons use:

- `CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')`

to ensure comparisons are done in Bangkok time.

## 4. Slot Availability Logic

## 4.1 Home page / lot detail availability window

Files:

- `src/lib/parking-lots.ts` (`listHomeParkingLots`)
- `src/app/api/parking-lots/parkingdetail/[id]/route.ts`

A booking is counted as occupying a slot when:

- status is in occupied statuses
- and time condition is true:
  - missing check-in/check-out datetime, or
  - overlaps current-to-next-1-hour window with a 30-minute post-checkout block

Current overlap rule:

- `checkin_datetime < now+1h`
- `checkout_datetime + 30m > now`

So displayed `availableSlot` is "availability for now / near-next-hour", not an all-day capacity.

## 4.2 Booking creation conflict check (exact requested time)

File:

- `src/app/api/bookings/route.ts`

Before insert, conflict count uses same occupied statuses but compares against requested booking range:

- `existing.checkin < requested.checkout`
- `existing.checkout + 30m > requested.checkin`

If conflicts reach `total_slot`, booking is rejected (`409`).

## 4.3 Reservation list shown on parking detail

File:

- `src/app/api/parking-lots/parkingdetail/[id]/route.ts`

Returns upcoming/active reservations with:

- status in occupied statuses
- has both check-in and check-out datetime
- `checkout + 30m > now`
- sorted by `checkin_datetime`
- limit 20

## 5. Booking and Payment Flow

## 5.1 Create booking

File:

- `src/app/api/bookings/route.ts`

Rules:

- user must be authenticated
- lot must be approved + active
- user cannot rent own lot
- check-out must be later than check-in
- slot conflict check must pass

Insert:

- booking status starts as `WAITING_FOR_PAYMENT`

Estimated amounts returned to client:

- `rentAmount = hours * lot.price`
- `estimatedTotal = rentAmount * 1.5`

## 5.2 Submit payment proof

File:

- `src/app/api/payments/route.ts`

Rules:

- only renter of that booking
- booking must be `WAITING_FOR_PAYMENT`
- only image proof, max 5 MB
- if current time is already at/after reservation start (`checkin_datetime`):
  - booking is auto-cancelled immediately
  - pending/failed payment rows are marked failed

Server-side amount formula (authoritative):

- `totalMinutes = checkout - checkin`
- `rentAmount = (totalMinutes / 60) * price`
- `payAmount = rentAmount * 1.5`

Payment record behavior:

- if no existing payment: insert `PENDING`
- if existing payment is `FAILED`: reuse same row, set back to `PENDING`
- if existing payment is not `FAILED`: reject duplicate

Proof URL stored in `payment_proofs` table.

## 5.3 Admin payment review

Files:

- list: `src/app/api/admin/payment-approvals/route.ts`
- review: `src/app/api/payments/[id]/review/route.ts`

Action outcomes:

- `APPROVE`:
  - normal case:
    - payment -> `PAID`
    - booking -> `PAYMENT_CONFIRMED`
  - if booking was already `CANCELLED` by owner while payment was `PENDING`:
    - payment -> `REFUNDED`
    - booking stays `CANCELLED`
    - renter wallet gets full `pay_amount` refund
- `DENY`:
  - payment -> `FAILED`
  - booking -> `CANCELLED` (or remains `CANCELLED` if already cancelled)

## 6. Check-in / Checkout Flow

## 6.1 Check-in proof

File:

- `src/app/api/bookings/[id]/checkin/route.ts`

Rules:

- allowed booking statuses: `PAYMENT_CONFIRMED`, `CHECKIN_REJECTED`, `CHECKING_IN`
- check-in proof is required image (<= 5 MB)
- only within reservation window:
  - `now >= checkin_datetime`
  - `now < checkout_datetime`

On success:

- booking status -> `CHECKING_IN`
- `checkin_proof` set

## 6.2 Renter checkout request

File:

- `src/app/api/bookings/[id]/checkout/route.ts`

Rules:

- allowed statuses: `CHECKING_IN`, `CHECKIN_APPROVED`, `CHECKOUT_REJECTED`
- check-in proof must already exist
- no countdown lock here (user can request checkout immediately after valid check-in)

On success:

- booking status -> `CHECKING_OUT`

User can cancel checkout request:

- `DELETE /api/bookings/[id]/checkout`
- only when status is `CHECKING_OUT`
- sets status back to `CHECKIN_APPROVED`

## 6.3 Owner/admin checkout review

File:

- `src/app/api/owner/bookings/[id]/checkout-review/route.ts`

Review is allowed only after reservation end:

- `now >= checkout_datetime`

Actions:

- `APPROVE`:
  - settles and sets booking `CHECKOUT_APPROVED`
- `DENY`:
  - settles with deposit-forfeit and sets booking `CHECKOUT_REJECTED`

## 7. Settlement and Wallet Logic

Main file:

- `src/lib/booking-checkout.ts`

Settlement uses idempotent insert (`INSERT IGNORE`) into:

- `booking_checkout_settlements` (`PRIMARY KEY = b_id`)

This prevents double-credit on retries/race conditions.

## 7.1 Settlement formulas

Computed from paid amount:

- `rentAmount = payAmount / 1.5` (booked rent is static from payment)
- `ownerShare = rentAmount * 0.8`
- `platformShare = rentAmount * 0.2`
- `depositAmount = payAmount - rentAmount` (50%)

Late penalty (when applicable):

- `penaltyAmount = (lateMinutes / 60) * price`

If `forceForfeitHalf = true` (e.g., checkout denied/no-checkin auto-close):

- renter refund = `0`
- owner bonus = full deposit

Otherwise:

- renter refund = `max(deposit - penalty, 0)`
- owner bonus = penalty
- if penalty > deposit: renter gets extra wallet debit for excess

Wallet updates:

- owner gets `TOPUP` for `ownerShare + ownerBonus`
- renter gets `REFUND` for refund amount
- renter gets `DEBIT` for penalty excess beyond deposit

## 8. Cancellation Logic

## 8.1 Renter cancel booking

File:

- `src/app/api/bookings/[id]/cancel/route.ts`

Rules:

- only booking owner can cancel
- cannot cancel if already `CANCELLED` or `CHECKOUT_APPROVED`
- allowed only at least 1 day before reservation start:
  - `now <= checkin_datetime - 1 day`

If payment exists and not already refunded/failed:

- full `pay_amount` refunded to renter wallet
- payment status -> `REFUNDED`
- booking -> `CANCELLED`

## 8.2 Owner/admin cancel booking

File:

- `src/app/api/owner/bookings/[id]/cancel/route.ts`

Rules:

- owner of lot or admin
- cannot cancel if already `CANCELLED` or `CHECKOUT_APPROVED`

Payment handling when owner/admin cancels:

- if `pay_status = PAID`:
  - full `pay_amount` refunded immediately to renter wallet
  - payment status -> `REFUNDED`
- if `pay_status = PENDING`:
  - booking is cancelled immediately
  - payment is not refunded yet and stays pending for admin review
  - after admin review:
    - if admin approves payment: payment becomes `REFUNDED`, renter gets refund
    - if admin denies payment: payment becomes `FAILED`
- if payment is `FAILED`/`REFUNDED`/missing:
  - booking is cancelled with no additional wallet action

Then booking -> `CANCELLED`.

## 9. Automation Logic (Event-Driven, No Cron Service)

File:

- `src/lib/booking-checkout.ts`

`runBookingCheckoutAutomation()` does 3 jobs:

1. Auto-cancel unpaid reservations
2. Auto-close no-checkin bookings
3. Auto-approve stale checkout reviews

### 9.1 Auto-cancel unpaid reservations

Booking status must be `WAITING_FOR_PAYMENT` and either:

- no payment row and 10 minutes passed since `booking_time`, or
- reservation start reached and payment missing/not paid

Effect:

- booking -> `CANCELLED`
- payment `PENDING` rows become `FAILED`

### 9.2 Auto-close no-checkin after reservation end

If booking in `PAYMENT_CONFIRMED`/`CHECKING_IN`/`CHECKIN_REJECTED` and no check-in proof, and `now >= checkout_datetime`:

- finalize as `CHECKOUT_APPROVED`
- force deposit forfeiture to owner (`AUTO_CHECKOUT_NO_CHECKIN`)

### 9.3 Auto-approve checkout after 7 hours

If booking is `CHECKING_OUT` for 7+ hours (based on `updated_at`):

- finalize as `CHECKOUT_APPROVED`
- reason `AUTO_APPROVED_7H`

## 9.4 Where automation is triggered

No scheduler daemon. Automation runs only when specific APIs are called:

- `POST /api/bookings`
- `GET /api/bookings/[id]`
- `PATCH /api/bookings/[id]/checkout`
- `POST /api/payments`
- `GET /api/parking-lots`
- `GET /api/parking-lots/parkingdetail/[id]`
- `GET /api/owner/bookings`
- `PATCH /api/owner/bookings/[id]/checkout-review`
- `GET /api/USER/[id]`

If traffic is low, automation can be delayed until next request hits one of these endpoints.

## 10. Owner/Admin Parking Lot Logic

## 10.1 Create lot request

File:

- `src/app/api/parking-lots/system/route.ts` (`POST`)

Requirements:

- requester must be owner/admin role and have `owner_profiles` row
- required fields: name, address parts, slots, price, coordinates pair
- requires at least 1 parking image
- requires ownership evidence file (image/pdf)

Initial lot state:

- `is_approve = 0`
- `p_status = 'ACTIVE'`

Metadata table `parking_lot_metadata` stores:

- vehicle types
- rules
- image URLs
- owner evidence URL

## 10.2 Admin lot request review

File:

- `src/app/api/admin/parking-lot-requests/[id]/route.ts`

Actions:

- `APPROVE`: `is_approve=1`, `p_status='ACTIVE'`
- `DENY`: `is_approve=0`, `p_status='INACTIVE'`

## 10.3 Temporary close/open by owner

File:

- `src/app/api/owner/parking-lots/[id]/route.ts` (`PATCH`)

Owner can set:

- `p_status = 'ACTIVE'` (open)
- `p_status = 'INACTIVE'` (temporarily close)

Home/listing only shows:

- `is_approve = 1` and `p_status = 'ACTIVE'`

## 11. Lazy-Created Tables

Created at runtime if missing:

- `payment_proofs`
- `parking_lot_metadata`
- `booking_vehicle_metadata`
- `wallets`
- `wallet_transactions`
- `booking_checkout_settlements`

This means first request to related APIs may create/alter schema.

## 12. Change Guide (Most Requested Tweaks)

## 12.1 Change deposit ratio (currently 50%)

Edit all of:

- `src/app/api/payments/route.ts`
  - `payAmount = rentAmount * 1.5`
- `src/lib/booking-checkout.ts`
  - `rentAmount = payAmount / 1.5`
  - deposit derived from `payAmount - rentAmount`
- `src/app/booking/[id]/page.tsx`
  - display texts and estimates for rent/deposit/total

Keep formulas consistent in all 3 places.

## 12.2 Change owner/platform split (currently 80/20)

Edit:

- `src/lib/booking-checkout.ts`
  - `ownerShare = rentAmount * 0.8`
  - `platformShare = rentAmount * 0.2`

## 12.3 Change late penalty formula

Edit:

- `src/lib/booking-checkout.ts`
  - `penaltyAmount = (lateMinutes / 60) * price`

## 12.4 Change unpaid timeout (currently 10 minutes)

Edit:

- `src/lib/booking-checkout.ts`
  - `DATE_ADD(b.booking_time, INTERVAL 10 MINUTE)` (appears in select + update)

## 12.5 Change slot post-buffer (currently +30 minutes)

Edit all overlap queries:

- `src/app/api/bookings/route.ts`
- `src/lib/parking-lots.ts`
- `src/app/api/parking-lots/parkingdetail/[id]/route.ts`

Current condition uses:

- `DATE_ADD(checkout_datetime, INTERVAL 30 MINUTE)`

## 12.6 Change renter cancel policy (currently 1 day before check-in)

Edit:

- `src/app/api/bookings/[id]/route.ts` (flag for UI)
- `src/app/api/bookings/[id]/cancel/route.ts` (enforcement)

Current condition:

- `now <= checkin_datetime - 1 day`

## 12.7 Change auto-approval delay for checkout review (currently 7 hours)

Edit:

- `src/lib/booking-checkout.ts`
  - `NOW() >= DATE_ADD(updated_at, INTERVAL 7 HOUR)`

## 13. Known Operational Notes

- Automation is request-driven, not scheduled. If strict timing is required, add a cron/worker that calls `runBookingCheckoutAutomation()`.
- Payment review is admin-only.
- Availability shown on home/detail is a near-term view (now to next hour), while booking creation validates requested time window exactly.
- Parking lot text translation now uses API on create/update (`src/lib/translation-api.ts`) with fallback mapping (`src/lib/thai-address.ts`). Home/detail pages read Thai display fields from metadata.
