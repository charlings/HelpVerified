"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { messageForError } from "@/lib/error-messages";
import { restoreSession, signIn } from "../client";
import { DemoAccounts } from "../components/DemoAccounts";
import { EmailDivider, GoogleButton } from "../components/GoogleButton";
import { destinationAfterLogin } from "../redirects";
import { loginSchema, type LoginInput } from "../schemas";
import { useSessionStore } from "../session";

const copy = authCopy.login;

type FormError = { title: string; message: string };

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  const next = params.get("next");
  const googleError = params.get("google_error");
  // The API's Google callback set the refresh cookie and sent the browser here to restore the session.
  const googleSignedIn = params.get("google") === "signed_in";
  const [formError, setFormError] = useState<FormError | null>(
    googleError
      ? { title: authCopy.google.errorTitle, message: authCopy.google.errors[googleError] ?? authCopy.google.unknownError }
      : null,
  );
  const [redirecting, setRedirecting] = useState(googleSignedIn);
  const alertRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!googleSignedIn) return;
    let cancelled = false;
    void restoreSession().then(() => {
      if (cancelled) return;
      const { user } = useSessionStore.getState();
      if (user) {
        router.replace(destinationAfterLogin(user.role, next));
      } else {
        setRedirecting(false);
        setFormError({ title: authCopy.google.errorTitle, message: authCopy.google.restoreFailed });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [googleSignedIn, next, router]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await signIn(values.email, values.password);
      setRedirecting(true);
      router.replace(destinationAfterLogin(user.role, next));
    } catch (error) {
      if (applyServerFieldErrors(error, setError, ["email", "password"]).length === 0) {
        setFormError({ title: copy.failedTitle, message: messageForError(error) });
      }
    }
  });

  if (redirecting) {
    return (
      <div role="status">
        <h1 className="text-3xl">{copy.redirecting}</h1>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="mt-2">{copy.subtitle}</p>
      </div>

      {expired ? <Alert tone="info">{copy.expired}</Alert> : null}
      {formError ? (
        <Alert ref={alertRef} tone="danger" title={formError.title}>
          {formError.message}
        </Alert>
      ) : null}

      <GoogleButton next={next} />
      <EmailDivider />

      <form noValidate onSubmit={onSubmit} aria-label="Sign in" className="grid gap-5">
        <FormField id="login-email" label="Email" required error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" {...register("email")} />}
        </FormField>
        <FormField id="login-password" label="Password" required error={errors.password?.message}>
          {(control) => <PasswordInput {...control} autoComplete="current-password" {...register("password")} />}
        </FormField>
        <Link
          href={routes.auth.forgot}
          className="-my-3 inline-flex min-h-11 items-center justify-self-end text-sm font-semibold text-blue-600 hover:underline"
        >
          {copy.forgot}
        </Link>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
      </form>

      <p className="text-center">
        {copy.noAccount}{" "}
        <Link href={routes.auth.signup} className="font-semibold text-blue-600 hover:underline">
          {copy.createAccount}
        </Link>
      </p>
      <DemoAccounts />
    </div>
  );
}
