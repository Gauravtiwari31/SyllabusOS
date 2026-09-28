import type { Metadata } from "next";
import { PageHeader } from "@/components/nu";
import { SettingsView } from "@/components/settings/settings-view";
import { getSettingsData } from "@/lib/services/dashboard";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const data = await getSettingsData(user.id);
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader eyebrow="Settings" title="Settings" description="Your subjects, exam dates, study time and tutor language." />
      <SettingsView data={data} />
    </div>
  );
}
