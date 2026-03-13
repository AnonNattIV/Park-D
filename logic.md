# Park-D Logic Guide

Last updated: 2026-03-13

This document explains current business rules in code so behavior changes can be made safely.

## 1. Status Model

### 1.1 Booking status (`bookings.b_status`)

Main runtime states:

- `WAITING_FOR_PAYMENT`
- `PAYMENT_CONFIRMED`
- `CHECKING_IN`
- `CHECKIN_APPROVED`
- `CHECKIN_REJECTED`
- `CHECKING_OUT`
- `CHECKOUT_APPROVED`
- `CHECKOUT_REJECTED`
- `CANCELLED`

Still treated as occupied in overlap checks for compatibility:

- `PENDING`
- `APPROVED_BY_OWNER`

### 1.2 Payment status (`payments.pay_status`)

- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`
- `CANCELLED` (exists in schema, rarely used in current handlers)

### 1.3 Settlement reason (`booking_checkout_settlements.settlement_reason`)

- `OWNER_APPROVED`
- `AUTO_APPROVED_7H`
- `AUTO_CHECKOUT_NO_CHECKIN`

## 2. Timezone and Time Rules

System time is Bangkok (`UTC+07:00`):

- DB pool sets timezone in `src/lib/db/mysql.ts`.
- SQL conditions commonly use `CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')`.
- Client datetime parsing is centralized in `src/lib/time-bangkok.ts`.

## 3. Booking Creation Rules

Route: `POST /api/bookings`

Validation:

- authenticated user only
- lot must be approved and active
- cannot rent own lot
- plate is required and <= 20 chars
- check-in and checkout required and valid
- check-in must be at least 5 minutes from current time
- checkout must be later than check-in

Conflict/slot rule:

- overlap check uses occupied statuses
- overlap condition:
  - `existing.checkin < requested.checkout`
  - `DATE_ADD(existing.checkout, INTERVAL 30 MINUTE) > requested.checkin`
- if active overlaps reach `total_slot`, booking is rejected

On success:

- booking inserted with `b_status='WAITING_FOR_PAYMENT'`
- vehicle metadata stored in `booking_vehicle_metadata`

## 4. Payment Submission Rules

Route: `POST /api/payments`

Validation:

- renter must own booking
- booking must be `WAITING_FOR_PAYMENT`
- proof must be image <= 5 MB
- payment method normalized and validated

Time behavior:

- if current time is already at/after booking check-in:
  - booking auto-cancelled
  - pending payment rows are marked failed

Payment amount formula (authoritative):

- `rentAmount = (totalMinutes / 60) * lot.price`
- `payAmount = rentAmount * 1.5` (rent + 50% deposit)

Record behavior:

- first submit: insert `payments` row as `PENDING`
- resubmit allowed only when existing payment is `FAILED`
- proof URL stored in `payment_proofs`

## 5. Admin Payment Review Rules

Route: `PATCH /api/payments/[id]/review`

Permission:

- admin only

Actions:

- `APPROVE`:
  - normal case: payment `PAID`, booking `PAYMENT_CONFIRMED`
  - if booking already cancelled by owner/admin while payment pending:
    - payment `REFUNDED`
    - booking remains `CANCELLED`
    - renter wallet receives full refund
- `DENY`:
  - payment `FAILED`
  - booking `CANCELLED` (or stays cancelled)

## 6. Check-in and Checkout Rules

### 6.1 Check-in proof

Route: `POST /api/bookings/[id]/checkin`

- allowed booking statuses: `PAYMENT_CONFIRMED`, `CHECKIN_REJECTED`, `CHECKING_IN`
- proof image required (<= 5 MB)
- allowed only within booking window:
  - now >= check-in
  - now < checkout
- on success:
  - `checkin_proof` updated
  - status becomes `CHECKING_IN`

### 6.2 Checkout request by renter

Route: `PATCH /api/bookings/[id]/checkout`

- allowed statuses: `CHECKING_IN`, `CHECKIN_APPROVED`
- requires existing check-in proof
- on success: status -> `CHECKING_OUT`

Route: `DELETE /api/bookings/[id]/checkout`

- allowed statuses: `CHECKING_OUT`, `CHECKOUT_REJECTED`
- resets status to `CHECKIN_APPROVED`

### 6.3 Checkout review by owner/admin

Route: `PATCH /api/owner/bookings/[id]/checkout-review`

- caller must be lot owner or admin
- review window opens only after booking end time
- `APPROVE`:
  - final status `CHECKOUT_APPROVED`
  - settlement with normal penalty/refund calculation
- `DENY`:
  - final status `CHECKOUT_REJECTED`
  - force deposit forfeiture

## 7. Settlement and Wallet Formulas

Main code: `src/lib/booking-checkout.ts`

Idempotency:

- settlement row uses `INSERT IGNORE` keyed by `b_id`
- prevents double-credit on retries/races

