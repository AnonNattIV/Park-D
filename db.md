# Park-D Database Table Guide

Last updated: 2026-03-13

This file explains what each table is used for in the current application.

## 1. `users`

Purpose:

- master account table for login identity, profile basics, account state, and role set

Important fields:

- `user_id` primary key
- `username`, `email` (unique)
- `password_hash` (bcrypt)
- `u_status` (`ACTIVE`, `INACTIVE`, etc.)
- `roles` (`RENTER`, `OWNER`, `ADMIN` set)
- `owner_request_status` (`PENDING`, `APPROVED`, `REJECTED`)

Used by:

- all auth flows, role checks, profile endpoints, admin user management

## 2. `owner_profiles`

Purpose:

- owner-specific profile and ownership identity linkage

Important fields:

- `user_id` primary key + FK to `users`
- `o_citizen_id` (unique)
- `o_citizen_id_pic`
- `earning`

Used by:

- owner role validation and owner-lot ownership mapping

## 3. `owner_request_metadata`

Purpose:

- stores owner-request submission evidence and citizen ID details

Important fields:

- `user_id` primary key + FK to `users`
- `citizen_id`
- `evidence_url`

Used by:

- `/api/owner-requests` and admin owner-request review screens

## 4. `parking_lots`

Purpose:

- core parking lot records and approval/availability status

Important fields:

- `lot_id` primary key
- `owner_user_id` FK to owner profile
- `lot_name`, `location`, structured address fields
- `latitude`, `longitude`
- `total_slot`, `price`
- `is_approve`, `p_status`

Used by:

- public lot listing/detail, booking checks, owner manage pages, admin lot approvals

## 5. `parking_lot_metadata`

Purpose:

- extended lot metadata, images/evidence links, and normalized location data

Important fields:

- `lot_id` primary key + FK to `parking_lots`
- `vehicle_types_json`, `rules_json`
- `image_urls_json`, `owner_evidence_url`
- `raw_*` columns (owner-entered source values)
- `normalized_*` columns (Google/translation-based normalized values)
- `resolution_status`, `resolution_source`, `confidence_score`

Used by:

- lot creation/editing flows and search/display normalization behavior

## 6. `bookings`

Purpose:

- renter booking lifecycle records

Important fields:

- `b_id` primary key
- `user_id` FK to renter (`users`)
- `lot_id` FK to `parking_lots`
- `plate_id`, `booking_time`
- `checkin_datetime`, `checkout_datetime`
- `checkin_proof`
- `b_status`

Used by:

- booking creation, payment workflow, check-in/out workflow, cancellation and settlement

## 7. `booking_vehicle_metadata`

Purpose:

- optional vehicle brand/model details linked 1:1 with booking

Important fields:

- `b_id` primary key + FK to `bookings`
- `vehicle_brand`, `vehicle_model`

Used by:

- booking form metadata and admin booking views

## 8. `payments`

Purpose:

- payment state and amount per booking (1:1)

Important fields:

- `pay_id` primary key
- `b_id` unique FK to `bookings`
- `pay_status`
- `pay_method`
- `pay_amount`
- `paid_at`

Used by:

- payment submission, admin payment approvals, refund logic

## 9. `payment_proofs`

Purpose:

- payment proof file URL per payment

Important fields:

- `pay_id` primary key + FK to `payments`
- `proof_image_url`

Used by:

- payment proof upload/display and admin review board

## 10. `reviews`

Purpose:

- post-booking renter feedback for parking lot quality

Important fields:

- `review_id` primary key
- `b_id` unique FK to `bookings`
- `score`
- `comment`

Used by:

- review submission and lot detail rating display

## 11. `wallets`

Purpose:

- per-user balance table for refunds, payouts, and penalties

Important fields:

- `wallet_id` primary key
- `user_id` unique FK to `users`
- `balance`

Used by:

- refund/cancel flows and checkout settlement payouts

## 12. `wallet_transactions`

Purpose:

- immutable wallet ledger entries for every balance change

Important fields:

- `tx_id` primary key
- `wallet_id` FK to `wallets`
- `user_id` FK to `users`
- `booking_id`, `payment_id` (context links)
- `tx_type` (`REFUND`, `TOPUP`, `DEBIT`, `ADJUSTMENT`)
- `amount`, `balance_before`, `balance_after`, `note`

Used by:

- audit trail for all wallet operations shown in profile/wallet history

## 13. `booking_checkout_settlements`

Purpose:

- stores final checkout settlement computation per booking (idempotent 1:1)

Important fields:

- `b_id` primary key + FK to `bookings`
- `owner_user_id`, `renter_user_id`, `pay_id`
- `pay_amount`, `rent_amount`, `owner_share`, `platform_share`
- `renter_refund`, `owner_bonus`
- `settlement_reason`

Used by:

- checkout approval/denial automation and owner settlement reporting

## 14. `user_notifications`

Purpose:

- in-app notifications for renter/owner/admin events

Important fields:

- `notification_id` primary key
- `user_id` FK to `users`
- `notification_type`, `title`, `message`, `action_url`
- `is_read`, `read_at`

Used by:

- notifications page and unread badge counters

## 15. `user_security_codes`

Purpose:

- one-time security code storage for verification/reset/sensitive actions

Important fields:

- `security_code_id` primary key
- `user_id` nullable
- `email`, `purpose`, `target_value`
- `code_hash`
- `attempts`, `max_attempts`
- `expires_at`, `used_at`

Used by:

- email verification, forgot-password, sensitive profile change confirmation

## Notes

- Several support tables are created lazily by API/lib code when first used.
- Machine-readable schema source is `db.json`.
