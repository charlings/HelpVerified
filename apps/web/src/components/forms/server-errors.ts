import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "@/lib/api-client";

/**
 * Maps a server VALIDATION_ERROR onto react-hook-form fields, focusing the first one.
 * Returns the names of the fields that received an error (empty when nothing matched).
 */
export function applyServerFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fieldOrder: readonly Path<T>[],
): Path<T>[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_ERROR" || !error.fields) return [];
  const applied: Path<T>[] = [];
  for (const name of fieldOrder) {
    const message = error.fields[name]?.[0];
    if (!message) continue;
    setError(name, { message }, { shouldFocus: applied.length === 0 });
    applied.push(name);
  }
  return applied;
}
