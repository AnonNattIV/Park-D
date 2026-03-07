# Park-D Architecture (Current State)

Last updated: 2026-03-08

## 1. Overview

Park-D is a Next.js App Router application for:

- public parking lot discovery
- account registration/login
- booking creation and payment-proof submission
- renter check-in / checkout flow
- owner and admin approval workflows
- wallet-based settlement/refund records

The project is now beyond mock dashboards: owner/admin/booking/payment flows are connected to API routes and database state.

## 2. Runtime Stack

- Framework: Next.js 14 (`app` directory, standalone output)
- Language: TypeScript (strict mode)
- UI: React 18 + Tailwind CSS
- Icons: `@heroicons/react`
- Map UI: `leaflet`
- Auth/security: `bcryptjs`, `jsonwebtoken`
- Database driver: `mysql2/promise`
- Object storage: `@aws-sdk/client-s3`
- Image support: `sharp` (installed for Next.js production image pipeline)
- Tooling: ESLint, PostCSS, Autoprefixer
- Deployment: Docker multi-stage build + Docker Compose

## 3. What To Install / Download

### Local software

- Node.js 20+
- npm
- Optional: Docker Desktop

### JavaScript dependencies

Install with:

- `npm ci` (preferred)
- or `npm install`

### External services

- MySQL-compatible database
- S3-compatible object storage bucket (profile/payment/check-in proof files)
- Internet access for OpenStreetMap tiles and Nominatim geocoding used by the map picker

## 4. Environment Variables

Required by auth + DB:

- `JWT_SECRET`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL` (optional, defaults to enabled unless explicitly `false`)

Required by S3 object storage:

- `AWS_S3_BUCKET_NAME`
- `AWS_ENDPOINT_URL`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_DEFAULT_REGION` (optional, defaults to `auto`)

Notes:

- `docker-compose.yml` uses `.env`
- local dev commonly uses `.env.local`
- `.env.example` currently documents JWT/DB values only and does not include AWS variables

## 5. Frontend Route Map

Public:

- `/` homepage with parking list and search
- `/login`
- `/register`
- `/parkingdetail/[id]` parking lot detail + reviews + metadata

Authenticated user flows:

- `/booking/[id]` create booking, then upload payment proof
- `/booking-history/[id]` booking detail, check-in proof upload, checkout request
- `/aboutme` profile edit + wallet summary + recent booking history

Authenticated owner/admin flows:

- `/owner/home` owner dashboard, owner request status, parking list, owner booking actions
- `/owner/parkingspace` create parking-lot request with map pin + metadata
- `/owner/parkingmanage` manage owner parking lot (edit/toggle/delete)
- `/admin` admin control center (owner requests, parking-lot requests, payment proofs)

Compatibility:

- `/user/home` redirects to `/`

## 6. API Surface

Auth:

- `POST /api/auth/login`
- `POST /api/auth/register`

User/profile:

- `GET /api/USER/[id]`
- `PUT /api/USER/[id]`
- `PATCH /api/USER/[id]` (`REQUEST_OWNER`, `APPROVE_OWNER`, `REJECT_OWNER`)
- `POST /api/profile-image`
- `DELETE /api/profile-image`
- `GET /api/profile-image/[...key]`

Parking lots:

- `GET /api/parking-lots`
- `GET /api/parking-lots/system`
- `POST /api/parking-lots/system` (owner request to add lot)
- `GET /api/parking-lots/parkingdetail/[id]` (main detail endpoint used by UI)
- `GET /api/parking-lots/[id]` (legacy/minimal detail endpoint still present)
- `GET /api/owner/parking-lots/[id]`
- `PATCH /api/owner/parking-lots/[id]`
- `DELETE /api/owner/parking-lots/[id]`

Bookings and checkout:

- `POST /api/bookings` (create booking in `WAITING_FOR_PAYMENT`)
- `GET /api/bookings/[id]`
- `POST /api/bookings/[id]/checkin` (upload check-in proof)
- `PATCH /api/bookings/[id]/checkout` (renter requests checkout)
- `GET /api/owner/bookings`
- `PATCH /api/owner/bookings/[id]/cancel` (owner/admin cancel + refund)
- `PATCH /api/owner/bookings/[id]/checkout-review` (owner/admin approve or deny checkout)

