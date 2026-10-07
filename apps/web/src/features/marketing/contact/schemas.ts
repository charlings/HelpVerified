import { z } from "zod";
import { contactTopics } from "@/content/contact";

const topicValues = contactTopics.map((t) => t.value) as [string, ...string[]];

export const contactSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.email("Enter a valid email address, like name@example.com."),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a valid phone number, or leave it blank.")
    .or(z.literal(""))
    .optional(),
  topic: z.enum(topicValues, { message: "Choose what your message is about." }),
  message: z
    .string()
    .trim()
    .min(20, "Tell us a little more (at least 20 characters).")
    .max(2000, "Keep your message under 2,000 characters."),
});

export type ContactInput = z.infer<typeof contactSchema>;
