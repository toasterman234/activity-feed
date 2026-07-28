import { redirect } from "next/navigation";

export default async function EvidenceDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/channels/continuity/${id}`);
}
