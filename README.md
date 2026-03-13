# Park-D

Park-D is a Next.js parking platform prototype with working renter, owner, and admin flows:

- renter booking, payment proof upload, check-in proof, checkout request
- owner lot submission/management and booking review actions
- admin owner/parking/payment approvals
- wallet refunds/settlements
- in-app notifications + optional email delivery

## Tech Stack

- Next.js 14 (App Router) + React 18 + TypeScript
- Tailwind CSS
- MySQL (`mysql2`)
- JWT (`jsonwebtoken`) + password hashing (`bcryptjs`)
- S3-compatible storage (`@aws-sdk/client-s3`)
- Brevo transactional email API
- Leaflet map picker + Google Places/Maps APIs for location workflows

## Prerequisites

- Node.js 20+
- npm
- MySQL-compatible database
- S3-compatible object storage bucket
- Optional: Docker Desktop

## Install

```bash
npm ci
```

or:

```bash
npm install
```

## Environment Variables

Copy `.env.example` to `.env.local` (local dev) or `.env` (Docker/runtime), then fill values.

### Core auth and DB

```env
JWT_SECRET=change-me-in-production

DB_HOST=your-db-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
DB_SSL=true
```

### Storage (required for profile/proof uploads)

```env
AWS_S3_BUCKET_NAME=your-bucket
AWS_ENDPOINT_URL=https://your-s3-endpoint
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_DEFAULT_REGION=auto
```

### Maps/location

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
GOOGLE_PLACES_API_KEY=your-google-places-api-key
```

### Email and security code flows

```env
BREVO_API_KEY=your-brevo-key
BREVO_SENDER_EMAIL=no-reply@your-domain.com
BREVO_SENDER_NAME=Park:D

# Optional transport tuning
BREVO_API_URL=https://api.brevo.com/v3/smtp/email
BREVO_SEND_RETRY_COUNT=2
BREVO_SEND_TIMEOUT_MS=15000

# Optional extra pepper for security-code hashing (fallback is JWT_SECRET)
SECURITY_CODE_PEPPER=your-extra-secret
```

### Optional links/translation provider

```env
# Used for links in email notifications
APP_BASE_URL=https://your-domain.example

# Translation provider (default: google)
TRANSLATION_PROVIDER=google
GOOGLE_TRANSLATE_API_KEY=your-google-translate-key

# or LibreTranslate-compatible endpoint
TRANSLATION_PROVIDER=libretranslate
LIBRE_TRANSLATE_URL=https://your-libretranslate-endpoint/translate
LIBRE_TRANSLATE_API_KEY=your-libretranslate-key
```

## Database Setup

- Main schema reference: `db.json`
- Table purpose guide: `db.md`
- SQL migration snippets: `docs/sql/*.sql`
- Some support tables are created lazily by API/runtime code when missing:
  - `payment_proofs`
  - `booking_vehicle_metadata`
  - `parking_lot_metadata`
  - `owner_request_metadata`
  - `wallets`
  - `wallet_transactions`
  - `booking_checkout_settlements`
  - `user_notifications`
  - `user_security_codes`

## Run

```bash
npm run dev
```

Open `http://localhost:3000`.

Other scripts:

```bash
npm run lint
npm run test
npm run build
npm run start
```

## Docker

```bash
docker compose up --build
```

or:

```bash
docker build -t park-d-nextjs .
docker run -p 3000:3000 --env-file .env park-d-nextjs
```

## Main Pages

- `/` parking discovery home
- `/parkingdetail/[id]`
- `/booking/[id]`
- `/booking-history/[id]`
- `/review/[b_id]`
- `/aboutme`
- `/notifications`
- `/owner/home`
- `/owner/parkingspace`
- `/owner/parkingmanage`
- `/owner/request`
- `/admin`
- `/login`, `/register`, `/verify-email`, `/forgot-password`
- `/user/home` (redirect helper)

## API Map

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/verify-email`
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/password-check`
- `POST /api/auth/sensitive-code`
- `POST /api/auth/sensitive-code/verify`

### User, profile, notifications

- `GET|PUT|PATCH /api/USER/[id]`
- `POST|DELETE /api/profile-image`
- `GET /api/profile-image/[...key]`
- `GET|PATCH /api/notifications`
- `PATCH /api/notifications/[id]`

### Owner request and evidence

- `GET|POST|DELETE /api/owner-requests`
- `GET /api/owner-request-evidence/[...key]`

### Parking lots and owner parking

- `GET /api/parking-lots`
- `GET|POST /api/parking-lots/system`
- `GET /api/parking-lots/parkingdetail/[id]`
- `GET /api/parking-lots/[id]`
- `GET|PATCH|DELETE /api/owner/parking-lots/[id]`
- `GET /api/parking-lot-image/[...key]`
- `GET /api/parking-lot-evidence/[...key]`

### Booking, payment, review

- `POST|GET /api/bookings`
- `GET /api/bookings/[id]`
- `PATCH /api/bookings/[id]/cancel`
- `POST /api/bookings/[id]/checkin`
- `PATCH|DELETE /api/bookings/[id]/checkout`
- `POST /api/payments`
- `PATCH /api/payments/[id]/review`
- `GET /api/payment-proof/[...key]`
- `GET /api/checkin-proof/[...key]`
- `POST /api/reviews`

### Owner booking board

- `GET /api/owner/bookings`
- `PATCH /api/owner/bookings/[id]/cancel`
- `PATCH /api/owner/bookings/[id]/checkout-review`

### Admin board

- `GET /api/admin/owner-requests`
- `GET /api/admin/parking-lot-requests`
- `PATCH /api/admin/parking-lot-requests/[id]`
- `GET /api/admin/payment-approvals`
- `GET /api/admin/users`
- `PATCH /api/admin/users/[id]/status`

## Documentation

- Architecture: `architecture.md`
- Business logic: `logic.md`
- Database schema: `db.json`
- Database table guide: `db.md`
