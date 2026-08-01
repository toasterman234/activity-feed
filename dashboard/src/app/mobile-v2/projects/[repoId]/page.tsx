import ProjectDetailView from "../../_components/ProjectDetailView";

export default async function MobileV2ProjectDetailPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <ProjectDetailView repoId={repoId} />;
}
