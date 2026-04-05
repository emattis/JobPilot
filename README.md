# JobPilot

An AI-powered job search command center. Analyze job postings against your background, score fit, optimize your resume, discover relevant jobs, and track every application.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui**
- **Prisma 5** + **PostgreSQL** (Neon)
- **Anthropic Claude API** for all AI analysis
- **pdf-parse** for resume text extraction

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` (or create `.env`) and fill in:

```env
APP_PASSWORD=your-secure-password
SESSION_SECRET=random-32-char-string

DATABASE_URL=postgresql://user:pass@host:5432/jobpilot?sslmode=require

ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Run database migrations

```bash
npm run db:migrate -- --name init
```

### 4. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your `APP_PASSWORD`.

## Features

| Phase | Status | Description |
|-------|--------|-------------|
| Foundation | ✅ Done | Auth gate, layout, sidebar navigation |
| Profile | ✅ Done | User profile with skills, preferences, target roles |
| Resume | ✅ Done | PDF upload, text extraction, version management |
| Job Analysis | 🔜 Next | Paste a URL → AI fit score, skill gap, resume tips |
| Job Discovery | 🔜 Planned | Scraped job feed ranked by AI relevance |
| App Tracker | 🔜 Planned | Kanban pipeline, status history, follow-up reminders |
| Resume Optimizer | 🔜 Planned | AI-tailored resume with diff view |
| Metrics | 🔜 Planned | Funnel charts, response rates, skill gap analysis |

## Project Structure

```
src/
├── app/
│   ├── (app)/             # Auth-protected app shell (sidebar layout)
│   │   ├── page.tsx       # Dashboard
│   │   ├── analyze/       # Job analysis
│   │   ├── discover/      # Job discovery feed
│   │   ├── tracker/       # Application tracker
│   │   ├── resume/        # Resume manager
│   │   ├── metrics/       # Analytics
│   │   └── profile/       # User profile
│   ├── login/             # Password login
│   └── api/               # API routes
├── components/
│   ├── layout/            # Sidebar, nav
│   └── ui/                # shadcn/ui primitives
├── lib/
│   ├── db.ts              # Prisma client singleton
│   └── auth.ts            # Session helpers
└── middleware.ts           # Auth gate
```

## Useful Scripts

```bash
npm run dev          # Start dev server
npm run build        # Production build (runs migrations)
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm run db:generate  # Regenerate Prisma client
```

## Deployment

### Railway (recommended)
1. Add a PostgreSQL plugin
2. Set env vars in the Railway dashboard
3. Deploy — `postbuild` runs `prisma migrate deploy` automatically

### Vercel
1. Use Neon or Supabase for PostgreSQL
2. Set env vars in the Vercel dashboard
3. Note: use cheerio-only scraping (no Puppeteer in serverless)