Core computation:

- `rentAmount = payAmount / 1.5`
- `ownerShare = rentAmount * 0.8`
- `platformShare = rentAmount * 0.2`
- `depositAmount = payAmount - rentAmount`

Late penalty:

- `penaltyAmount = (lateMinutes / 60) * lot.price`

If forfeiture (`forceForfeitHalf=true`):

- renter refund = `0`
- owner bonus = full deposit

Normal path:

- renter refund = `max(deposit - penalty, 0)`
- owner bonus = penalty
- if penalty > deposit, renter wallet gets extra `DEBIT`

Wallet transaction types used:

- `TOPUP`
- `REFUND`
- `DEBIT`

## 8. Cancellation Rules

### 8.1 Renter cancellation

Route: `PATCH /api/bookings/[id]/cancel`

Allowed when booking is not completed/cancelled and one of:

- booking still `WAITING_FOR_PAYMENT`, or
- at least 1 day before check-in time, or
- within 10 minutes after successful payment (with no check-in proof)

Refund behavior:

- if payment exists and status is refundable (`PAID`/`PENDING` path that is not failed/cancelled/refunded):
  - full `pay_amount` -> renter wallet
  - payment status -> `REFUNDED`
- booking status -> `CANCELLED`

### 8.2 Owner/admin cancellation

Route: `PATCH /api/owner/bookings/[id]/cancel`

Permissions:

- lot owner or admin

Refund behavior:

- if payment `PAID`: immediate wallet refund and payment `REFUNDED`
- if payment `PENDING`: booking cancelled immediately, final outcome waits for admin payment review
- otherwise: no wallet action

Booking status becomes `CANCELLED`.

## 9. Owner/Lot Moderation Logic

### 9.1 Owner request

Route: `POST /api/owner-requests`

- active users only
- requires citizen id + evidence
- sets `owner_request_status='PENDING'`
- saves metadata in `owner_request_metadata`

Admin review paths:

- `/api/admin/owner-requests`
- `PATCH /api/USER/[id]` with `APPROVE_OWNER` or `REJECT_OWNER`

### 9.2 Parking lot request

Route: `POST /api/parking-lots/system`

- owner/admin only
- requires image(s), owner evidence, location fields, slot/price
- initial state pending approval (`is_approve=0`)

Admin review:

- `PATCH /api/admin/parking-lot-requests/[id]`
- approve -> lot visible/active
- deny -> lot hidden/inactive

## 10. Notification Logic

Notification tables and helpers:

- `src/lib/notifications.ts`
- `user_notifications` table auto-created if missing

Triggers include:

- booking created
- payment submitted/reviewed
- checkout requested/cancelled/approved/denied
- owner request submitted/approved/rejected/cancelled
- security-sensitive account updates

Some notification flows can also send email via Brevo helper APIs.

## 11. Security-Code Logic

Table: `user_security_codes` (auto-created)

Purposes:

- `EMAIL_VERIFICATION`
- `PASSWORD_RESET`
- `ACCOUNT_SENSITIVE_CHANGE`

Rules:

- numeric one-time code, hashed with SHA-256 + pepper
- per-purpose cooldown support (for example 60s in forgot-password)
- max attempts and expiry enforced
- code can be verified-only or verify-and-consume

## 12. Automation (Request-Driven, No Dedicated Scheduler)

Function: `runBookingCheckoutAutomation()`

Jobs:

1. auto-cancel unpaid bookings
2. auto-close no-checkin bookings after checkout time
3. auto-approve stale checkout requests after 7 hours

Current trigger endpoints:

- `POST /api/bookings`
- `GET /api/bookings/[id]`
- `PATCH /api/bookings/[id]/checkout`
- `GET /api/owner/bookings`
- `PATCH /api/owner/bookings/[id]/checkout-review`
- `POST /api/payments`
- `GET /api/parking-lots`
- `GET /api/parking-lots/parkingdetail/[id]`
- `GET /api/USER/[id]`

Operational impact:

- if traffic is low, automation actions can occur later than their target time

## 13. Change Points (Common Adjustments)

Deposit ratio (currently 50%):

- `src/app/api/payments/route.ts`
- `src/lib/booking-checkout.ts`
- UI pages showing estimates (`src/app/booking/[id]/page.tsx`, booking detail pages)

Owner/platform split (currently 80/20):

- `src/lib/booking-checkout.ts`

Late penalty formula:

- `src/lib/booking-checkout.ts`

Unpaid timeout (currently 10 minutes):

- `src/lib/booking-checkout.ts`

Checkout auto-approval timeout (currently 7 hours):

- `src/lib/booking-checkout.ts`

Slot overlap buffer after checkout (currently +30 minutes):

- `src/app/api/bookings/route.ts`
- `src/lib/parking-lots.ts`
- `src/app/api/parking-lots/parkingdetail/[id]/route.ts`
