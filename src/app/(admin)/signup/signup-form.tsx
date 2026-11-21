"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import { LanguageDropdown } from "@/components/language-dropdown";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localizeActionError } from "@/lib/action-error-i18n";
import { PRODUCT_NAME } from "@/lib/brand";
import { signupAction } from "@/server/actions/signup";

export function SignupForm() {
  const t = useTranslations("signup");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await signupAction(fd);
      if (res.success) {
        router.push("/dashboard");
        router.refresh();
        return;
      }
      setError(localizeActionError(tErr, res.error));
    });
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4">
      <LanguageDropdown className="absolute end-4 top-4 sm:end-6 sm:top-6" align="end" />
      <div className="w-full max-w-sm">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <Image src="/logo-mark.svg" alt={PRODUCT_NAME} width={48} height={48} unoptimized className="mx-auto mb-2" />
            <CardTitle className="text-xl">{t("title")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <form method="post" onSubmit={onSubmit}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">{t("username")}</Label>
                <Input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col gap-2 mb-4">
                <Label htmlFor="password">{t("password")}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
              </div>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("submitPending") : t("submit")}
              </Button>
              <Link
                href="/login"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("signIn")}
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
