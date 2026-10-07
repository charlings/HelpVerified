"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { useToast } from "@/components/feedback/Toast";
import { CheckboxField } from "@/components/forms/CheckboxField";
import { FormField } from "@/components/forms/FormField";
import { RadioCards } from "@/components/forms/RadioCards";
import { Stepper } from "@/components/forms/Stepper";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { business } from "@/config/business";
import { routes, serviceSlugs, type ServiceSlug } from "@/config/routes";
import { nigerianStates } from "@/content/locations";
import { services } from "@/content/services";
import { applyServerFieldErrors } from "@/components/forms/server-errors";
import { messageForError } from "@/lib/error-messages";
import { formatDate, formatMonthlyRange } from "@/lib/format";
import { familyRequestKeys, familyRequestsApi } from "../family-api";
import {
  requestFormSchema,
  requestStepFields,
  toCreateRequestPayload,
  type RequestFormInput,
  type RequestFormValues,
} from "../schemas";
import { scheduleLabel } from "../status";

const STEPS = ["Who you need", "Where and when", "Details and budget", "Review"] as const;
const fieldOrder = requestStepFields.flat() as readonly Path<RequestFormInput>[];

function stepOf(field: string) {
  const i = requestStepFields.findIndex((fields) => (fields as readonly string[]).includes(field));
  return i === -1 ? 0 : i;
}

