# JobPilot — AI-Powered Job Search Platform

## Project Overview

JobPilot is a personal AI-powered job search command center. It helps you analyze job postings against your background, score fit, optimize your resume, discover relevant jobs across multiple boards, and track every application with metrics and analytics.

This is a solo-user tool designed to be deployed on Railway or Vercel.

---

## Tech Stack

### Core
- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **Database**: PostgreSQL via Supabase (hosted) or Neon (serverless)
- **ORM**: Prisma
- **Auth**: Simple env-based password gate (middleware-protected, session cookie)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514) for all analysis
- **Deployment**: Railway (recommended for full-stack + DB) or Vercel + external DB

### Supporting Libraries
- `react-hook-form` + `zod` — form validation
- `recharts` — dashboard charts and metrics visualization
- `date-fns` — date formatting
- `cheerio` + `puppeteer-core` — web scraping (job postings, company pages)
- `react-markdown` — rendering AI-generated feedback
- `next-themes` — dark/light mode
- `lucide-react` — icons
- `@tanstack/react-table` — application tracker table
- `react-dropzone` — resume file upload
- `pdf-parse` — resume PDF text extraction

---

## Architecture

```
jobpilot/
├── prisma/
│   └── schema.prisma              # Database schema
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout, theme provider, auth gate
│   │   ├── page.tsx               # Dashboard home
│   │   ├── login/page.tsx         # Simple password login
│   │   ├── analyze/page.tsx       # Job analysis (paste URL → get scored)
│   │   ├── discover/page.tsx      # AI-curated job discovery feed
│   │   ├── tracker/page.tsx       # Application tracker + pipeline view
│   │   ├── resume/page.tsx        # Resume manager + optimization suggestions
│   │   ├── metrics/page.tsx       # Analytics dashboard
│   │   └── api/
│   │       ├── auth/route.ts
│   │       ├── analyze/route.ts
│   │       ├── scrape/route.ts
│   │       ├── discover/route.ts
│   │       ├── applications/route.ts
│   │       ├── resume/route.ts
│   │       └── metrics/route.ts
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── layout/                # Sidebar, nav, header
│   │   ├── analyze/               # Job analysis components
│   │   ├── discover/              # Job discovery feed components
│   │   ├── tracker/               # Pipeline board, table views
│   │   ├── resume/                # Resume editor, diff view
│   │   └── metrics/               # Charts, stat cards
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── client.ts          # Anthropic API client wrapper
│   │   │   ├── prompts.ts         # All AI prompt templates
│   │   │   ├── analyze-job.ts     # Job-fit scoring logic
│   │   │   ├── resume-optimize.ts # Resume improvement engine
│   │   │   └── discover-jobs.ts   # Job discovery + ranking
│   │   ├── scrapers/
│   │   │   ├── job-posting.ts     # Generic job posting scraper
│   │   │   ├── company-site.ts    # Company website scraper
│   │   │   ├── linkedin.ts        # LinkedIn Jobs scraper/API
│   │   │   ├── yc-careers.ts      # YC Work at a Startup scraper
│   │   │   ├── greenhouse.ts      # Greenhouse ATS scraper
│   │   │   ├── lever.ts           # Lever ATS scraper
│   │   │   └── indeed.ts          # Indeed scraper
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── auth.ts                # Auth utilities
│   │   └── utils.ts               # Shared helpers
│   ├── hooks/                     # Custom React hooks
│   └── types/                     # Shared TypeScript types
├── public/
├── .env.local                     # Environment variables
├── tailwind.config.ts
├── next.config.ts
└── package.json
```

---

## Database Schema (Prisma)

Design the schema with these models. Use Prisma with PostgreSQL.

### Models

