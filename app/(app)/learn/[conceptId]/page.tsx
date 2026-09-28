import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LearnView } from "@/components/session/learn-view";
import { getLearnPageData } from "@/lib/services/learn";
import { requireUser } from "@/lib/session";

// AI calls (with model fallback) run in this route and its server actions; Vercel default is lower.
export const maxDuration = 60;

export const metadata: Metadata = { title: "Study session" };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async function LearnPage({ params, searchParams }: PageProps<"/learn/[conceptId]">) {
  const [{ conceptId }, sp] = await Promise.all([params, searchParams]);
  if (!ID.test(conceptId)) notFound();
  const session = typeof sp.session === "string" && ID.test(sp.session) ? sp.session : null;

  const user = await requireUser();
  // Scoped by user: another student's concept or session id is a 404.
  const data = await getLearnPageData(user.id, conceptId, session);
  return <LearnView initial={data} />;
}
