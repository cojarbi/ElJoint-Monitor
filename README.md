# Staffless

Staffless is a comprehensive platform for managing business operations with AI agent integration. It combines a robust Next.js frontend with powerful backend services.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS, Shadcn/UI
- **Backend**: Node.js, NextAuth.js
- **Database**: PostgreSQL with Prisma ORM (v5)

- **Validation**: Zod
- **Infrastructure**: Docker (for local development)

## Prerequisites

- Node.js 18+
- Docker and Docker Compose
- npm or pnpm

## Getting Started

### 1. Clone the repository

```bash
git clone <repository-url>
cd staffless
```

### 2. Install dependencies

```bash
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory. You can copy the structure below:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/staffless?schema=public"

# Auth (NextAuth)
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-at-least-32-chars"


```

### 4. Start Backend Services

Start PostgreSQL using Docker Compose:

```bash
docker-compose up -d
```

This will run:
- **Postgres** on port `5432`

### 5. Setup Database

Push the database schema to your local Postgres instance:

```bash
npx prisma db push
```

*Note: No seeding is required. The first user to sign up will automatically be granted Admin privileges.*

### 6. Run the Application

Start the Next.js development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment

### Frontend (Next.js)
The easiest way to deploy the frontend is on **Vercel**:
1. Push your code to GitHub/GitLab.
2. Import the project in Vercel.
3. Configure the environment variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, etc.) in the Vercel dashboard.

### Backend Services (Database)
Since this project relies on PostgreSQL, you need a VPS (Virtual Private Server) or a cloud provider that supports Docker containers.

**Recommended Setup (VPS like DigitalOcean/Hetzner/AWS EC2):**
1. Provision a server with Docker installed.
2. Clone this repo or copy `docker-compose.yml` to the server.
3. Run `docker-compose up -d`.
4. Ensure your server's firewall allows traffic to the necessary ports.
5. Update your Vercel `DATABASE_URL` to point to your VPS IP/domain.

## Project Structure

- `/app` - Next.js App Router pages and layouts
- `/components` - Reusable UI components (Shadcn/UI)
- `/lib` - Utility functions and configurations
- `/prisma` - Database schema and seed scripts
- `/types` - TypeScript type definitions
