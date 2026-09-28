// `pnpm db:seed` (prisma.config.ts → "tsx prisma/seed.ts"): creates one demo guest with the
// seeded DBMS goal and prints a summary. Safe to run repeatedly — each run adds a new guest;
// guests older than GUEST_TTL_DAYS are pruned at the end.
import "./load-env";
import { db } from "@/lib/db";
import { createGuestUser, GUEST_TTL_DAYS, pruneExpiredGuests } from "@/lib/demo";
import { getRecommendation } from "@/lib/services/core";

async function main() {
  const started = Date.now();
  const user = await createGuestUser("demo");
  const seconds = ((Date.now() - started) / 1000).toFixed(2);

  const goal = await db.goal.findFirstOrThrow({
    where: { userId: user.id, isDemo: true },
    include: {
      _count: {
        select: { concepts: true, edges: true, questions: true, chunks: true, sessions: true, mistakes: true, masteryEvents: true },
      },
    },
  });
  const [bySource, attempts, rec, pruned] = await Promise.all([
    db.question.groupBy({ by: ["source"], where: { goalId: goal.id }, _count: { _all: true } }),
    db.attempt.count({ where: { userId: user.id } }),
    getRecommendation(goal),
    pruneExpiredGuests(),
  ]);

  const c = goal._count;
  const sources = bySource.map((s) => `${s.source} ${s._count._all}`).join(", ");
  console.log(`Seeded demo guest in ${seconds}s`);
  console.log(`  user     ${user.email} (${user.id})`);
  console.log(`  goal     ${goal.subject} (${goal.id}), exam ${goal.examDate.toDateString()}, ${goal.minutesPerDay} min/day`);
  console.log(`  graph    ${c.concepts} concepts, ${c.edges} prerequisite edges, ${c.chunks} note chunks`);
  console.log(`  bank     ${c.questions} questions (${sources})`);
  console.log(`  history  ${c.sessions} sessions, ${attempts} attempts, ${c.mistakes} mistakes, ${c.masteryEvents} mastery events (demo)`);
  console.log(
    rec
      ? `  study now ${rec.conceptName} · ${rec.minutes} min — ${rec.reason}`
      : "  study now (none — everything mastered?)",
  );
  console.log(`  pruned   ${pruned} guest(s) older than ${GUEST_TTL_DAYS} days`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
