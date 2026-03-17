# Villa I Tatti Housing

> Private rental listing platform for the [Villa I Tatti](https://itatti.harvard.edu/) community — Harvard University Center for Italian Renaissance Studies, Florence.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express, Prisma |
| Database | PostgreSQL |
| Auth | Auth0 |

## Project Structure

```
client/    React + Vite frontend
server/    Express API + Prisma
shared/    Shared types & Zod schemas
```

## Getting Started

```bash
# Use the repo's Node version
nvm use

# Install dependencies
pnpm install

# Copy and configure environment variables
cp .env.example .env

# Run database migrations
cd server && pnpm db:migrate && cd ..

# Start dev server (client + API)
pnpm dev
```

**Client** runs at `http://localhost:5173` · **API** at `http://localhost:3000`

## License

Private — All rights reserved.
