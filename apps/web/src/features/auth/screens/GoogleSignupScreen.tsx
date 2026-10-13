"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { CheckboxField } from "@/components/forms/CheckboxField";
import { FormField } from "@/components/forms/FormField";
import { RadioCards } from "@/components/forms/RadioCards";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { authApi } from "../api";
import { GoogleButton } from "../components/GoogleButton";
import { destinationAfterLogin } from "../redirects";
import { googleSignupSchema, type GoogleSignupInput } from "../schemas";
import { useSessionStore } from "../session";
import type { GooglePendingResponse } from "../types";

const copy = authCopy.googleSignup;

type State =
  | { kind: "loading" }
  | { kind: "ready"; pending: GooglePendingResponse }
  | { kind: "expired" }
  | { kind: "error"; message: string };

function isExpired(error: unknown) {
  return error instanceof ApiError && error.code === "TOKEN_EXPIRED";
}

/**
 * A new Google user chooses family or agency (the API's Google callback sends them here). Google has
 * already verified the email, so there's no password and no verification email; agencies go straight
 * on to agency onboarding.
 */
export function GoogleSignupScreen() {
  const next = useSearchParams().get("next");
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    authApi
      .googlePending()
      .then((pending) => !cancelled && setState({ kind: "ready", pending }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(isExpired(error) ? { kind: "expired" } : { kind: "error", message: messageForError(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (state.kind === "loading") {
    return (
      <div role="status" aria-busy="true" className="grid gap-4">
        <h1 className="text-4xl">{copy.title}</h1>
        <span className="sr-only">{copy.loading}</span>
        <div aria-hidden="true" className="h-64 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
      </div>
    );
  }
  if (state.kind === "expired") return <Expired next={next} />;
  if (state.kind === "error") {
    return (
      <div className="grid gap-6">
        <h1 className="text-4xl">{copy.errorTitle}</h1>
        <Alert tone="danger">{state.message}</Alert>
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            setState({ kind: "loading" });
            setAttempt((a) => a + 1);
          }}
        >
          {copy.retry}
        </Button>
      </div>
    );
  }
  return <CompleteForm pending={state.pending} next={next} onExpired={() => setState({ kind: "expired" })} />;
}

function Expired({ next }: { next: string | null }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="grid gap-6">
      <div>
        <h1 ref={ref} tabIndex={-1} className="text-4xl outline-none">
          {copy.expiredTitle}
        </h1>
        <p className="mt-3">{copy.expiredBody}</p>
      </div>
      <GoogleButton next={next} />
      <Link href={routes.auth.login} className={buttonVariants({ variant: "ghost", size: "lg", className: "w-full" })}>
        {copy.back}
      </Link>
    </div>
  );
}

function CompleteForm({
  pending,
  next,
  onExpired,
}: {
  pending: GooglePendingResponse;
  next: string | null;
  onExpired: () => void;
}) {
  const router = useRouter();
  const signupCopy = authCopy.signup;
  const [formError, setFormError] = useState<{ message: string; emailTaken: boolean } | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<GoogleSignupInput>({
    resolver: zodResolver(googleSignupSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { role: undefined, full_name: pending.full_name ?? "", accept_privacy: false },
  });

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { access_token, user } = await authApi.googleComplete(values);
      useSessionStore.getState().setSession(access_token, user);
      setRedirecting(true);
      router.replace(
        user.role === "agency_admin" ? routes.auth.agencySignup : destinationAfterLogin(user.role, next),
      );
    } catch (error) {
      if (isExpired(error)) return onExpired();
      if (applyServerFieldErrors(error, setError, ["role", "full_name"]).length === 0) {
        setFormError({
          message: messageForError(error),
          emailTaken: error instanceof ApiError && error.code === "EMAIL_TAKEN",
        });
      }
    }
  });

  if (redirecting) {
    return (
      <div role="status">
        <h1 className="text-3xl">{authCopy.login.redirecting}</h1>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="mt-2">{copy.subtitle(pending.email)}</p>
      </div>

      {formError ? (
        <Alert ref={alertRef} tone="danger" title={copy.failedTitle}>
          {formError.message}{" "}
          {formError.emailTaken ? (
            <Link href={routes.auth.login} className="font-semibold underline">
              {signupCopy.signIn}
            </Link>
          ) : null}
        </Alert>
      ) : null}

      <form noValidate onSubmit={onSubmit} aria-label="Finish signing up" className="grid gap-5">
        <RadioCards
          legend={signupCopy.roleLegend}
          options={[
            { value: "family", ...signupCopy.roles.family },
            { value: "agency_admin", ...signupCopy.roles.agency_admin },
          ]}
          error={errors.role?.message}
          {...register("role")}
        />
        <FormField id="google-signup-name" label="Full name" required error={errors.full_name?.message}>
          {(control) => <Input {...control} autoComplete="name" {...register("full_name")} />}
        </FormField>
        <CheckboxField
          id="google-signup-privacy"
          label={
            <>
              {signupCopy.privacy.before}{" "}
              <Link href={routes.privacy} target="_blank" className="font-semibold text-blue-600 underline">
                {signupCopy.privacy.link}
              </Link>
              {signupCopy.privacy.after}
            </>
          }
          error={errors.accept_privacy?.message}
          {...register("accept_privacy")}
        />
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {isSubmitting ? copy.submitting : copy.submit}
        </Button>
      </form>
    </div>
  );
}
