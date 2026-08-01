import TududiTaskDetailView from "../../../../_components/TududiTaskDetailView";

export default async function MobileV2TududiTaskPage({ params }: { params: Promise<{ projectUid: string; taskUid: string }> }) {
  const { projectUid, taskUid } = await params;
  return <TududiTaskDetailView projectUid={projectUid} taskUid={taskUid} />;
}
