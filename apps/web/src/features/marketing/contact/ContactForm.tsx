"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { FormField } from "@/components/forms/FormField";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { contact, contactTopics } from "@/content/contact";
import { ApiError } from "@/lib/api-client";
import { messageForError } from "@/lib/error-messages";
import { submitContact } from "./api";
import { contactSchema, type ContactInput } from "./schemas";

const fieldNames = ["name", "email", "phone", "topic", "message"] as const;

export function ContactForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const alertRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLHeadingElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    shouldFocusError: true,
    defaultValues: { name: "", email: "", phone: "", topic: undefined, message: "" },
  });

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await submitContact(values);
      setSent(true);
      reset();
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION_ERROR" && error.fields) {
        let focused = false;
        for (const name of fieldNames) {
          const message = error.fields[name]?.[0];
          if (!message) continue;
          setError(name, { message }, { shouldFocus: !focused });
          focused = true;
        }
        if (focused) return;
      }
      setFormError(messageForError(error));
    }
  });

  if (sent) {
    return (
      <div className="rounded-lg border border-border bg-white p-8 shadow-sm" role="status">
        <h2 ref={successRef} tabIndex={-1} className="text-2xl outline-none">
          {contact.success.title}
        </h2>
        <p className="mt-3">{contact.success.body}</p>
        <Button variant="secondary" className="mt-6" onClick={() => setSent(false)}>
          {contact.success.again}
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Contact form"
      className="grid gap-6 rounded-lg border border-border bg-white p-6 shadow-sm sm:p-8"
    >
      {formError ? (
        <Alert ref={alertRef} tone="danger" title="Your message wasn't sent">
          {formError}
        </Alert>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="contact-name" label="Your name" required error={errors.name?.message}>
          {(control) => <Input {...control} autoComplete="name" {...register("name")} />}
        </FormField>
        <FormField id="contact-email" label="Email" required error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" {...register("email")} />}
        </FormField>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="contact-phone" label="Phone" optionalLabel error={errors.phone?.message}>
          {(control) => <Input {...control} type="tel" autoComplete="tel" {...register("phone")} />}
        </FormField>
        <FormField id="contact-topic" label="What's this about?" required error={errors.topic?.message}>
          {(control) => (
            <Select {...control} defaultValue="" {...register("topic")}>
              <option value="" disabled>
                Choose a topic
              </option>
              {contactTopics.map((topic) => (
                <option key={topic.value} value={topic.value}>
                  {topic.label}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>

      <FormField
        id="contact-message"
        label="Message"
        required
        hint="Please don't include ID numbers or other sensitive details."
        error={errors.message?.message}
      >
        {(control) => <Textarea {...control} rows={6} {...register("message")} />}
      </FormField>

      <Button type="submit" size="lg" loading={isSubmitting} className="justify-self-start">
        {isSubmitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
