import { redirect } from "next/navigation";

export default function WorkflowsRedirect() {
  redirect("/ops/config?tab=workflows");
}
