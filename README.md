# Ceilings R Us - Campaign Command Center

Client-facing campaign dashboard for Ceilings R Us (ceilingsrus.net).

**Owner:** Jess Tolon (Tolon Solutions AI)
**Primary User:** Jonathan Gallego

## Features

1. **Overview** - Campaign cards with status, volume, and results
2. **Next Round** - Selection screen for marking clients Yes/No/Later
3. **Direct Mail Test** - A/B comparison of two list sources
4. **Monthly Performance** - GSC, GA4, and Meta metrics combined

## Stack

- **Cloudflare Pages** - Frontend hosting
- **Cloudflare Pages Functions** - API at `/api/*`
- **Cloudflare D1** - SQLite database
- **Cloudflare Access** - Email PIN authentication

## Setup

### Prerequisites

- Node.js 18+
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account with Pages and D1 access

### 1. Create the D1 Database

```bash
wrangler d1 create ceilings-db
```

Copy the `database_id` from the output and paste it into `wrangler.toml`.

### 2. Run Migrations

```bash
# Local development
npm run db:migrate:local

# Production
npm run db:migrate
```

### 3. Set Up Cloudflare Access

1. Go to Cloudflare Zero Trust > Access > Applications
2. Create a new application:
   - **Name:** Ceilings Campaign Dashboard
   - **Domain:** your-pages-domain.pages.dev (and custom domain if applicable)
   - **Session duration:** 24 hours
3. Create an Access Policy:
   - **Name:** Allowed Users
   - **Action:** Allow
   - **Include:** Emails - add Jess and Jonathan's emails
4. Create a Service Token for API ingest:
   - Go to Access > Service Auth > Service Tokens
   - Create token named "Dashboard Ingest"
   - Save the Client ID and Client Secret

### 4. Configure Secrets

For the ingest endpoint, producer repos need the service token:

```bash
# In each producer repo (as GitHub secrets)
CF_ACCESS_CLIENT_ID=<client-id>
CF_ACCESS_CLIENT_SECRET=<client-secret>
DASHBOARD_INGEST_URL=https://your-domain.pages.dev/api/ingest
```

### 5. Local Development

```bash
npm install
npm run dev
```

This starts the local dev server with D1 binding. Use `X-Dev-User-Email` header to simulate auth.

### 6. Deploy

Push to `main` branch. Cloudflare Pages auto-deploys.

```bash
git add .
git commit -m "Initial scaffold"
git push origin main
```

Or deploy manually:

```bash
npm run deploy
```

## API Endpoints

All endpoints require Cloudflare Access authentication.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/me` | GET | Returns authenticated user email |
| `/api/campaigns` | GET | List all campaigns with stats |
| `/api/campaigns` | POST | Create a new campaign |
| `/api/clients` | GET | List clients with selection status |
| `/api/selections` | PATCH | Update a client's Yes/No/Later decision |
| `/api/mail-test` | GET | A/B test statistics |
| `/api/ingest/:source` | POST | Ingest data (service token auth) |

### Ingest Sources

| Source | Producer | Lands in |
|--------|----------|----------|
| `clients` | Initial import | `clients` table |
| `violations` | Violation map automation | `mail_drops` (Arm A) |
| `mail_list_b` | Location pull | `mail_drops` (Arm B) |
| `gsc` | Reporting repo | `metrics_monthly` |
| `ga4` | Reporting repo | `metrics_monthly` |
| `meta` | Reporting repo | `metrics_monthly` |

## Project Structure

```
.
├── functions/
│   ├── _middleware.ts    # Auth verification
│   └── api/
│       ├── me.ts
│       ├── campaigns.ts
│       ├── clients.ts
│       ├── selections.ts
│       ├── mail-test.ts
│       └── ingest/
│           └── [source].ts
├── migrations/
│   └── 0001_schema.sql
├── public/
│   ├── index.html
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
├── wrangler.toml
└── package.json
```

## Brand

- Primary: `#116782` (teal)
- Secondary: `#118484`
- Accent: `#5eff00` (green, for "go" states only)

## Contact

Jonathan's phone for all sales: (954) 452-0004
# Trigger redeploy
