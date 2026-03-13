# Park-D

Park-D is a Next.js parking platform prototype with live flows for:

- parking discovery
- booking + payment proof upload
- renter check-in / checkout
- owner parking management
- admin review boards (owner requests, parking-lot requests, payment proofs)
- wallet-based refund and settlement records

## Tech Stack

- Next.js 14 + React 18 + TypeScript
- Tailwind CSS
- MySQL (`mysql2`)
- JWT auth (`jsonwebtoken`) + password hashing (`bcryptjs`)
- S3-compatible storage (`@aws-sdk/client-s3`) for proof/profile images
- Google Maps JavaScript API + Geocoding API
- Docker / Docker Compose

## Prerequisites

- Node.js 20+
- npm
- MySQL-compatible database
- S3-compatible bucket
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

Use `.env.local` for local dev and `.env` for Docker Compose.

Required:

```env
JWT_SECRET=change-me-in-production

DB_HOST=your-db-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
DB_SSL=true

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
# Optional server key for Places API (preferred over NEXT_PUBLIC key on server)
GOOGLE_PLACES_API_KEY=your-google-places-api-key

BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=no-reply@your-domain.com
BREVO_SENDER_NAME=Park:D
# Optional Brevo endpoint/retry tuning
# BREVO_API_URL=https://api.brevo.com/v3/smtp/email
# BREVO_SEND_RETRY_COUNT=2
# BREVO_SEND_TIMEOUT_MS=15000

AWS_S3_BUCKET_NAME=your-bucket
AWS_ENDPOINT_URL=https://your-s3-endpoint
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_DEFAULT_REGION=auto

# Translation API (optional but recommended for Thai/English parking text conversion)
# TRANSLATION_PROVIDER=google
# GOOGLE_TRANSLATE_API_KEY=your-google-translate-key
#
# or use LibreTranslate-compatible API:
# TRANSLATION_PROVIDER=libretranslate
# LIBRE_TRANSLATE_URL=https://your-libretranslate-endpoint/translate
# LIBRE_TRANSLATE_API_KEY=your-libretranslate-key
```

Notes:

- `.env.example` currently does not list `AWS_*` variables yet.
- Without `AWS_*`, proof/profile image endpoints will fail.
- `BREVO_*` is required for:
  - registration confirmation email
  - forgot-password code
  - verification code for email/password changes
  - owner request approval/rejection email
  - selected in-app notifications (payment review / checkout review)
- If Brevo returns temporary transport/SSL errors, the mail client now retries and falls back to Brevo legacy endpoint automatically.
- `APP_BASE_URL` is optional. Set it only if you want clickable action links in notification emails.
- `SECURITY_CODE_PEPPER` is optional. If unset, the app falls back to `JWT_SECRET`.
- `GOOGLE_PLACES_API_KEY` is optional but recommended. If missing, server location normalization falls back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

## Run Locally

```bash
npm run dev
```

Open `http://localhost:3000`.

Other scripts:

```bash
npm run lint
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

## Main Routes

- `/` parking homepage
- `/parkingdetail/[id]` lot detail
- `/booking/[id]` create booking + payment proof
- `/booking-history/[id]` booking detail, check-in, checkout request
- `/aboutme` profile + wallet + booking history
- `/owner/home` owner dashboard
- `/owner/parkingspace` create lot request
- `/owner/parkingmanage` manage lot
- `/admin` admin control center
- `/login`, `/register`, `/verify-email`, `/forgot-password`
- `/user/home` redirect to `/`

## Main API Groups

- Auth: `/api/auth/*`
- User/Profile: `/api/USER/[id]`, `/api/profile-image/*`
- Parking lots: `/api/parking-lots/*`, `/api/owner/parking-lots/[id]`
- Bookings: `/api/bookings/*`, `/api/owner/bookings/*`
- Payments: `/api/payments*`, `/api/admin/payment-approvals`
- Admin requests: `/api/admin/owner-requests`, `/api/admin/parking-lot-requests*`

## Notes

- Auth state is stored in `localStorage` (`auth_token`, `auth_user`).
- Protected APIs require `Authorization: Bearer <token>`.
- Wallet and settlement support tables are created lazily at runtime if missing.
- Checkout automation is triggered from request handlers, not a separate scheduler service.

## Location Normalization

Parking-lot location input uses two layers of data:

- Raw input fields (source of truth): exactly what owner typed in form fields (`name`, `address`, `house number`, district/amphoe/subdistrict/province, GPS).
- Normalized fields (canonical): resolved in backend with Google Places API (New), stored separately in `parking_lot_metadata`.

Key behavior:

- Raw form values are never overwritten by translation/normalization.
- Places is attempted first using raw user text and optional GPS coordinates.
- Translation is only fallback support when Places cannot confidently resolve.
- Raw and normalized records are both stored, so UI keeps user-entered values while search/display can use normalized fields.

Main env vars for this flow:

- `GOOGLE_PLACES_API_KEY` (recommended server key)
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (map UI key, fallback for server Places if needed)
- `GOOGLE_TRANSLATE_API_KEY` (optional fallback language detection/translation support)

## Documentation

- Architecture: [architecture.md](architecture.md)
- API/DB/git-secret notes: [API_DB_GIT_SECRET.md](API_DB_GIT_SECRET.md)