Payments:

- `POST /api/payments` (upload payment proof for a booking)
- `PATCH /api/payments/[id]/review` (admin approve/deny payment)
- `GET /api/admin/payment-approvals`
- `GET /api/payment-proof/[...key]`
- `GET /api/checkin-proof/[...key]`

Admin review boards:

- `GET /api/admin/owner-requests`
- `GET /api/admin/parking-lot-requests`
- `PATCH /api/admin/parking-lot-requests/[id]`

## 7. Core Runtime Flows

### Booking + payment proof

1. User opens `/booking/[lotId]`.
2. Client submits `POST /api/bookings`.
3. Client uploads proof with `POST /api/payments`.
4. Booking remains waiting until admin payment review.

### Payment review

1. Admin reads pending proofs via `GET /api/admin/payment-approvals`.
2. Admin confirms/denies via `PATCH /api/payments/[id]/review`.
3. On approve: payment becomes `PAID`, booking moves to `PAYMENT_CONFIRMED`.
4. On deny: payment becomes `FAILED`, booking returns to `WAITING_FOR_PAYMENT`.

### Check-in and checkout

1. Renter uploads check-in proof: `POST /api/bookings/[id]/checkin`.
2. After end time, renter sends checkout request: `PATCH /api/bookings/[id]/checkout`.
3. Owner/admin reviews checkout: `PATCH /api/owner/bookings/[id]/checkout-review`.
4. Settlement credits owner and renter wallets based on policy.

### Owner and parking-lot approvals

- Owner role request is managed via `PATCH /api/USER/[id]`.
- Parking-lot approval/denial is managed via admin request APIs.

## 8. Auth and Access Model

- JWT issued in login route
- token + user payload stored in browser `localStorage`
- protected API routes use `Authorization: Bearer <token>`
- most page guards are client-side checks + API authorization
- role resolution still uses `users.roles` with owner-profile/request-state fallback logic

## 9. Data and Table Usage

Core existing tables used:

- `users`
- `owner_profiles`
- `parking_lots`
- `bookings`
- `payments`
- `reviews`

Runtime-created support tables (created by API/lib code if missing):

- `payment_proofs`
- `parking_lot_metadata`
- `booking_vehicle_metadata`
- `wallets`
- `wallet_transactions`
- `booking_checkout_settlements`

This means some schema pieces are provisioned lazily by route execution, not only by manual migrations.

## 10. State Machines (Important)

Booking statuses seen in code include:

- `WAITING_FOR_PAYMENT`
- `PAYMENT_CONFIRMED`
- `CHECKING_IN`
- `CHECKIN_APPROVED`
- `CHECKIN_REJECTED`
- `CHECKING_OUT`
- `CHECKOUT_APPROVED`
- `CHECKOUT_REJECTED`
- `CANCELLED`

Payment statuses seen in code include:

- `PENDING`
- `PAID`
- `FAILED`
- `REFUNDED`

Parking-lot review states (admin board mapping):

- `REQUEST` (pending)
- `APPROVED`
- `DENIED`

## 11. Automation Behavior

Checkout automation runs from request paths (not from a scheduler service):

- `runBookingCheckoutAutomation()` is triggered inside key GET handlers
- auto-handled paths include:
  - auto-checkout when no check-in proof exists and time has passed
  - auto-approval after owner review timeout window

Operational implication: automation executes when traffic hits those endpoints.

## 12. Key Paths

- `src/app/*`: pages
- `src/app/api/*`: route handlers
- `src/lib/booking-checkout.ts`: settlement and auto-checkout logic
- `src/lib/wallet.ts`: wallet table/bootstrap helpers
- `src/lib/parking-lots.ts`: list/detail queries and owner-income aggregation
- `src/lib/storage.ts`: S3 object upload/get/delete for profile/payment/check-in proofs
- `src/components/MapCoordinatePicker.tsx`: Leaflet map pin picker

Legacy/reference files still present:

- `lib/db.js` (legacy DB helper)
- `src/lib/db/prisma.ts` (template/reference, not runtime path)

