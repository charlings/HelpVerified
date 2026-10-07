"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { authApi } from "../api";
import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";

const copy = authCopy.reset;

type Outcome = "form" | "success" | "expired";

function StatusBlock({ title, body, action }: { title: string; body?: string; action: React.ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="grid gap-6">
      <div>
        <h1 ref={ref} tabIndex={-1} className="text-4xl outline-none">
          {title}
        </h1>
        {body ? <p className="mt-3">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ResetPasswordScreen() {
  const token = useSearchParams().get("token");
  const [outcome, setOutcome] = useState<Outcome>("form");
  const [formError, setFormError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const requestNew = (
    <Link href={routes.auth.forgot} className={buttonVariants({ size: "lg", className: "w-full" })}>
      {copy.requestNew}
    </Link>
  );

  if (!token) return <StatusBlock title={copy.invalidTitle} body={copy.invalidBody} action={requestNew} />;
  if (outcome === "expired") return <StatusBlock title={copy.expiredTitle} action={requestNew} />;
  if (outcome === "success") {
    return (
      <StatusBlock
        title={copy.successTitle}
        body={copy.successBody}
        action={
          <Link href={routes.auth.login} className={buttonVariants({ size: "lg", className: "w-full" })}>
            {copy.signIn}
          </Link>
        }
      />
    );
  }

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await authApi.resetPassword(token, password);
      setOutcome("success");
    } catch (error) {
      if (error instanceof ApiError && error.code === "TOKEN_EXPIRED") return setOutcome("expired");
      if (applyServerFieldErrors(error, setError, ["password"]).length === 0) setFormError(messageForError(error));
    }
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="mt-2">{copy.subtitle}</p>
      </div>
      {formError ? (
        <Alert ref={alertRef} tone="danger">
          {formError}
        </Alert>
      ) : null}
      <form noValidate onSubmit={onSubmit} aria-label="Choose a new password" className="grid gap-5">
        <FormField id="reset-password" label="New password" required error={errors.password?.message}>
          {(control) => <PasswordInput {...control} autoComplete="new-password" {...register("password")} />}
        </FormField>
        <FormField id="reset-confirm" label="Confirm new password" required error={errors.confirm?.message}>
          {(control) => <PasswordInput {...control} autoComplete="new-password" {...register("confirm")} />}
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
      </form>
    </div>
  );
}
