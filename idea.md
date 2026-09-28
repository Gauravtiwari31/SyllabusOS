# SyllabusOS — Team Crazy Coders

**Horizon by Hoollow · Round 1 (Online MVP) · Theme: AI with Education**
**Categories:** Education · Student Life · Productivity

> **Tagline:** Knows what you don't know. Teaches it without doing it for you.

> **One-liner:** Upload your syllabus, notes and previous-year papers. SyllabusOS finds your weak concepts, decides what you should study next and *why*, then teaches it Socratically — and every answer you give updates the plan.

---

## 1. Problem

Students are not short of content. They are short of **decisions** and **real understanding**.

1. **No prioritisation.** A syllabus lists 30+ topics with no order, no weightage, no link to the student's deadline or free time. Students default to "start from Unit 1" and run out of time.
2. **No self-knowledge.** Students can't tell what they know from what they've *read*. The gap shows up in the exam hall.
3. **Static plans die on day 2.** Miss one session and a fixed timetable becomes a backlog.
4. **AI makes it worse.** General chatbots are answer engines: paste question → copy answer → feel competent → fail the offline exam. "Study modes" in mainstream chatbots help, but they don't know your syllabus, your exam date, your weak topics or your past mistakes.

**Core insight:** The gap is not information. It is *execution* — knowing what to do next, and actually learning it instead of copying it.

---

## 2. Solution — one closed loop

```text
Syllabus + Notes + PYQs
        ↓
   Concept Graph  (editable by student)
        ↓
   Diagnostic  →  Mastery per concept
        ↓
   Priority Engine  →  "Study THIS now, because…"
        ↓
   Socratic Session (grounded in your notes)
        ↓
   Every answer = evidence → Mastery updates → Plan re-ranks
        ↑___________________________________________|
```

The product is the loop. Every AI interaction must produce a **visible change in the student's learning state**.

---

## 3. What makes it different (three USPs, not seven)

### USP 1 — The decision engine is code, not vibes
The LLM **does not** decide what you study. A deterministic, unit-tested priority engine does, using mastery, exam weightage, prerequisite unlocks, mistakes and time left. Every recommendation ships with a human-readable reason built from the actual score components. No hallucinated advice, fully explainable, defensible in front of judges.

### USP 2 — Socratic by default, but every exchange is measured
Pure "never give the answer" tutors frustrate students and get abandoned. SyllabusOS uses a **hint ladder** (probe → hint → stronger hint → worked step → check question). Each student reply is graded into structured evidence (correct / partial / wrong + misconception), which feeds the mastery model. Learning *is* the assessment.

### USP 3 — Weightage from real previous-year papers
Upload 2–3 years of PYQs and SyllabusOS maps every question to a concept and computes **actual marks-weightage per topic** for *your* university's exam. No PYQs? It falls back to an LLM estimate, clearly labelled "estimated". This is the feature Indian students will immediately get.

---

## 4. Round 1 MVP — P0 (must work end-to-end)

| # | Feature | Acceptance criteria |
|---|---|---|
| 1 | **Goal setup** | Subject, exam date, minutes/day. One screen. |
| 2 | **Syllabus → Concept Graph** | Upload PDF or paste text → 20–40 concepts in units with prerequisite edges, in < 30 s. Student can rename / delete / add concepts before confirming (fixes bad extraction). |
| 3 | **PYQ weightage** (optional input) | Upload PYQ PDF → each question mapped to a concept → weightage bar per topic. Missing → "estimated" badge. |
| 4 | **Adaptive diagnostic** | ≤ 10 MCQ/numeric questions, prioritising high-weightage and prerequisite-root concepts. Graph recolours red/amber/green on completion. |
| 5 | **Study Now + Today's Plan** | One button → one concept + duration + reason. Daily plan fills available minutes. Changing minutes/day or skipping a day re-plans instantly. |
| 6 | **Socratic Learn session** | Grounded in uploaded notes, with page citations. Hint ladder. Ends with 2–3 check questions. Mastery before → after shown. |
| 7 | **Mistake log** | Every wrong answer stored with concept + misconception. Recurring misconceptions raise that concept's priority. |
| 8 | **Dashboard** | Concept graph (coloured), today's plan, weakest 3 topics, mastery trend. |
| 9 | **Guest demo login** | Judges click "Try demo" → seeded account, no sign-up. |

