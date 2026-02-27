# API, DB Binding, and git-secret

## API to DB binding
`lib/db.js` creates a MySQL connection pool with `mysql2/promise`.

Required env vars:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

In Docker, these values are bound through `docker-compose.yml` via:
- `env_file: .env`

## Using the DB in an API route (Next.js App Router)
Example route file: `app/api/health/route.js`

```js
import { NextResponse } from "next/server";
import pool from "@/lib/db";

export async function GET() {
  const [rows] = await pool.query("SELECT 1 AS ok");
  return NextResponse.json({ ok: true, rows });
}
```

Call it at `GET /api/health`.

## git-secret flow in this repo
Current setup:
- `.env` is local and ignored by git.
- `.env.secret` is tracked and encrypted.
- `.gitsecret/paths/mapping.cfg` maps `.env` to its encrypted file.

Typical workflow:
1. Edit `.env` locally.
2. Run `git secret hide -m` to re-encrypt into `.env.secret`.
3. Commit `.env.secret` and `.gitsecret` metadata.
4. Other collaborators run `git secret reveal -f` after importing allowed GPG keys.

Add a new collaborator key:
1. `git secret tell <gpg_email>`
2. `git secret hide -m`
3. Commit updated `.gitsecret/keys` files.

## Security notes
- Never commit plaintext `.env`.
- If credentials were exposed anywhere, rotate DB password and regenerate secrets.
