"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { messageForError } from "@/lib/error-messages";
import { authApi } from "../api";
import { DemoInboxLink } from "../components/DemoInboxLink";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";
import { textLink } from "@/components/ui/link-styles";

const copy = authCopy.forgot;

export function ForgotPasswordScreen() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLHeadingElement>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onBlur",
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);
  useEffect(() => {
    if (sentTo) sentRef.current?.focus();
  }, [sentTo]);

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (error) {
      setFormError(messageForError(error));
    }
  });

  const back = (
    <Link href={routes.auth.login} className={textLink}>
      {copy.back}
    </Link>
  );

  if (sentTo) {
    return (
      <div className="grid gap-6">
        <div>
          <h1 ref={sentRef} tabIndex={-1} className="text-4xl outline-none">
            {copy.sentTitle}
          </h1>
          <p className="mt-3">{copy.sentBody}</p>
        </div>
        <DemoInboxLink email={sentTo} kind="reset_password" />
        {back}
      </div>
    );
  }

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
      <form noValidate onSubmit={onSubmit} aria-label="Reset password" className="grid gap-5">
        <FormField id="forgot-email" label="Email" required error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" {...register("email")} />}
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
      </form>
      <p className="text-center">{back}</p>
    </div>
  );
}
