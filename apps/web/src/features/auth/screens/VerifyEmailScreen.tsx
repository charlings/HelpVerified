"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/forms/FormField";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { routes, type Role } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { Alert } from "@/components/ui/Alert";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { authApi } from "../api";
import { DemoInboxLink } from "../components/DemoInboxLink";
import { loginUrl } from "../redirects";
import { forgotPasswordSchema, type ForgotPasswordInput } from "../schemas";

const copy = authCopy.verify;

type State =
  | { kind: "verifying" }
  | { kind: "verified"; role: Role }
  | { kind: "expired" }
  | { kind: "no-token" }
  | { kind: "error"; message: string };

function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus(), []);
  return ref;
}

export function VerifyEmailScreen() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<State>(token ? { kind: "verifying" } : { kind: "no-token" });
  const [attempt, setAttempt] = useState(0);
  const submitted = useRef(-1);

  useEffect(() => {
    // Tokens are single-use: submit once per attempt (guards against React strict-mode double effects).
    if (!token || submitted.current === attempt) return;
    submitted.current = attempt;
    authApi
      .verifyEmail(token)
      .then(({ role }) => setState({ kind: "verified", role }))
      .catch((error: unknown) =>
        setState(
          error instanceof ApiError && error.code === "TOKEN_EXPIRED"
            ? { kind: "expired" }
            : { kind: "error", message: messageForError(error) },
        ),
      );
  }, [token, attempt]);

  if (state.kind === "error") {
    return (
      <div className="grid gap-6">
        <h1 className="text-4xl">{copy.errorTitle}</h1>
        <Alert tone="danger">{state.message}</Alert>
        <Button
          size="lg"
          className="w-full"
          onClick={() => {
            setState({ kind: "verifying" });
            setAttempt((a) => a + 1);
          }}
        >
          {copy.retry}
        </Button>
      </div>
    );
  }

  if (state.kind === "verifying") {
    return (
      <div role="status">
        <h1 className="text-3xl">{copy.verifying}</h1>
      </div>
    );
  }
  if (state.kind === "verified") return <Verified role={state.role} />;
  return (
    <Resend
      title={state.kind === "expired" ? copy.expiredTitle : copy.noTokenTitle}
      body={state.kind === "expired" ? copy.expiredBody : copy.noTokenBody}
    />
  );
}

function Verified({ role }: { role: Role }) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  const isAgency = role === "agency_admin";
  return (
    <div className="grid gap-6">
      <CircleCheck aria-hidden="true" className="size-12 text-success-600" />
      <div>
        <h1 ref={ref} tabIndex={-1} className="text-4xl outline-none">
          {copy.successTitle}
        </h1>
        <p className="mt-3">{isAgency ? copy.successAgency : copy.successFamily}</p>
      </div>
      <Link
        href={isAgency ? loginUrl(routes.auth.agencySignup) : routes.auth.login}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        {copy.continue}
      </Link>
    </div>
  );
}

function Resend({ title, body }: { title: string; body: string }) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  const onSubmit = handleSubmit(async ({ email }) => {
    await authApi.resendVerification(email).catch(() => undefined);
    setSentTo(email);
  });

  return (
    <div className="grid gap-6">
      <div>
        <h1 ref={ref} tabIndex={-1} className="text-4xl outline-none">
          {title}
        </h1>
        <p className="mt-3">{body}</p>
      </div>
      <form noValidate onSubmit={onSubmit} aria-label="Resend verification" className="grid gap-5">
        <FormField id="verify-email" label="Email" required error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" {...register("email")} />}
        </FormField>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {copy.sendAgain}
        </Button>
      </form>
      <p role="status" className="text-sm">
        {sentTo ? authCopy.checkEmail.resent : null}
      </p>
      {sentTo ? <DemoInboxLink email={sentTo} kind="verify_email" /> : null}
    </div>
  );
}
