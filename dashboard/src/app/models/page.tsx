import { redirect } from "next/navigation";

export default function ModelsRedirect() {
  redirect("/ops/config?tab=models");
}
