/**
 * Spec acceptance (requirement 7): every error code the API can return shows a mapped, human message,
 * never the raw code. The code list is the mock's (the same list as api-contracts.md §2).
 */
import { describe, expect, it } from "vitest";
import { statusForCode } from "@/mocks/errors";
import { ApiError } from "./api-client";
import { errorMessages, messageForError } from "./error-messages";

const codes = Object.keys(statusForCode);

describe("error messages", () => {
  it.each(codes)("%s has its own message, written for people", (code) => {
    const message = messageForError(new ApiError(code, "server text", statusForCode[code]!));
    expect(errorMessages[code], `no message for ${code}`).toBeDefined();
    expect(message).toBe(errorMessages[code]);
    expect(message).not.toContain(code);
    expect(message).not.toContain("_");
    expect(message.length).toBeGreaterThan(10);
  });

  it("an unknown code or a non-API error falls back to a generic message, still without the code", () => {
    const unknown = messageForError(new ApiError("SOMETHING_NEW", "server text", 400));
    expect(unknown).not.toContain("SOMETHING_NEW");
    expect(messageForError(new Error("boom"))).not.toContain("boom");
  });
});
