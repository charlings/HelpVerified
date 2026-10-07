"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { CheckboxField } from "@/components/forms/CheckboxField";
import { FormField } from "@/components/forms/FormField";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { RadioCards } from "@/components/forms/RadioCards";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes, serviceSlugs } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { authApi } from "../api";
import { CheckEmail } from "../components/CheckEmail";
import { EmailDivider, GoogleButton } from "../components/GoogleButton";
import { signupSchema, type SignupInput } from "../schemas";

const copy = authCopy.signup;

/** `?role=nanny|driver|cleaner` (from service pages) means a family; `?role=agency` means an agency. */
function roleFromParam(param: string | null): SignupInput["role"] | undefined {
  if (param === "agency") return "agency_admin";
  if (param && (serviceSlugs as readonly string[]).includes(param)) return "family";
  return undefined;
}

export function SignupScreen() {
  const params = useSearchParams();
  const [formError, setFormError] = useState<{ message: string; emailTaken: boolean } | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      role: roleFromParam(params.get("role")),
      full_name: "",
      email: "",
      password: "",
      accept_privacy: false,
    },
  });

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await authApi.signup(values);
      setSentTo(values.email);
    } catch (error) {
      const applied = applyServerFieldErrors(error, setError, ["role", "full_name", "email", "password"]);
      if (applied.length === 0) {
        setFormError({
          message: messageForError(error),
          emailTaken: error instanceof ApiError && error.code === "EMAIL_TAKEN",
        });
      }
    }
  });

  if (sentTo) return <CheckEmail email={sentTo} />;

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="mt-2">{copy.subtitle}</p>
      </div>

      {formError ? (
        <Alert ref={alertRef} tone="danger" title={copy.failedTitle}>
          {formError.message}{" "}
          {formError.emailTaken ? (
            <Link href={routes.auth.login} className="font-semibold underline">
              {copy.signIn}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <form noValidate onSubmit={onSubmit} aria-label="Create account" className="grid gap-5">
        <RadioCards
          legend={copy.roleLegend}
          options={[
            { value: "family", ...copy.roles.family },
            { value: "agency_admin", ...copy.roles.agency_admin },
          ]}
          error={errors.role?.message}
          {...register("role")}
        />
        <FormField id="signup-name" label="Full name" required error={errors.full_name?.message}>
          {(control) => <Input {...control} autoComplete="name" {...register("full_name")} />}
        </FormField>
        <FormField id="signup-email" label="Email" required error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" {...register("email")} />}
        </FormField>
        <FormField
          id="signup-password"
          label="Password"
          hint={copy.passwordHint}
          required
          error={errors.password?.message}
        >
          {(control) => <PasswordInput {...control} autoComplete="new-password" {...register("password")} />}
        </FormField>
        <CheckboxField
          id="signup-privacy"
          label={
            <>
              {copy.privacy.before}{" "}
              <Link href={routes.privacy} target="_blank" className="font-semibold text-blue-600 underline">
                {copy.privacy.link}
              </Link>
              {copy.privacy.after}
            </>
          }
          error={errors.accept_privacy?.message}
          {...register("accept_privacy")}
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
      </form>

      <EmailDivider label="or" />
      <GoogleButton />

      <p className="text-center">
        {copy.haveAccount}{" "}
        <Link href={routes.auth.login} className="font-semibold text-blue-600 hover:underline">
          {copy.signIn}
        </Link>
      </p>
    </div>
  );
}
