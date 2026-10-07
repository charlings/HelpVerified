"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { FormField } from "@/components/forms/FormField";
import { Stepper } from "@/components/forms/Stepper";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { routes, serviceSlugs } from "@/config/routes";
import { authCopy } from "@/content/auth";
import { nigerianStates } from "@/content/locations";
import { services } from "@/content/services";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { authApi } from "../api";
import { reloadUser, restoreSession, useSession } from "../client";
import { CheckEmail } from "../components/CheckEmail";
import { loginUrl } from "../redirects";
import { agencySchema, agencyStepFields, type AgencyInput, type AgencyPayload } from "../schemas";

const copy = authCopy.agency;
const fieldOrder = agencyStepFields.flat() as readonly Path<AgencyInput>[];

function stepOf(field: string): number {
  const index = agencyStepFields.findIndex((fields) => (fields as readonly string[]).includes(field));
  return index === -1 ? 0 : index;
}

export function AgencyOnboardingScreen() {
  const { status, user } = useSession();
  const router = useRouter();

  useEffect(() => {
    void restoreSession();
  }, []);

  useEffect(() => {
    if (status === "anonymous") router.replace(loginUrl(routes.auth.agencySignup));
    else if (status === "authenticated" && user && user.role !== "agency_admin") router.replace(routes.forbidden);
  }, [status, user, router]);

  if (status !== "authenticated" || !user || user.role !== "agency_admin") {
    return (
      <div role="status" aria-busy="true" className="grid gap-4">
        <h1 className="text-4xl">{copy.title}</h1>
        <div aria-hidden="true" className="h-64 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
      </div>
    );
  }

  if (user.agency) return <Submitted />;
  if (!user.email_verified) return <NotVerified email={user.email} />;
  return <OnboardingForm />;
}

function Submitted() {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="grid gap-6">
      <div>
        <h1 ref={ref} tabIndex={-1} className="text-4xl outline-none">
          {copy.pendingTitle}
        </h1>
        <p className="mt-3">{copy.pendingBody}</p>
      </div>
      <Link href={routes.agency.home} className={buttonVariants({ size: "lg", className: "w-full" })}>
        {copy.goToDashboard}
      </Link>
    </div>
  );
}

function NotVerified({ email }: { email: string }) {
  return (
    <div className="grid gap-6">
      <Alert tone="warning" title={copy.notVerifiedTitle}>
        {copy.notVerifiedBody}
      </Alert>
      <CheckEmail email={email} />
    </div>
  );
}