### P1 — add only after P0 is stable
- **Revision Mode:** "I have 90 min before the exam" → highest-value revision sequence (weak × high-weightage × decayed).
- **Spaced-repetition decay:** mastery fades over time without practice; drives revision.
- **Explain My Mistake:** why wrong → correct reasoning → similar retry question.
- **Hinglish toggle:** explanations in Hinglish, technical terms kept in English. Cheap to build, strong with Indian judges.
- **Triage Mode:** when remaining time < total estimated cost, explicitly drop low-weightage topics and say so.

### P2 — roadmap / offline round candidates
- Voice Socratic mode (browser speech APIs).
- Study room with shared progress (accountability, no private data).
- Teacher/class heatmap: where a class is stuck, not just final grades.
- Placement mode: job description → skills graph → same loop.

### Explicitly cut from Round 1
Real-time audio rooms (LiveKit/WebRTC), keystroke-tracking IDE, live multiplayer sync, "Exam Readiness %" composite score, native mobile, payments, notifications, social features. Each one either adds fragile real-time infra or makes a claim we can't back with data.

---

## 5. Core engines (how it actually works)

### 5.1 Mastery model (Elo-lite, per concept)
- Each concept holds a skill value `θ` (displayed as 0–100 % via sigmoid) and an evidence count `n`.
- Each question has a difficulty `d`. Expected correctness `p = σ(θ − d)`.
- Update after an attempt: `θ ← θ + K · (outcome − p)`, where `outcome ∈ {1, 0.5, 0}` and `K` shrinks as `n` grows.
- Evidence weight: quiz answer = 1.0, Socratic reply = 0.5 (LLM-graded, so trusted less).
- Parent/unit mastery = weightage-weighted average of children.
- **Confidence** shown alongside mastery (`n` small → greyed/dashed node). We never present a 1-question guess as fact.
- Diagnostic answers on a unit-level question set a low-confidence *prior* for all children — this is how 10 questions cover 30+ concepts honestly.

### 5.2 Priority engine (deterministic, pure function)
```text
value(c) = 0.30·Weightage + 0.30·Gap + 0.20·Unlock + 0.10·MistakeRate + 0.10·Decay
priority(c) = value(c) / sqrt(estMinutes(c))
```
- All inputs normalised 0–1. `Gap = 1 − mastery`. `Unlock` = number of downstream concepts this unblocks.
- **Prerequisite gating:** if a prerequisite of `c` is below 50 % mastery, recommend the prerequisite instead ("Blocked by Functional Dependency").
- **Deadline does not multiply every topic** (that would not change the ranking). Instead it sets the **mode**: far from exam → learn new concepts; close → revision; not enough time → triage.
- The reason string is templated from the top two score components. No LLM involved.
- Weights are constants in one file, unit-tested, tunable.

### 5.3 Planner
Greedy fill of today's available minutes from the priority list, with a 15-min practice block and a 10-min revision block reserved. Re-runs on: session completed, day skipped, minutes/day changed, mastery changed.

### 5.4 Socratic tutor contract
Every tutor turn returns structured JSON (validated with a schema):
```json
{
  "message": "string shown to student",
  "stage": "probe | hint1 | hint2 | worked_step | check",
  "evaluation": "correct | partial | wrong | not_applicable",
  "misconception": "string | null",
  "conceptId": "string",
  "sources": [{ "file": "DBMS_Unit2.pdf", "page": 7 }]
}
```
Rules: never output the final answer before `worked_step`; move one stage up after two failed replies; if the notes don't cover it, say "Not found in your notes" and answer from general knowledge with a visible label.

### 5.5 Grounding (RAG)
Notes PDF → text → chunks (~800 tokens, with page numbers) → embeddings in Postgres (pgvector) → top-k retrieval filtered by concept → cited in the tutor response.

---

## 6. Data model

```text
User            id, name, email, isGuest
Goal            id, userId, subject, examDate, minutesPerDay, mode
Concept         id, goalId, name, unit, parentId, weightage, weightageSource(pyq|estimated), estMinutes
ConceptEdge     fromConceptId, toConceptId            -- prerequisite
Mastery         conceptId, theta, evidenceCount, lastPracticedAt
Question        id, conceptId, type(mcq|numeric|short), body, options, answer, difficulty, source(diagnostic|practice|pyq)
Attempt         id, questionId, userId, response, outcome, misconception, createdAt
Session         id, conceptId, plannedMin, actualMin, masteryBefore, masteryAfter, createdAt
TutorTurn       id, sessionId, role, content, stage, evaluation
Resource        id, goalId, kind(syllabus|notes|pyq), blobUrl, status
Chunk           id, resourceId, conceptId?, page, text, embedding vector(768)
```

---

## 7. Demo script (2:30 video)

