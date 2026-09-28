// The dashboard widget grid (P0 #8). Server-rendered; interactive tiles are client islands.
import Link from "next/link";
import { History } from "lucide-react";
import type { DashboardData } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/nu";
import { StudyNowTile } from "@/components/study-now/study-now-tile";
import { ModeTile } from "@/components/plan/mode-tile";
import { formatExamDate, plural } from "@/components/plan/format";
import { DemoBanner } from "./demo-banner";
import { DaysLeftTile, MasteryStatTile, MistakesTile, SessionsTile } from "./stat-tiles";
import { TodayPlanTile } from "./today-plan-tile";
import { WeakestTile } from "./weakest-tile";
import { GraphTile } from "./graph-tile";
import { MasteryTrendTile } from "./mastery-trend-tile";

export function DashboardView({ data }: { data: DashboardData }) {
  const { goal, recommendation, schedule, graph, weakest, trend, stats } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Dashboard"
        title={goal.subject}
        description={`Exam ${formatExamDate(goal.examDate)} · ${plural(goal.daysLeft, "day")} left · ${plural(stats.conceptsTotal, "concept")}`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/revision">
              <History strokeWidth={1.5} aria-hidden />
              Revision mode
            </Link>
          </Button>
        }
      />

      {goal.isDemo && <DemoBanner />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StudyNowTile recommendation={recommendation} className="col-span-2 lg:row-span-2" />

        <MasteryStatTile stats={stats} />
        <DaysLeftTile goal={goal} />
        <SessionsTile stats={stats} />
        <MistakesTile stats={stats} />

        <TodayPlanTile
          className="col-span-2"
          goalId={goal.id}
          today={schedule.today}
          tomorrow={schedule.days[1] ?? null}
          minutesPerDay={goal.minutesPerDay}
          skippedToday={goal.skippedToday}
        />
        <ModeTile schedule={schedule} className="col-span-2 lg:col-span-1" />
        <WeakestTile topics={weakest} className="col-span-2 lg:col-span-1" />

        <GraphTile data={graph} highlightId={recommendation?.conceptId ?? null} className="col-span-2" />
        <MasteryTrendTile points={trend} className="col-span-2" />
      </div>
    </div>
  );
}