function OnboardingForm() {
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingFieldErrors, setPendingFieldErrors] = useState<Record<string, string> | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AgencyInput, unknown, AgencyPayload>({
    resolver: zodResolver(agencySchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      name: "",
      cac_number: "",
      email: "",
      phone: "",
      address_line: "",
      state: undefined,
      lga: "",
      roles_offered: [],
    },
  });

  // Move focus to the step heading whenever the step changes (not on first render).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step]);

  // Server field errors are applied after their step has rendered, so focus can land on the field.
  useEffect(() => {
    if (!pendingFieldErrors) return;
    let first = true;
    for (const name of fieldOrder) {
      const message = pendingFieldErrors[name];
      if (!message) continue;
      setError(name, { message }, { shouldFocus: first });
      first = false;
    }
    setPendingFieldErrors(null);
  }, [pendingFieldErrors, setError]);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function goNext() {
    const fields = agencyStepFields[step] as readonly Path<AgencyInput>[];
    if (await trigger(fields, { shouldFocus: true })) setStep((s) => s + 1);
  }

  const onSubmit = handleSubmit(async (payload) => {
    setFormError(null);
    try {
      await authApi.createAgency(payload);
      await reloadUser();
      setSubmitted(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR" && error.fields) {
        const messages = Object.fromEntries(
          Object.entries(error.fields).map(([field, list]) => [field, list[0] ?? ""]),
        );
        const firstField = fieldOrder.find((f) => messages[f]);
        if (firstField) {
          setStep(stepOf(firstField));
          setPendingFieldErrors(messages);
          return;
        }
      }
      setFormError(messageForError(error));
    }
  });

  if (submitted) return <Submitted />;

  const values = getValues();
  const roleNames = (values.roles_offered ?? []).map((slug) => services[slug].plural).join(", ");

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-4xl">{copy.title}</h1>
        <p className="mt-2">{copy.subtitle}</p>
      </div>
      <Stepper steps={copy.steps} current={step} />
      {formError ? (
        <Alert ref={alertRef} tone="danger" title={copy.failedTitle}>
          {formError}
        </Alert>
      ) : null}

      <form noValidate onSubmit={onSubmit} aria-label={copy.title} className="grid gap-5">
        <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl outline-none">
          {copy.steps[step]}
        </h2>

        {step === 0 ? (
          <>
            <FormField id="agency-name" label="Registered business name" required error={errors.name?.message}>
              {(control) => <Input {...control} autoComplete="organization" {...register("name")} />}
            </FormField>
            <FormField
              id="agency-cac"
              label="CAC registration number"
              hint="For example RC 1234567 or BN 1234567."
              required
              error={errors.cac_number?.message}
            >
              {(control) => <Input {...control} {...register("cac_number")} />}
            </FormField>
            <FormField id="agency-email" label="Business email" required error={errors.email?.message}>
              {(control) => <Input {...control} type="email" autoComplete="email" {...register("email")} />}
            </FormField>
            <FormField id="agency-phone" label="Business phone" required error={errors.phone?.message}>
              {(control) => <Input {...control} type="tel" autoComplete="tel" {...register("phone")} />}
            </FormField>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <FormField id="agency-address" label="Office address" required error={errors.address_line?.message}>
              {(control) => <Input {...control} autoComplete="street-address" {...register("address_line")} />}
            </FormField>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField id="agency-state" label="State" required error={errors.state?.message}>
                {(control) => (
                  <Select {...control} defaultValue="" {...register("state")}>
                    <option value="" disabled>
                      Choose a state
                    </option>
                    {nigerianStates.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField id="agency-lga" label="Local government area" required error={errors.lga?.message}>
                {(control) => <Input {...control} {...register("lga")} />}
              </FormField>
            </div>
            <fieldset className="grid gap-3" aria-describedby={errors.roles_offered ? "agency-roles-error" : undefined}>
              <legend className="mb-1 text-sm font-semibold text-navy-900">{copy.rolesLegend}</legend>
              {serviceSlugs.map((slug) => (
                <label key={slug} className="flex min-h-11 cursor-pointer items-center gap-3 text-navy-900">
                  <input
                    type="checkbox"
                    value={slug}
                    className="size-5 accent-blue-600"
                    aria-invalid={errors.roles_offered ? true : undefined}
                    {...register("roles_offered")}
                  />
                  {services[slug].plural}
                </label>
              ))}
              {errors.roles_offered ? (
                <p id="agency-roles-error" className="text-sm font-medium text-danger-600">
                  {errors.roles_offered.message}
                </p>
              ) : null}
            </fieldset>
          </>
        ) : null}

        {step === 2 ? (
          <dl className="grid gap-4 rounded-lg border border-border p-5">
            {[
              ["Business name", values.name, 0],
              ["CAC number", values.cac_number, 0],
              ["Email", values.email, 0],
              ["Phone", values.phone, 0],
              ["Address", `${values.address_line}, ${values.lga}, ${values.state}`, 1],
              ["Roles", roleNames, 1],
            ].map(([label, value, target]) => (
              <div key={label as string} className="grid grid-cols-[1fr_auto] gap-x-4">
                <dt className="text-sm font-semibold text-navy-900">{label}</dt>
                <dd className="col-start-1 mt-0.5 break-words">{value as string}</dd>
                <dd className="col-start-2 row-span-2 row-start-1 self-start">
                  <Button
                    variant="link"
                    aria-label={`${copy.reviewEdit} ${(label as string).toLowerCase()}`}
                    onClick={() => setStep(target as number)}
                  >
                    {copy.reviewEdit}
                  </Button>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {/*
          Distinct keys matter: if React reused the "Continue" <button> as the submit button, the click that
          advances to the review step would also trigger the browser's default submit and skip the review.
        */}
        <div className="flex flex-wrap gap-3">
          {step > 0 ? (
            <Button key="back" variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)}>
              {copy.back}
            </Button>
          ) : null}
          {step < 2 ? (
            <Button key="next" size="lg" onClick={goNext}>
              {copy.next}
            </Button>
          ) : (
            <Button key="submit" type="submit" size="lg" loading={isSubmitting}>
              {isSubmitting ? copy.submitting : copy.submit}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
