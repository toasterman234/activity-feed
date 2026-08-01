import ThreadDetailView from "../../../_components/ThreadDetailView";

export default async function MobileV2InboxThreadPage({
  params,
}: {
  params: Promise<{ channelId: string; threadId: string }>;
}) {
  const { channelId, threadId } = await params;
  return <ThreadDetailView channelId={channelId} threadId={threadId} />;
}