export function NewRequestScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const client = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const pendingErrors = useRef<Record<string, string> | null>(null);

  const roleParam = params.get("role");
  const presetRole = (serviceSlugs as readonly string[]).includes(roleParam ?? "")
    ? (roleParam as ServiceSlug)
    : undefined;

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<RequestFormInput, unknown, RequestFormValues>({
    resolver: zodResolver(requestFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      role: presetRole,
      schedule: "full_time",
      live_in: false,
      state: "Lagos",
      lga: "",
      start_date: "",
      trial_days: business.trialDaysDefault,
      title: "",
      description: "",
      budget_min: "",
      budget_max: "",
    },
  });

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // Server errors for a field on another step are applied once that step has rendered.
    if (pendingErrors.current) {
      let first = true;
      for (const name of fieldOrder) {
        const message = pendingErrors.current[name];
        if (!message) continue;
        setError(name, { message }, { shouldFocus: first });
        first = false;
      }
      pendingErrors.current = null;
      return;
    }
    headingRef.current?.focus();
  }, [step, setError]);

  const create = useMutation({
    mutationFn: (values: RequestFormValues) => familyRequestsApi.create(toCreateRequestPayload(values)),
    onSuccess: async (request) => {
      await client.invalidateQueries({ queryKey: familyRequestKeys.all });
      toast.success("Request posted. Agencies near you can now propose workers.");
      router.push(routes.family.request(request.id));
    },
    onError: (error) => {
      const fieldErrors = (error as { fields?: Record<string, string[]> }).fields;
      if (fieldErrors) {
        const first = fieldOrder.find((f) => fieldErrors[f]);
        if (first) {
          pendingErrors.current = Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, v[0] ?? ""]));
          if (stepOf(first) === step) applyServerFieldErrors(error, setError, fieldOrder);
          else setStep(stepOf(first));
          return;
        }
      }
      setFormError(messageForError(error));
    },
  });

  async function goNext() {
    const fields = requestStepFields[step] as readonly Path<RequestFormInput>[];
    if (await trigger(fields, { shouldFocus: true })) setStep((s) => s + 1);
  }

  const values = getValues();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <WorkspacePage>
      <PageHeader
        title="Post a request"
        description="Tell us who you need. Registered agencies near you will propose workers who have passed all four checks."
        back={{ label: "All requests", href: routes.family.requests }}
      />
      <div className="grid max-w-2xl gap-6">
        <Stepper steps={STEPS} current={step} />
        {formError ? (
          <Alert tone="danger" title="We couldn't post your request">
            {formError}
          </Alert>
        ) : null}

        <form
          noValidate
          onSubmit={handleSubmit((v) => {
            setFormError(null);
            create.mutate(v);
          })}
          aria-label="Post a request"
          className="grid gap-5 rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 ref={headingRef} tabIndex={-1} className="text-xl outline-none">
            {STEPS[step]}
          </h2>

          {step === 0 ? (
            <>
              <RadioCards
                legend="I need a"
                columns={1}
                options={serviceSlugs.map((s) => ({
                  value: s,
                  label: services[s].name,
                  description: services[s].summary,
                }))}
                error={errors.role?.message}
                {...register("role")}
              />
              <RadioCards
                legend="Schedule"
                options={[
                  { value: "full_time", label: scheduleLabel.full_time },
                  { value: "part_time", label: scheduleLabel.part_time },
                ]}
                error={errors.schedule?.message}
                {...register("schedule")}
              />
              <CheckboxField
                id="request-live-in"
                label="Live-in (the worker lives in your home)"
                {...register("live_in")}
              />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="request-state" label="State" required error={errors.state?.message}>
                  {(c) => (
                    <Select {...c} shape="app" {...register("state")}>
                      {nigerianStates.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
                <FormField id="request-lga" label="Local government area" required error={errors.lga?.message}>
                  {(c) => <Input {...c} shape="app" {...register("lga")} />}
                </FormField>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="request-start" label="Start date" required error={errors.start_date?.message}>
                  {(c) => <Input {...c} shape="app" type="date" min={today} {...register("start_date")} />}
                </FormField>
                <FormField
                  id="request-trial"
                  label="Trial length (days)"
                  hint={`Between ${business.trialDaysMin} and ${business.trialDaysMax} days. Most families choose ${business.trialDaysDefault}.`}
                  required
                  error={errors.trial_days?.message}
                >
                  {(c) => <Input {...c} shape="app" inputMode="numeric" {...register("trial_days")} />}
                </FormField>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <FormField
                id="request-title"
                label="Title"
                hint="For example: Live-in nanny for two toddlers"
                required
                error={errors.title?.message}
              >
                {(c) => <Input {...c} shape="app" {...register("title")} />}
              </FormField>
              <FormField
                id="request-description"
                label="What the role involves"
                hint="Duties, hours, children's ages, anything agencies should know. Don't include ID numbers or your full address."
                required
                error={errors.description?.message}
              >
                {(c) => <Textarea {...c} rows={5} {...register("description")} />}
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  id="request-budget-min"
                  label="Monthly budget from (₦)"
                  optionalLabel
                  error={errors.budget_min?.message}
                >
                  {(c) => <Input {...c} shape="app" inputMode="numeric" {...register("budget_min")} />}
                </FormField>
                <FormField
                  id="request-budget-max"
                  label="Monthly budget to (₦)"
                  optionalLabel
                  error={errors.budget_max?.message}
                >
                  {(c) => <Input {...c} shape="app" inputMode="numeric" {...register("budget_max")} />}
                </FormField>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Role", values.role ? services[values.role].name : ""],
                ["Schedule", `${scheduleLabel[values.schedule]}${values.live_in ? ", live-in" : ", live-out"}`],
                ["Area", `${values.lga}, ${values.state}`],
                ["Start date", values.start_date ? formatDate(values.start_date) : ""],
                ["Trial", `${values.trial_days} days`],
                [
                  "Budget",
                  formatMonthlyRange(
                    values.budget_min ? Number(String(values.budget_min).replace(/[,\s₦]/g, "")) * 100 : null,
                    values.budget_max ? Number(String(values.budget_max).replace(/[,\s₦]/g, "")) * 100 : null,
                  ),
                ],
                ["Title", values.title],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="mt-0.5 font-medium break-words text-navy-900">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* Distinct keys: a reused "Continue" button turning into submit would skip the review (see M4). */}
          <div className="flex flex-wrap gap-3">
            {step > 0 ? (
              <Button key="back" variant="secondary" shape="app" onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button key="next" shape="app" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button key="submit" type="submit" shape="app" loading={create.isPending}>
                Post request
              </Button>
            )}
          </div>
        </form>
      </div>
    </WorkspacePage>
  );
}
