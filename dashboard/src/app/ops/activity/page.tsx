import { Suspense } from "react";
import ActivityPage from "@/app/activity/ActivityPage";

export default function OpsActivityPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-zinc-400">Loading activity…</div>}>
      <ActivityPage />
    </Suspense>
  );
}
