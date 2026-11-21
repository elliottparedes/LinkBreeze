import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getAccountPageNamespace } from "@/server/queries";
import { NewPageForm } from "./new-page-form";

export default async function NewPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const namespace = getAccountPageNamespace(session.userId);
  if (!namespace) redirect("/dashboard");
  return <NewPageForm namespace={namespace} />;
}
