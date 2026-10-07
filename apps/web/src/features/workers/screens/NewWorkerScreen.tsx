"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm, type Path } from "react-hook-form";
import { CheckboxField } from "@/components/forms/CheckboxField";
import { FormField } from "@/components/forms/FormField";
import { Stepper } from "@/components/forms/Stepper";
import { useToast } from "@/components/feedback/Toast";
import { PageHeader, WorkspacePage } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { routes, serviceSlugs } from "@/config/routes";
import { nigerianStates } from "@/content/locations";
import { services } from "@/content/services";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { formatNaira } from "@/lib/format";
import { workerKeys, workersApi } from "../api";
import {
  toCreateWorkerPayload,
  workerFormSchema,
  workerStepFields,
  type WorkerFormInput,
  type WorkerFormValues,
} from "../schemas";

const STEPS = ["Details", "Identity and consent", "Review"] as const;

export function NewWorkerScreen() {
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  // A server error for a field on another step, applied once that step has rendered (so focus lands on it).
  const pendingNinError = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    setError,
    formState: { errors },
  } = useForm<WorkerFormInput, unknown, WorkerFormValues>({
    resolver: zodResolver(workerFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: {
      full_name: "",
      role: undefined,
      years_experience: "" as unknown as number,
      languages: "English",
      live_in_ok: false,
      state: "Lagos",
      lga: "",
      salary_min: "",
      salary_max: "",
      nin: "",
      consent: false,
    },
  });

  const create = useMutation({
    mutationFn: (values: WorkerFormValues) => workersApi.create(toCreateWorkerPayload(values)),
    onSuccess: async (worker) => {
      await client.invalidateQueries({ queryKey: workerKeys.all });
      await client.invalidateQueries({ queryKey: ["agency", "dashboard"] });
      toast.success(`${worker.full_name} added. Next, complete their four checks.`);
      router.push(routes.agency.worker(worker.id));
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "DUPLICATE_WORKER") {
        pendingNinError.current = messageForError(error);
        setStep(1);
        return;
      }
      setFormError(messageForError(error));
    },
  });

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (pendingNinError.current) {
      setError("nin", { message: pendingNinError.current }, { shouldFocus: true });
      pendingNinError.current = null;
      return;
    }
    stepHeadingRef.current?.focus();
  }, [step, setError]);

  async function goNext() {
    const fields = workerStepFields[step] as readonly Path<WorkerFormInput>[];
    if (await trigger(fields, { shouldFocus: true })) setStep((s) => s + 1);
  }

  const values = getValues();
  const onSubmit = handleSubmit((v) => {
    setFormError(null);
    create.mutate(v);
  });

  return (
    <WorkspacePage>
      <PageHeader
        title="Add a worker"
        description="Create the worker's profile. You'll complete their four checks next."
        back={{ label: "All workers", href: routes.agency.workers }}
      />
      <div className="grid max-w-2xl gap-6">
        <Stepper steps={STEPS} current={step} />
        {formError ? (
          <Alert tone="danger" title="We couldn't add this worker">
            {formError}
          </Alert>
        ) : null}

        <form
          noValidate
          onSubmit={onSubmit}
          aria-label="Add a worker"
          className="grid gap-5 rounded-lg border border-border bg-white p-5 shadow-sm sm:p-6"
        >
          <h2 ref={stepHeadingRef} tabIndex={-1} className="text-xl outline-none">
            {STEPS[step]}
          </h2>

          {step === 0 ? (
            <>
              <FormField id="worker-name" label="Full name" required error={errors.full_name?.message}>
                {(c) => <Input {...c} shape="app" autoComplete="off" {...register("full_name")} />}
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="worker-role" label="Role" required error={errors.role?.message}>
                  {(c) => (
                    <Select {...c} shape="app" defaultValue="" {...register("role")}>
                      <option value="" disabled>
                        Choose a role
                      </option>
                      {serviceSlugs.map((s) => (
                        <option key={s} value={s}>
                          {services[s].name}
                        </option>
                      ))}
                    </Select>
                  )}
                </FormField>
                <FormField
                  id="worker-years"
                  label="Years of experience"
                  required
                  error={errors.years_experience?.message}
                >
                  {(c) => <Input {...c} shape="app" inputMode="numeric" {...register("years_experience")} />}
                </FormField>
              </div>
              <FormField
                id="worker-languages"
                label="Languages"
                hint="Separate with commas, for example: English, Yoruba"
                required
                error={errors.languages?.message}
              >
                {(c) => <Input {...c} shape="app" {...register("languages")} />}
              </FormField>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="worker-state" label="State" required error={errors.state?.message}>
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
                <FormField id="worker-lga" label="Local government area" required error={errors.lga?.message}>
                  {(c) => <Input {...c} shape="app" {...register("lga")} />}
                </FormField>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField
                  id="worker-salary-min"
                  label="Expected salary from (₦ a month)"
                  optionalLabel
                  error={errors.salary_min?.message}
                >
                  {(c) => <Input {...c} shape="app" inputMode="numeric" {...register("salary_min")} />}
                </FormField>
                <FormField
                  id="worker-salary-max"
                  label="Expected salary to (₦ a month)"
                  optionalLabel
                  error={errors.salary_max?.message}
                >
                  {(c) => <Input {...c} shape="app" inputMode="numeric" {...register("salary_max")} />}
                </FormField>
              </div>
              <CheckboxField id="worker-live-in" label="Open to live-in roles" {...register("live_in_ok")} />
            </>
          ) : null}

          {step === 1 ? (
            <>
              <FormField
                id="worker-nin"
                label="National Identification Number (NIN)"
                hint="11 digits. HelpVerified never stores the full number: only a protected fingerprint and the last 4 digits, to stop the same person being added twice."
                required
                error={errors.nin?.message}
              >
                {(c) => <Input {...c} shape="app" inputMode="numeric" autoComplete="off" {...register("nin")} />}
              </FormField>
              <CheckboxField
                id="worker-consent"
                label="The worker has agreed to HelpVerified collecting their details and check results, and sharing their profile and check dates with families."
                error={errors.consent?.message}
                {...register("consent")}
              />
            </>
          ) : null}

          {step === 2 ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["Name", values.full_name],
                ["Role", values.role ? services[values.role].name : ""],
                ["Experience", `${values.years_experience} years`],
                ["Languages", values.languages],
                ["Area", `${values.lga}, ${values.state}`],
                [
                  "Expected salary",
                  [values.salary_min, values.salary_max]
                    .map((v) => (v ? formatNaira(Number(String(v).replace(/[,\s₦]/g, "")) * 100) : null))
                    .filter(Boolean)
                    .join(" – ") || "Not given",
                ],
                ["Live-in", values.live_in_ok ? "Yes" : "No"],
                ["NIN", values.nin ? `Ending ${String(values.nin).slice(-4)}` : ""],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-sm text-slate-600">{label}</dt>
                  <dd className="mt-0.5 font-medium text-navy-900">{value}</dd>
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
            {step < 2 ? (
              <Button key="next" shape="app" onClick={goNext}>
                Continue
              </Button>
            ) : (
              <Button key="submit" type="submit" shape="app" loading={create.isPending}>
                Add worker
              </Button>
            )}
          </div>
        </form>
      </div>
    </WorkspacePage>
  );
}
