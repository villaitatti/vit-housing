# Villa I Tatti Housing

Private rental listing platform for the Villa I Tatti community (Harvard University Center for Italian Renaissance Studies, Florence).

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 9
- **PostgreSQL** >= 16
- **AWS Account** with S3 and SES configured
- **Auth0 Account** with VIT ID application configured
- **Google Maps API Key** with Geocoding API enabled

## Project Structure

```
├── client/          # React + Vite frontend
├── server/          # Node.js + Express backend
├── prisma/          # Prisma schema and migrations
├── shared/          # Shared TypeScript types and Zod schemas
└── README.md
```

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit both `.env` files with your actual values. See the Environment Variables section below for details.

### 3. Set up the database

```bash
cd server
pnpm db:migrate
```

### 4. Run locally

```bash
# From root — starts both client and server
pnpm dev
```

- **Client:** http://localhost:5173
- **Server:** http://localhost:3000

## Environment Variables

### Server (`server/.env`)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `DRUPAL_DB_URL` | Legacy Drupal MySQL connection (migration only) |
| `AUTH0_DOMAIN` | Auth0 tenant domain (e.g., `your-tenant.eu.auth0.com`) |
| `AUTH0_AUDIENCE` | Auth0 API audience identifier |
| `AUTH0_CLIENT_ID` | Auth0 application client ID |
| `JWT_SECRET` | Secret for signing local JWTs |
| `AWS_REGION` | AWS region (e.g., `eu-west-1`) |
| `AWS_ACCESS_KEY_ID` | AWS access key (used for S3 and SES) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key (used for S3 and SES) |
| `AWS_S3_BUCKET_NAME` | S3 bucket for listing photos |
| `SES_FROM_ADDRESS` | Verified SES sender address |
| `INVITATION_BASE_URL` | Base URL for invitation email links |
| `GOOGLE_MAPS_API_KEY` | Server-side geocoding API key |
| `PORT` | Server port (default: 3000) |

### Client (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_AUTH0_DOMAIN` | Auth0 tenant domain |
| `VITE_AUTH0_CLIENT_ID` | Auth0 client ID |
| `VITE_AUTH0_AUDIENCE` | Auth0 API audience |
| `VITE_GOOGLE_MAPS_API_KEY` | Public Google Maps API key (restrict by HTTP referrer) |
| `VITE_API_BASE_URL` | Backend API URL (default: `http://localhost:3000`) |

## AWS SES Setup

AWS SES starts in sandbox mode. To send emails to any address:
1. Verify your sender domain in the SES console
2. Request production sending access via the SES console
3. Set `SES_FROM_ADDRESS` to a verified email address

## Drupal Migration

To migrate data from the legacy Drupal 7 database:

1. Export the Drupal MySQL database
2. Set `DRUPAL_DB_URL` in `server/.env`
3. Run the migration:
   ```bash
   cd server
   npx tsx scripts/migrate-drupal.ts
   ```
4. Verify migration by checking record counts in PostgreSQL
