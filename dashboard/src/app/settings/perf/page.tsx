import { redirect } from "next/navigation";

export default function SettingsPerfRedirect() {
  redirect("/ops/config?tab=perf");
}
