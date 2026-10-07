import { api } from "@/lib/api-client";
import type { ContactInput } from "./schemas";

export type ContactReceipt = { received: true };

export function submitContact(input: ContactInput) {
  return api.post<ContactReceipt>("/contact", {
    name: input.name,
    email: input.email,
    phone: input.phone || undefined,
    topic: input.topic,
    message: input.message,
  });
}
