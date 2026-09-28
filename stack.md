# SyllabusOS — Tech Stack (Team Crazy Coders)

**Principle:** one language (TypeScript), one app (Next.js), one database (Postgres), one LLM provider. Every extra service is another thing that can break during the live demo.

---

## 1. Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language front to back; shared Zod schemas between AI output, API and UI. |
| Runtime | **Node.js 22 LTS** | Current LTS, matches Vercel runtime. |
| Package manager | **pnpm** | Fast, strict, lockfile-friendly. |
| Framework | **Next.js (latest stable, App Router)** | UI + API routes + server actions in one deployable. |
| UI | **Tailwind CSS + shadcn/ui** | Fast, clean, consistent components we own the source of. |
| Icons | **lucide-react** | Ships with shadcn. |
| Concept graph | **React Flow (@xyflow/react) + dagre** | Proper node/edge graph with auto-layout; Recharts cannot do graphs. |
| Charts | **Recharts** | Mastery trend, weightage bars. |
| Forms | **react-hook-form + Zod** | Typed validation reused on the server. |
| Client data | **Server Components + server actions**, **TanStack Query** only where polling is needed (upload status) | Avoid a separate state layer. |
| Auth | **Auth.js (NextAuth v5)** with Google OAuth + **guest demo login** | Free, no vendor lock; guest login lets judges skip sign-up. |
| Database | **PostgreSQL on Neon** | Serverless Postgres, free tier, branching for preview deploys. |
| Vector search | **pgvector** (in the same Neon DB) | No separate vector DB. HNSW index on `vector(768)`. |
| ORM | **Prisma** | Team already familiar. Vector column via `Unsupported("vector(768)")`, similarity queries via `$queryRaw`. |
| File storage | **Vercel Blob** | Syllabus / notes / PYQ PDFs. One env var, same platform. |
| AI SDK | **Vercel AI SDK (`ai` + `@ai-sdk/google`)** | `generateObject` with Zod for structured output, `streamText` for tutor streaming. |
| LLM | **Gemini Flash-tier model** for extraction, questions, tutor; **Pro-tier** only for the question verify pass if needed | Fast, cheap, native PDF input, good structured output. |
| Embeddings | **Gemini embedding model**, output dimensionality **768** | Same provider, fits pgvector HNSW limits. |
| PDF handling | Syllabus/PYQ → **sent to Gemini directly as PDF** (handles scans/tables); Notes → **unpdf** text extraction per page for RAG chunks | Avoids building OCR; keeps page numbers for citations. |
| Validation | **Zod** | Single source of truth for every AI response shape. |
| Rate limiting (P1) | **Upstash Ratelimit** | Protects our API key on a public demo URL. |
| Unit tests | **Vitest** | Mastery model, priority engine, planner are pure functions — test them hard. |
| E2E test | **Playwright** (1 happy-path test) | Guest login → Study Now → session → mastery changes. |
| Lint / format | **ESLint + Prettier** | Standard, works with Next.js out of the box. |
| CI | **GitHub Actions** | lint → typecheck → vitest on every PR. |
| Hosting | **Vercel** (app) + **Neon** (DB) | Preview deploy per PR; zero infra work. |
| Error monitoring (optional) | **Sentry** free tier | Catch demo-day crashes. |

> **Model IDs:** check the current model names and free-tier rate limits in Google AI Studio before writing code, and keep them in env vars — never hard-code.

---

## 2. What we deliberately did NOT pick

| Rejected | Reason |
|---|---|
| LiveKit / WebRTC audio rooms | Real-time audio + AI turn-taking is the most fragile thing we could demo. Cut from Round 1. |
| Pusher / Socket.io | No multiplayer feature in MVP → no real-time sync needed. |
| Separate FastAPI / Express backend | Two deployables, CORS, duplicated types. Next.js route handlers are enough. |
| LangChain / LlamaIndex | Heavy abstraction for what is 4 prompts and 1 retrieval query. AI SDK + Zod is enough. |
| Pinecone / Qdrant / Chroma | pgvector in the same DB does the job at our scale. |
| MongoDB | Our data is relational (concepts, edges, attempts). |
| Clerk | Faster setup, but vendor lock and guest-mode is clunkier; Auth.js + a guest credentials provider is simple enough. |
| Docker / microservices | Nothing to containerise on Vercel. Revisit only if offline venue has no internet access to Vercel. |

---

## 3. Architecture

```text
Browser (Next.js client: React Flow graph, dashboard, tutor chat)
   │
   ▼
Next.js on Vercel
   ├── Server actions / route handlers
   │     ├── /api/upload        → Vercel Blob → Resource(status)
   │     ├── /api/parse         → Gemini (PDF in) → Zod → Concepts + Edges
   │     ├── /api/pyq           → Gemini → question→concept map → weightage
   │     ├── /api/diagnostic    → Gemini generate + verify → Questions
   │     ├── /api/attempt       → mastery.update()  (pure TS)
   │     ├── /api/next          → priority.rank() + reason template (pure TS)
   │     ├── /api/plan          → planner.build()   (pure TS)
   │     └── /api/tutor         → retrieve(pgvector) → Gemini stream → Zod turn → mastery.update()
   │
   ├── lib/engine/   mastery.ts · priority.ts · planner.ts   ← no LLM, fully unit-tested
   └── lib/ai/       prompts, Zod schemas, provider config
   │
   ▼
Neon Postgres (+ pgvector)          Vercel Blob (PDFs)          Gemini API
```

---

## 4. Repo structure

```text
syllabusos/
├── app/
│   ├── (auth)/login/
│   ├── (app)/dashboard/
│   ├── (app)/goal/new/
│   ├── (app)/learn/[conceptId]/
│   └── api/…
├── components/
│   ├── ui/                 # shadcn
│   ├── concept-graph/
│   ├── study-now/
│   └── tutor/
├── lib/
│   ├── engine/             # mastery.ts, priority.ts, planner.ts (+ *.test.ts)
│   ├── ai/                 # prompts/, schemas.ts, client.ts
│   ├── rag/                # chunk.ts, embed.ts, retrieve.ts
│   └── db.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts             # demo DBMS goal + history (labelled demo data)
├── e2e/
├── .github/workflows/ci.yml
├── .env.example
└── README.md
```

---

## 5. Environment variables

```bash
DATABASE_URL=              # Neon pooled connection
DIRECT_URL=                # Neon direct connection (Prisma migrations)
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
GOOGLE_GENERATIVE_AI_API_KEY=
GEMINI_MODEL_FAST=         # flash-tier model id
GEMINI_MODEL_STRONG=       # pro-tier model id (verify pass)
GEMINI_EMBED_MODEL=
BLOB_READ_WRITE_TOKEN=
UPSTASH_REDIS_REST_URL=    # P1
UPSTASH_REDIS_REST_TOKEN=  # P1
SENTRY_DSN=                # optional
```

`.env.example` committed, `.env.local` never committed.

---

## 6. Setup checklist (day 1)

1. `pnpm create next-app` (TS, Tailwind, App Router, ESLint) → `pnpm dlx shadcn@latest init`.
2. Neon project → run `CREATE EXTENSION IF NOT EXISTS vector;` → Prisma init + first migration.
3. Auth.js with Google + guest credentials provider.
4. AI SDK + Gemini key → one working `generateObject` call with a Zod schema.
5. Vercel project linked to GitHub → preview deploys on.
6. GitHub Actions CI (lint, typecheck, vitest) → branch protection on `main`.
7. Seed script for the demo goal.

Nothing else starts until all seven are green.
