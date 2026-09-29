# SyllabusOS

Upload your syllabus, notes and previous-year papers. SyllabusOS finds your weak concepts, decides what you should study next and why, then teaches it Socratically — and every answer you give updates the plan.

Built by Team Crazy Coders for Horizon by Hoollow (Round 1, theme: AI with Education). Product and design notes: [idea.md](idea.md), [stack.md](stack.md), [docs/](docs/).

## What it does

- **Syllabus → concept graph.** A PDF or pasted syllabus becomes 20–40 concepts in units with prerequisite edges. The student edits it before confirming.
- **Real exam weightage.** Previous-year papers are mapped question by question to concepts; marks become each concept's share of the exam. Without papers the weightage is an estimate and is labelled as one.
- **Adaptive diagnostic.** Up to 10 questions: a miss probes a prerequisite, a hit probes what the concept unlocks. Unit-level answers set low-confidence estimates for the rest of the unit.
- **Study Now + daily plan.** A deterministic, unit-tested engine (`lib/engine`) ranks concepts by weightage, mastery gap, unlocks, mistakes and forgetting, gates on weak prerequisites, and switches between learn / revision / triage modes by deadline. Every recommendation carries a reason built from the score.
- **Socratic tutor.** Probe → hint → stronger hint → worked step → check, grounded in the student's own notes with page citations. The model grades each reply; code decides the next stage.
- **Mistake log.** Every wrong answer with its misconception; recurring misconceptions raise that concept's priority. Explain My Mistake gives the reasoning and a retry question.
- **Revision mode, Hinglish, offline mode.** "I have 90 minutes before the exam" → a ranked revision sequence. Tutor replies in Hinglish on request. Without a Gemini key the whole loop still runs (heuristic parser, built-in DBMS question bank, keyword retrieval, rule-based tutor).

## Architecture

One Next.js 16 app (App Router, Server Components + Server Actions), one Postgres database with pgvector, one LLM provider.

```
app/            routes (pages) and app/actions (server actions: zod-validated, ownership-checked, rate-limited)
lib/engine/     mastery, priority, planner, revision, grading — pure TypeScript, no DB/LLM/clock
lib/tutor/      hint-ladder state machine
lib/services/   onboarding, diagnostic, learn, mistakes, dashboard (DB + engine + AI)
lib/ai/         Gemini via Vercel AI SDK, Zod schemas, prompt-injection guard, offline fallbacks
lib/rag/        PDF pages → chunks → embeddings (pgvector) → retrieval with keyword fallback
lib/demo/       DBMS question bank, tutor scripts, seeded demo account
components/     UI (Tailwind 4 + shadcn/ui, NThing design system in app/globals.css)
prisma/         schema, migrations, seed
```

## Run locally

Requirements: Node 22, pnpm, Docker.

```bash
docker compose up -d                 # Postgres 17 + pgvector on localhost:5433
cp .env.example .env                 # then set AUTH_SECRET (npx auth secret)
pnpm install
pnpm db:migrate                      # prisma migrate deploy
pnpm db:seed                         # optional: one demo account
pnpm dev                             # http://localhost:3000
```

`.env.local` overrides `.env` for both Next.js and the Prisma CLI (`prisma.config.ts`, `prisma/load-env.ts`). Put the local Docker URLs there if `.env` points at a hosted database.

### Environment

| Variable | Needed | Notes |
|---|---|---|
| `DATABASE_URL`, `DIRECT_URL` | yes | Pooled and direct Postgres URLs (Neon: `DIRECT_URL` is the host **without** `-pooler`). |
| `AUTH_SECRET` | yes | `npx auth secret` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | no | Google sign-in appears only when both are set. Redirect URI: `<origin>/api/auth/callback/google`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | no | Without it the app runs in offline mode. |
| `GEMINI_MODEL_FAST`, `GEMINI_MODEL_STRONG`, `GEMINI_MODEL_FALLBACK`, `GEMINI_EMBED_MODEL` | no | Model ids; `GEMINI_MODEL_FALLBACK` may be a comma-separated list. |
| `BLOB_READ_WRITE_TOKEN` | no | PDFs up to 20 MB (instead of 4 MB) upload from the browser straight to a **private** Vercel Blob store and the originals are kept there. Larger PDFs are read on the device either way. |
| `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_CERT_FINGERPRINTS` | no | Serve `/.well-known/assetlinks.json` for the Android app. |

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | ESLint, `tsc`, Vitest (engine, AI guard, offline tutor, RAG, demo bank) |
| `pnpm db:migrate` / `pnpm db:seed` / `pnpm db:reset` | Prisma |

CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests on every push and pull request, then migrates, seeds and builds against a pgvector service container.

## Security

- Every server action validates input with zod and checks ownership (`requireGoal` / user-scoped queries); pages run their own guards.
- Postgres-backed rate limits (`lib/rate-limit.ts`): guest sign-up per IP and globally (inside the Auth.js `authorize`, so both entry points are covered), AI-heavy actions per user, and a daily deployment-wide AI budget that falls back to offline mode.
- Untrusted text (syllabus, papers, notes, student messages) reaches the model only inside nonce-tagged data blocks; model output is schema-validated and never trusted for ids, ladder stages or citations.
- Uploads: PDF files up to 20 MB with Vercel Blob (browser → Blob with a short-lived token pinned to the goal's folder, PDF type and size) or 4 MB without; larger PDFs are read on the device with PDF.js and only their page text is sent (300 pages / 400,000 characters, re-checked on the server). PDF magic bytes (not the browser's MIME type), text length caps, sanitised file names, notes-per-goal and goals-per-user limits.
- CSP and security headers in `next.config.ts`; `poweredByHeader` off.
- Raw SQL only through Prisma tagged templates; every retrieval query is scoped to the goal.
- Guest accounts expire after 7 days. Secrets live only in `.env*` files, which are git-ignored.

## Notes

- `prisma migrate dev` always generates `DROP INDEX "Chunk_embedding_hnsw_idx"` because the HNSW index can't be expressed in the Prisma schema. Delete that line from each new migration.
- **Deploy:** step-by-step guide for Vercel + Neon in [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).
- **Android app:** the site is an installable PWA; build the APK (Trusted Web Activity) and share it with Firebase App Distribution using [docs/ANDROID.md](docs/ANDROID.md).
