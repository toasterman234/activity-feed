import TududiProjectDetailView from "../../../_components/TududiProjectDetailView";

export default async function MobileV2TududiProjectPage({ params }: { params: Promise<{ projectUid: string }> }) {
  const { projectUid } = await params;
  return <TududiProjectDetailView projectUid={projectUid} />;
}
