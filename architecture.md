# Park-D Architecture (Current State)

Last updated: 2026-03-13

## 1. Overview

Park-D is a role-based parking web app with App Router APIs and direct MySQL integration.

Main domains:

- account/authentication and sensitive account changes
- owner onboarding + lot request workflow
- booking/payment/check-in/checkout lifecycle
- settlement/refund ledger through wallet tables
- admin moderation boards

## 2. Runtime Stack

- Framework: Next.js 14 (App Router)
- Language: TypeScript
- UI: React 18 + Tailwind CSS
- Database access: `mysql2/promise`
- Auth: JWT + bcrypt
- Storage: S3-compatible object store via AWS SDK v3
- Mail: Brevo API client wrapper
- Maps: Leaflet on UI, Google APIs for place resolution/translation support
- Tests: Node test runner via `tsx --test` for selected libs

## 3. What Must Be Installed

Local tools:

- Node.js 20+
- npm
- MySQL-compatible DB
- Optional: Docker Desktop

JS dependencies:

- install with `npm ci` (preferred) or `npm install`
- package list is pinned in `package.json` and `package-lock.json`

External services:

- MySQL instance
- S3-compatible bucket
- Brevo API account/key
- Google Maps key (and optionally Places + Translate keys)

## 4. High-Level Components

Frontend pages (`src/app/**/page.tsx`):

- renter pages: home, lot detail, booking, booking history, profile, notifications
- owner pages: owner home, lot create/manage, owner request
- admin page: review center

Backend API routes (`src/app/api/**/route.ts`):

- auth and security code APIs
- user/profile APIs
- owner/admin moderation APIs
- booking/payment/checkout APIs
- media proxy APIs for S3 object access

Shared libs (`src/lib/*`):

- `db/mysql.ts`: connection pool + timezone setup (`+07:00`)
- `auth.ts`: hash/verify/token helpers
- `storage.ts`: upload/delete/get file utilities
- `booking-checkout.ts`: settlement and automation
- `wallet.ts`: wallet schema + ledger updates
- `notifications.ts`: notification schema + CRUD + optional email delivery
- `security-codes.ts`: one-time code generation/validation
- location normalization modules (`location-normalization/*`, `translation-api.ts`)

## 5. Auth and Role Model

Identity:

- JWT bearer token from `/api/auth/login`
- token payload contains `userId`, `username`, `role`

Persistence:

- client stores `auth_token` and `auth_user` in `localStorage`

Role source:

- `users.roles` MySQL `SET('RENTER','OWNER','ADMIN')`
- runtime app role is resolved by `resolveAppRole(...)`
- owner role requires approved owner request + owner profile row

Account status:

- login is blocked unless `users.u_status = 'ACTIVE'`
- email verification routes move account from inactive to active
- admin can change user status via `/api/admin/users/[id]/status`

## 6. Frontend Route Map

Public and auth pages:

- `/`
- `/login`
- `/register`
- `/verify-email`
- `/forgot-password`
- `/parkingdetail/[id]`

Renter pages:

- `/booking/[id]`
- `/booking-history/[id]`
- `/review/[b_id]`
- `/aboutme`
- `/notifications`

Owner pages:

- `/owner`
- `/owner/home`
- `/owner/request`
- `/owner/parkingspace`
- `/owner/parkingmanage`

Admin page:

- `/admin`

Compatibility redirect:

- `/user/home`

## 7. API Surface