| Time | Scene | What judges see |
|---|---|---|
| 0:00 | Hook | "Every student has a syllabus, a deadline, and ChatGPT that will do their homework for them. None of that makes them pass." |
| 0:15 | Upload | Real DBMS syllabus + 3 years of PYQs → concept graph builds live, weightage bars appear. |
| 0:40 | Diagnose | 5 quick questions → graph turns red/amber/green. |
| 1:00 | **Money shot** | Click **Study Now** → "Conflict Serializability · 25 min · High exam weightage (18 % of PYQ marks) and it unlocks Recoverability." |
| 1:20 | Socratic | Student asks for the answer → tutor asks a guiding question instead, cites Unit 2 page 7. Student gets it wrong → misconception logged → hint. |
| 1:50 | Adapt | Mastery 42 % → 61 %. Change minutes/day 90 → 45 → plan compresses, low-weightage topic dropped with a reason. |
| 2:10 | Close | Revision Mode (if P1 shipped) or dashboard trend. "Not another chatbot. The decision layer between a student and everything they need to learn." |

Rule: real product, real syllabus. Seeded history is labelled as demo data. No fake "improved exam scores" claims.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM extracts a wrong/messy topic list | Student edits before confirming; schema-validated output; retry once on invalid JSON. |
| Generated MCQ has a wrong answer key | Second "verify" pass on each question; drop disagreements. |
| Mastery looks arbitrary | Show confidence; show the score breakdown behind every recommendation. |
| API rate limits / slow responses during demo | Cache generated diagnostics and parsed syllabi; seeded guest account; streaming UI with progress states. |
| Large PDF processing times out | Process per-page with progress, cap MVP upload size, background status field on Resource. |
| Scope creep | P0 table is the contract. Nothing from P1 starts until all P0 rows pass on the deployed build. |
| Tutor hallucination | Retrieval-first, citations required, explicit "not in your notes" label. |

---

## 9. Mapping to Horizon judging

| Criterion | Our answer |
|---|---|
| **Innovation** | Deterministic explainable priority engine + Socratic tutor whose replies are measured evidence + PYQ-derived weightage. |
| **Core functionality** | Full loop works end-to-end on a real syllabus: upload → diagnose → recommend → learn → re-plan. |
| **Feasibility** | Standard web stack, one LLM provider, Postgres. No real-time infra. Core engine is pure functions with tests. |
| **Problem understanding** | Targets the two actual failure modes: not knowing what to study, and "learning" by copying AI answers. |
| **Execution** | Deployed live demo, guest login, CI with tests, clean PR history, polished 2:30 video. |

---

## 10. Offline round (24 h, Delhi)

Assume we extend the Round 1 codebase, and adapt if a new problem statement is given on-site. Pick at most two:
1. **Voice Socratic mode** — speak your reasoning, tutor responds by voice (browser speech APIs, no WebRTC server).
2. **Class heatmap for teachers** — aggregate misconceptions across a class.
3. **Revision + spaced repetition**, if not done in Round 1.
4. **Hinglish / regional language** explanations, if not done in Round 1.

Hours 0–2 plan and branch; 2–16 build; 16–20 integrate and test on deployed build; 20–22 seed demo + record; 22–24 buffer and pitch rehearsal. Feature freeze at hour 18, no exceptions.

---

## 11. Team roles and workflow

| Lane | Owns |
|---|---|
| **AI pipelines** | Syllabus/PYQ extraction, question generation + verify pass, tutor prompt + schema, RAG. |
| **Core engine + backend** | DB schema, mastery model, priority engine, planner, API routes, tests. |
| **Frontend + product** | Concept graph, Study Now, Learn session UI, dashboard, loading/empty/error states. |
| **Integration + demo** | Deploy, CI, seed data, end-to-end checks, video, README, submission copy. |

Fewer than four people → merge lanes, never expand scope.

**Workflow (this is also our SDLC story for judges):** GitHub Projects board with issues per P0 row · feature branches + PRs, one reviewer · protected `main` · CI runs lint, typecheck, tests on every PR · preview deploy per PR · README with architecture diagram and setup steps.

---

## 12. Submission copy

**50 words:**
SyllabusOS turns a student's syllabus, notes and previous-year papers into an adaptive learning loop. It diagnoses concept-level weaknesses, uses an explainable engine to decide what to study next, and teaches through a grounded Socratic tutor that refuses to just hand over answers. Every reply updates mastery and re-plans the day.

**One line for judges:**
We don't answer students' questions — we decide the next best thing for them to learn, explain why, and make sure they actually learn it.