```prisma
model UserProfile {
  id              String   @id @default(cuid())
  name            String
  email           String
  phone           String?
  location        String?
  linkedinUrl     String?
  portfolioUrl    String?
  githubUrl       String?
  summary         String?  @db.Text       // Professional summary
  skills          String[] // Array of skill strings
  yearsExperience Int?
  targetRoles     String[] // Desired job titles
  targetCompanies String[] // Dream companies
  minSalary       Int?
  maxSalary       Int?
  preferRemote    Boolean  @default(true)
  industries      String[] // Preferred industries
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  resumes         Resume[]
  experiences     Experience[]
  education       Education[]
  applications    Application[]
}

model Resume {
  id           String   @id @default(cuid())
  userId       String
  user         UserProfile @relation(fields: [userId], references: [id])
  name         String      // e.g. "Software Engineer Resume v3"
  rawText      String   @db.Text  // Extracted plain text
  fileUrl      String?  // Stored file path
  isDefault    Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  applications Application[]
}

model Experience {
  id          String   @id @default(cuid())
  userId      String
  user        UserProfile @relation(fields: [userId], references: [id])
  company     String
  title       String
  startDate   DateTime
  endDate     DateTime?
  current     Boolean  @default(false)
  description String?  @db.Text
  skills      String[]
}

model Education {
  id          String   @id @default(cuid())
  userId      String
  user        UserProfile @relation(fields: [userId], references: [id])
  institution String
  degree      String
  field       String?
  startDate   DateTime?
  endDate     DateTime?
  gpa         Float?
}

model JobPosting {
  id              String   @id @default(cuid())
  url             String   @unique
  title           String
  company         String
  companyUrl      String?
  location        String?
  remote          Boolean?
  salaryMin       Int?
  salaryMax       Int?
  description     String   @db.Text
  requirements    String?  @db.Text
  niceToHaves     String?  @db.Text
  skills          String[]
  experienceLevel String?  // junior, mid, senior, lead, etc.
  source          String   // linkedin, yc, greenhouse, lever, manual, etc.
  postedAt        DateTime?
  scrapedAt       DateTime @default(now())
  expiresAt       DateTime?

  analyses        JobAnalysis[]
  applications    Application[]
}

model JobAnalysis {
  id                String   @id @default(cuid())
  jobId             String
  job               JobPosting @relation(fields: [jobId], references: [id])
  resumeId          String?

  // Scores (0-100)
  overallFitScore       Int      // Weighted composite
  skillMatchScore       Int      // Hard skill overlap
  experienceMatchScore  Int      // Years + seniority alignment
  cultureFitScore       Int      // Values, mission, company type
  growthPotentialScore  Int      // Career trajectory alignment

  // AI verdicts
  shouldApply           Boolean
  confidenceLevel       String   // high, medium, low
  reasoning             String   @db.Text  // Why or why not

  // Detailed breakdowns
  matchingSkills        String[] // Skills you have that match
  missingSkills         String[] // Skills you lack
  transferableSkills    String[] // Adjacent skills that help
  resumeImprovements    String   @db.Text  // Specific suggestions in markdown
  coverLetterTips       String?  @db.Text  // Tailored cover letter advice
  interviewPrepTopics   String[] // What to study if you apply

  // Company insights
  companyAnalysis       String?  @db.Text  // AI summary of company from website

  createdAt             DateTime @default(now())
}

model Application {
  id            String   @id @default(cuid())
  userId        String
  user          UserProfile @relation(fields: [userId], references: [id])
  jobId         String
  job           JobPosting @relation(fields: [jobId], references: [id])
  resumeId      String?
  resume        Resume?  @relation(fields: [resumeId], references: [id])

  status        ApplicationStatus @default(BOOKMARKED)
  appliedAt     DateTime?
  responseAt    DateTime?
  interviewAt   DateTime?
  notes         String?  @db.Text
  followUpDate  DateTime?

  // Outcome tracking
  rejectedAt    DateTime?
  offeredAt     DateTime?
  offerAmount   Int?
  accepted      Boolean?

  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  statusHistory StatusChange[]
}

model StatusChange {
  id            String   @id @default(cuid())
  applicationId String
  application   Application @relation(fields: [applicationId], references: [id])
  fromStatus    ApplicationStatus
  toStatus      ApplicationStatus
  changedAt     DateTime @default(now())
  note          String?
}

enum ApplicationStatus {
  BOOKMARKED
  ANALYZING
  READY_TO_APPLY
  APPLIED
  SCREENING
  PHONE_INTERVIEW
  TECHNICAL_INTERVIEW
  ONSITE_INTERVIEW
  FINAL_ROUND
  OFFER
  ACCEPTED
  REJECTED
  WITHDRAWN
  GHOSTED
}

model DiscoveredJob {
  id            String   @id @default(cuid())
  url           String   @unique
  title         String
  company       String
  source        String
  relevanceScore Int?    // AI-scored 0-100
  reasoning     String?  @db.Text
  dismissed     Boolean  @default(false)
  savedAt       DateTime @default(now())
}
```

