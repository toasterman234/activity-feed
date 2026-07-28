import { redirect } from "next/navigation";

export default function PerfRedirect() {
  redirect("/ops/config?tab=perf");
}
