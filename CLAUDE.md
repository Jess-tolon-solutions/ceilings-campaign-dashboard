# Ceilings R Us Campaign Dashboard

## Deployment Rules

**Deploy only via git push, never `wrangler pages deploy`.**

If a build fails after pushing, stop and report the error to the user. Do not attempt to bypass failed builds with manual deploys.

## Database

- D1 database: `ceilings-db` (ID: 839a4e15-bcd4-414d-b9b3-cdb5090c98c2)
- Run migrations with: `npx wrangler d1 execute ceilings-db --remote --file=migrations/XXXX.sql`

## Admin Access

ADMIN_EMAILS env var controls who can import clients and lock rounds.
Current admins: jess@tolonsolutions.com, jessicatolon@gmail.com

## Ingest Endpoints

All ingest endpoints require Cloudflare Access service token headers:
- `CF-Access-Client-Id`
- `CF-Access-Client-Secret`

POST `/api/ingest/:source` where source is one of:
- `clients` - Client import
- `violations` - Direct mail Arm A (DBPR violations)
- `mail_list_b` - Direct mail Arm B (location-based)
- `gsc` - Google Search Console metrics
- `ga4` - Google Analytics 4 metrics
- `meta` - Meta Ads metrics
- `seo_keywords` - SEO keyword rankings
- `seo_pages` - SEO page performance
