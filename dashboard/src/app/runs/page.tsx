import { redirect } from "next/navigation";

export default async function RunsRedirect({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) || {};
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else if (v != null) qs.set(k, v);
  }
  const q = qs.toString();
  redirect(q ? `/ops/runs?${q}` : "/ops/runs");
}
