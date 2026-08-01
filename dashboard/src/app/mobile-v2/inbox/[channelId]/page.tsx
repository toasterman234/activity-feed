import InboxDetailView from "../../_components/InboxDetailView";

export default async function MobileV2InboxDetailPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  return <InboxDetailView channelId={channelId} />;
}