---

## Core Features — Build in This Order

### Phase 1: Foundation
1. **Project scaffolding** — Next.js + Tailwind + shadcn/ui + Prisma + auth middleware
2. **Password gate** — Simple login with `APP_PASSWORD` env var, sets HTTP-only session cookie
3. **User profile setup** — Onboarding flow to capture background, skills, preferences
4. **Resume upload + parsing** — Upload PDF, extract text via `pdf-parse`, store in DB
5. **Sidebar navigation** — Persistent nav: Dashboard, Analyze, Discover, Tracker, Resume, Metrics

### Phase 2: Job Analysis Engine
6. **Job URL scraper** — Accept a job posting URL, scrape with cheerio/puppeteer, extract structured fields
7. **Company website scraper** — Scrape the company "About" page for context
8. **AI analysis pipeline** — Send job posting + company info + user profile + resume to Claude API. Return structured scores, verdict, and improvement suggestions
9. **Analysis results UI** — Beautiful results page with score cards, skill gap visualization, resume improvement checklist, and "Apply" action button

### Phase 3: Job Discovery
10. **Job board scrapers** — Build scrapers for LinkedIn Jobs, YC Work at a Startup (workatastartup.com), Greenhouse boards, Lever boards. Run on-demand or on a cron
11. **AI relevance scoring** — Batch-score discovered jobs against user profile
12. **Discovery feed UI** — Swipeable/scrollable feed of recommended jobs, sorted by fit score, with dismiss/save/analyze actions

### Phase 4: Application Tracker
13. **Application pipeline** — Kanban-style board with columns for each status
14. **Application table view** — Sortable, filterable table with all applications
15. **Status updates** — Drag-and-drop status changes, auto-log status history with timestamps
16. **Follow-up reminders** — Flag applications that haven't had status changes in X days
17. **Notes + timeline** — Per-application notes and activity timeline

### Phase 5: Resume Optimization
18. **Resume versions** — Manage multiple resume versions
19. **AI resume tailor** — Given a specific job posting, generate a tailored version of your resume with specific wording changes, reordered bullets, and keyword additions
20. **Diff view** — Show before/after changes highlighted
21. **Resume strength score** — Overall resume quality score with breakdown

### Phase 6: Metrics Dashboard
22. **Application stats** — Total applied, response rate, interview rate, offer rate
23. **Funnel visualization** — Application pipeline funnel chart
24. **Time-series charts** — Applications over time, responses over time
25. **Source effectiveness** — Which job boards yield the best response rates
26. **Skill gap analysis** — Aggregate most-requested skills you're missing across all analyzed jobs
27. **Weekly summary** — AI-generated weekly recap of search progress with recommendations

### Phase 7: Polish + Deploy
28. **Dark/light mode** — Full theme support
29. **Mobile responsive** — Works well on phone for quick status updates
30. **Loading states + error handling** — Skeleton loaders, toast notifications, retry logic
31. **Railway/Vercel deployment config** — Dockerfile or vercel.json, env vars, DB migration scripts

---

## AI Prompt Design

All AI interactions use Claude (claude-sonnet-4-20250514) via the Anthropic SDK. Store prompt templates in `src/lib/ai/prompts.ts`.