Auth/security:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/password-check`
- `POST /api/auth/sensitive-code`
- `POST /api/auth/sensitive-code/verify`

User/profile:

- `GET|PUT|PATCH /api/USER/[id]`
- `POST|DELETE /api/profile-image`
- `GET /api/profile-image/[...key]`

Notifications:

- `GET|PATCH /api/notifications`
- `PATCH /api/notifications/[id]`

Owner request:

- `GET|POST|DELETE /api/owner-requests`
- `GET /api/owner-request-evidence/[...key]`

Parking:

- `GET /api/parking-lots`
- `GET|POST /api/parking-lots/system`
- `GET /api/parking-lots/parkingdetail/[id]`
- `GET /api/parking-lots/[id]` (legacy/minimal detail route)
- `GET|PATCH|DELETE /api/owner/parking-lots/[id]`
- `GET /api/parking-lot-image/[...key]`
- `GET /api/parking-lot-evidence/[...key]`

Booking/payment/review:

- `POST|GET /api/bookings`
- `GET /api/bookings/[id]`
- `PATCH /api/bookings/[id]/cancel`
- `POST /api/bookings/[id]/checkin`
- `PATCH|DELETE /api/bookings/[id]/checkout`
- `POST /api/payments`
- `PATCH /api/payments/[id]/review`
- `POST /api/reviews`
- `GET /api/payment-proof/[...key]`
- `GET /api/checkin-proof/[...key]`

Owner booking board:

- `GET /api/owner/bookings`
- `PATCH /api/owner/bookings/[id]/cancel`
- `PATCH /api/owner/bookings/[id]/checkout-review`

Admin board:

- `GET /api/admin/owner-requests`
- `GET /api/admin/parking-lot-requests`
- `PATCH /api/admin/parking-lot-requests/[id]`
- `GET /api/admin/payment-approvals`
- `GET /api/admin/users`
- `PATCH /api/admin/users/[id]/status`

## 8. Core Runtime Flows

### 8.1 Register and activate account

1. User registers (`/api/auth/register`) -> account is inactive.
2. Verification code sent by Brevo.
3. `/api/auth/verify-email` validates code and sets `u_status='ACTIVE'`.

### 8.2 Owner request and approval

1. User uploads citizen ID evidence via `/api/owner-requests`.
2. `users.owner_request_status` becomes `PENDING`.
3. Admin reviews on `/admin` and approves/rejects.
4. Approval updates status and ensures owner profile data consistency.

### 8.3 Parking lot request and moderation

1. Owner submits lot + images + evidence via `/api/parking-lots/system`.
2. Lot starts pending (`is_approve=0`).
3. Admin approves/denies through `/api/admin/parking-lot-requests/[id]`.

### 8.4 Booking and payment

1. Renter creates booking (`WAITING_FOR_PAYMENT`).
2. Renter uploads payment proof (`/api/payments`).
3. Admin reviews payment (`/api/payments/[id]/review`):
   - approve -> booking confirmed
   - deny -> payment failed, booking cancelled

### 8.5 Check-in and checkout settlement

1. Renter uploads check-in proof (`/api/bookings/[id]/checkin`).
2. Renter submits checkout (`/api/bookings/[id]/checkout`).
3. Owner/admin reviews checkout (`/api/owner/bookings/[id]/checkout-review`).
4. Settlement writes `booking_checkout_settlements` and wallet ledger entries.

### 8.6 Cancellations and refunds

- renter cancellation: policy checks (before payment confirmation, or time windows) and optional refund to wallet
- owner/admin cancellation: immediate refund if paid; pending payments stay for admin review decision

## 9. Data Architecture

Canonical schema artifacts:

- machine-readable schema: `db.json`
- human-readable table guide: `db.md`

Base tables:

- `users`, `owner_profiles`, `parking_lots`, `bookings`, `payments`, `reviews`

Support tables (runtime-created if needed):

- `payment_proofs`
- `booking_vehicle_metadata`
- `parking_lot_metadata`
- `owner_request_metadata`
- `wallets`
- `wallet_transactions`
- `booking_checkout_settlements`
- `user_notifications`
- `user_security_codes`

## 10. Operational Behavior

- DB session timezone is forced to Bangkok (`+07:00`).
- Checkout automation is request-driven (no dedicated cron worker):
  - auto-cancel unpaid bookings
  - auto-close no-checkin bookings
  - auto-approve stale checkout reviews
- S3 files are not served directly; APIs proxy by object key routes.

## 11. Key Risks / Constraints

- Because automation is request-triggered, low traffic can delay scheduled-like actions.
- Role resolution depends on both `users.roles` and owner profile/request state.
- Upload-heavy endpoints require stable S3 credentials and bucket permissions.
- Security-code flows depend on Brevo delivery and cooldown windows.
