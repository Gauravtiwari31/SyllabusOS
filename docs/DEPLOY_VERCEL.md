# Deploy SyllabusOS on Vercel

About 20 minutes. You need: the GitHub repo, a Vercel account, a Neon account, your Gemini API key and your Google OAuth client.

## 1. Create a database for SyllabusOS

1. In [Neon](https://console.neon.tech), create a **new project** named `syllabusos` in **AWS Asia Pacific (Singapore)**. Don't reuse a database that belongs to another app.
2. Copy two connection strings from **Connect**:
   - **Pooled** (host contains `-pooler`) → this is `DATABASE_URL`
   - **Direct** (same URL without `-pooler`) → this is `DIRECT_URL`

## 2. Create the tables (once, from your machine)

Put both URLs in `.env.local` (it overrides `.env` for Next.js and the Prisma CLI):

```
DATABASE_URL="postgresql://…-pooler…/neondb?sslmode=require"
DIRECT_URL="postgresql://…/neondb?sslmode=require"
```

Then run:

```bash
pnpm db:migrate
```

`pnpm db:seed` is optional: every "Try the demo" click creates its own demo account.

Switch `.env.local` back to the local Docker URLs afterwards if you develop locally.

## 3. Import the project

1. Vercel → **Add New… → Project** → import `Gauravtiwari31/SyllabusOS`.
2. Framework preset **Next.js**, root directory `./`. Leave build and install commands on their defaults (pnpm is detected from `pnpm-lock.yaml`).

## 4. Environment variables

Add these for **Production** and **Preview** before the first deploy:

| Name | Value |
|---|---|
| `DATABASE_URL` | Neon pooled URL |
| `DIRECT_URL` | Neon direct URL |
| `AUTH_SECRET` | a new value: run `npx auth secret` and copy it (don't reuse the local one) |
| `AUTH_GOOGLE_ID` | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth client secret |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key |
| `GEMINI_MODEL_FAST` | `gemini-3.6-flash` |
| `GEMINI_MODEL_STRONG` | `gemini-3.6-flash` |
| `GEMINI_MODEL_FALLBACK` | `gemini-3.1-flash-lite,gemini-3.5-flash-lite` |
| `GEMINI_EMBED_MODEL` | `gemini-embedding-001` |

Leave these out:
- `BLOB_READ_WRITE_TOKEN`: uploads are processed in memory without it; with it, the original PDFs are stored at public (unguessable) URLs.
- `UPSTASH_*`: not used; rate limiting runs on Postgres.
- `AUTH_URL`: Vercel sets the host itself.

Add `ANDROID_PACKAGE_NAME` and `ANDROID_SHA256_CERT_FINGERPRINTS` later, when you build the app (see [ANDROID.md](ANDROID.md)).

## 5. Region

Settings → **Functions** → Function Region → **Singapore (sin1)**, next to the database. Every page makes several database queries, so this matters more than anything else for speed.

## 6. Deploy

Click **Deploy**. When it finishes, open `https://<project>.vercel.app` and click **Try the demo**.

If the build stops at the install step with a pnpm version error, add the environment variable `ENABLE_EXPERIMENTAL_COREPACK` = `1` and redeploy (Vercel then uses the exact pnpm version from `package.json`).

## 7. Google sign-in

In [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → **Credentials** → your OAuth client:

- Authorized JavaScript origins: `https://<project>.vercel.app`
- Authorized redirect URIs: `https://<project>.vercel.app/api/auth/callback/google`

Then **OAuth consent screen** → set the app to **In production** (while it is in "Testing", only the test users you list can sign in with Google).

Google sign-in works on the production URL only; preview deployments have different URLs. The guest demo works everywhere.

**Rotate the client secret** (Credentials → your client → Reset secret), update `AUTH_GOOGLE_SECRET` in Vercel and redeploy.

## 8. Custom domain (optional)

Settings → **Domains** → add it and follow the DNS steps. Then add the new origin and redirect URI in Google Cloud (step 7).

## 9. After launch

- **New database migrations:** when a change adds a folder under `prisma/migrations`, run `pnpm db:migrate` against Neon (step 2) before or right after that deploy.
- **Limits on the Hobby plan:** uploads are capped at 4 MB per PDF (Vercel's request limit is 4.5 MB); larger notes can be pasted as text. AI routes allow up to 60 s.
- **Quick checks:** `/api/auth/providers` lists `guest` (and `google`), the response headers include `Content-Security-Policy`, and `/manifest.webmanifest` loads.