### Job Analysis Prompt Structure
```
System: You are an expert career advisor and technical recruiter. You analyze job postings against candidate profiles and provide brutally honest, actionable assessments.

User:
## Candidate Profile
{user profile: skills, experience, education, target roles, preferences}

## Current Resume
{resume text}

## Job Posting
{scraped job description, requirements, nice-to-haves}

## Company Information
{scraped company about page, mission, values, size, stage}

## Instructions
Analyze this job against the candidate profile. Return a JSON object with:
- overallFitScore (0-100)
- skillMatchScore (0-100)
- experienceMatchScore (0-100)
- cultureFitScore (0-100)
- growthPotentialScore (0-100)
- shouldApply (boolean)
- confidenceLevel ("high" | "medium" | "low")
- reasoning (2-3 paragraphs explaining your assessment)
- matchingSkills (array of matching skills)
- missingSkills (array of gaps)
- transferableSkills (array of adjacent skills that help)
- resumeImprovements (markdown with specific, actionable changes)
- coverLetterTips (key points to emphasize)
- interviewPrepTopics (what to study)
- companyAnalysis (brief company summary and culture read)

Be honest. If this is a reach, say so. If it's a perfect fit, say so.
Score interpretation: 80+ = strong match, 60-79 = worth applying, 40-59 = stretch, <40 = probably skip.
```

### Resume Optimization Prompt Structure
```
System: You are a resume optimization specialist. You tailor resumes to specific job postings while keeping the content truthful. You never fabricate experience.

User:
## Target Job
{job posting}

## Current Resume
{resume text}

## Instructions
Suggest specific changes to make this resume stronger for this role:
1. Reword bullet points to better match the job description keywords
2. Reorder sections/bullets to lead with most relevant experience
3. Suggest additions from the candidate's background that are currently missing
4. Flag anything to remove or de-emphasize
5. Provide the optimized resume text

CRITICAL: Never invent experience. Only reorganize, reword, and emphasize existing truth.
Return as JSON with: { changes: [{section, original, suggested, reason}], optimizedResume: string, strengthScore: number }
```

---

## Environment Variables

```env
# Auth
APP_PASSWORD=your-secure-password
SESSION_SECRET=random-32-char-string

# Database
DATABASE_URL=postgresql://user:pass@host:5432/jobpilot

# AI
ANTHROPIC_API_KEY=sk-ant-...

# Optional: for enhanced scraping
BROWSERLESS_API_KEY=           # For puppeteer cloud (if deployed)
PROXY_URL=                     # For scraping rate limits
```

---

## Design Direction

### Aesthetic: "Precision Command Center"
- **Theme**: Dark-first (with light mode toggle). Deep navy/charcoal backgrounds, sharp accent colors for scores (green=good, amber=okay, red=poor)
- **Typography**: `Geist` for body, `Geist Mono` for scores/data — clean, technical, modern
- **Layout**: Sidebar nav on left, content area with generous whitespace. Dense data views (tracker) alongside spacious analysis views
- **Visual language**: Score rings/gauges for fit scores, color-coded tags for skills, gradient progress bars for funnel metrics
- **Micro-interactions**: Smooth page transitions, score count-up animations, subtle hover states on cards
- **Cards**: Slight frosted-glass (backdrop-blur) effect on dark mode, clean borders on light mode

### Key UI Components
- **Score Ring**: Circular progress indicator with score number in center, color shifts based on value
- **Skill Tags**: Colored chips — green for matching, red for missing, blue for transferable
- **Pipeline Board**: Kanban columns with drag-and-drop cards showing company logo, role, and days-in-stage
- **Discovery Card**: Job card with company info, fit score badge, quick actions (analyze, save, dismiss)
- **Diff View**: Side-by-side or inline diff for resume changes with green/red highlighting

---

## Scraping Strategy

### Job Board Sources
1. **Manual URL** — User pastes any job URL. Use cheerio to extract. Handle common ATS patterns (Greenhouse, Lever, Workday, Ashby, BambooHR)
2. **LinkedIn Jobs** — Scrape LinkedIn job search results. Respect rate limits. Consider using the RSS feed or unofficial API endpoints. Fall back to manual if blocked
3. **YC Work at a Startup** — Scrape workatastartup.com/jobs. Filter by user preferences
4. **Greenhouse** — Scrape boards.greenhouse.io/{company}. Structured HTML, easy to parse
5. **Lever** — Scrape jobs.lever.co/{company}. Clean JSON API available at /opportunities
6. **Indeed** — Scrape with caution, aggressive anti-bot. Consider as lower priority

