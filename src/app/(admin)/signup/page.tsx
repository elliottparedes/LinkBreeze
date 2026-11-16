import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getSession } from "@/lib/auth";
import { publicSignupEnabled } from "@/server/actions/accounts";
import { getUserCount } from "@/server/queries";

import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  if ((await getUserCount()) === 0) redirect("/setup");
  if (!(await publicSignupEnabled())) redirect("/login");

  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