### Scraping Best Practices
- Cache scraped pages for 24 hours to avoid re-fetching
- Use random delays between requests (2-5 seconds)
- Rotate user-agent strings
- Store raw HTML alongside extracted data for debugging
- Fall back to asking user to paste job description text if scraping fails
- For deployed version, consider Browserless.io or similar for headless Chrome

---

## API Route Patterns

All API routes follow this pattern:
- Validate auth via session cookie middleware
- Parse and validate input with zod
- Perform scraping/AI/DB operations
- Return consistent JSON: `{ success: boolean, data?: T, error?: string }`
- Use streaming responses for AI analysis (show results as they generate)

### Key Routes
- `POST /api/analyze` — Accept job URL + optional company URL. Scrape → analyze → store → return results
- `GET /api/discover` — Trigger job discovery scan, return scored results
- `GET/POST/PATCH /api/applications` — CRUD for application tracking
- `POST /api/resume/optimize` — Accept job ID + resume ID, return tailored suggestions
- `GET /api/metrics` — Aggregate stats for dashboard

---

## Non-Obvious Features to Include

These are things you'd want in practice that might not be immediately obvious:

1. **Salary intelligence** — When scraping, extract salary ranges. Track across applications. Show market rate insights on the metrics page
2. **Ghost detector** — Auto-flag applications with no response after 14 days as "Ghosted" with option to send follow-up
3. **Application velocity** — Track how many apps per week you're sending, set targets
4. **Skill frequency analysis** — Across all analyzed jobs, which skills appear most? Shows where to invest learning time
5. **One-click apply prep** — When you decide to apply, generate a pre-filled checklist: tailored resume, cover letter talking points, referral check, company research notes
6. **Interview prep mode** — When status moves to interview, auto-generate prep materials: common questions for the role, company-specific talking points, your relevant experience highlights
7. **Weekly email digest** — Optional: send yourself a weekly summary of new discovered jobs, pending follow-ups, and pipeline stats
8. **Export** — Export application history to CSV for record-keeping
9. **Browser extension consideration** — Note: a future Chrome extension could add "Analyze with JobPilot" to any job posting page. Design the analyze API to support this
10. **ATS keyword checker** — Compare resume keywords against job posting keywords, show overlap percentage

---

## Coding Standards

- Use server components by default, client components only when needed (interactivity, hooks)
- Use server actions for mutations where appropriate
- All AI calls should stream responses to the UI using the Vercel AI SDK (`ai` package) or raw SSE
- Every scraper must have a fallback: if auto-scrape fails, show a textarea for manual paste
- All database queries go through Prisma, no raw SQL
- Use TypeScript strict mode, no `any` types
- Error boundaries on all pages
- Toast notifications for async operations (success/failure)
- Optimistic UI updates for status changes in the tracker
- Mobile-first responsive design

---

## Deployment

### Railway (Recommended)
- Add PostgreSQL plugin for database
- Set all env vars in Railway dashboard
- Prisma migrations run via `npx prisma migrate deploy` in build step
- Add to package.json scripts: `"postbuild": "prisma migrate deploy"`

### Vercel Alternative
- Use Neon or Supabase for PostgreSQL (Vercel doesn't include DB)
- Set env vars in Vercel dashboard
- Note: Puppeteer won't work in Vercel serverless — use Browserless.io or limit to cheerio-based scraping
- Cron jobs via Vercel Cron for scheduled discovery scans

---

## Development Workflow

1. Start with `npx create-next-app@latest jobpilot --typescript --tailwind --app --src-dir`
2. Install dependencies in logical groups
3. Set up Prisma schema and run initial migration
4. Build auth gate first (everything behind password)
5. Build profile + resume upload (need this data for everything else)
6. Build the analyze flow end-to-end (this is the core value prop)
7. Layer on discovery, tracker, resume optimization, metrics
8. Polish UI, add loading states, error handling
9. Deploy and test

---

## Testing Approach

- **Scraper tests**: Save sample HTML fixtures, test extractors against them
- **AI prompt tests**: Test with known job descriptions, verify output schema
- **E2E happy path**: Login → upload resume → analyze a job → save to tracker → update status
- Use Playwright for E2E if time permits
