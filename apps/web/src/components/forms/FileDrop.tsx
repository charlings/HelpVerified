"use client";

import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/cn";

const ACCEPT: Record<string, string> = { "image/jpeg": "JPG", "image/png": "PNG", "application/pdf": "PDF" };
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type FileDropProps = {
  label: string;
  hint?: string;
  disabled?: boolean;
  /** 0–100 while uploading; null when idle. */
  progress?: number | null;
  onFile: (file: File) => void;
};

/** Returns a user-facing problem with the file, or null when it can be uploaded. */
export function validateUpload(file: File): string | null {
  if (!ACCEPT[file.type]) return "Use a JPG, PNG or PDF file.";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 10 MB. Choose a smaller file.";
  if (file.size === 0) return "The file is empty.";
  return null;
}

/**
 * File picker with drag and drop. The native input stays in the tab order (visually hidden), so it works
 * with keyboard and screen readers; dropping is an extra, not the only way.
 */
export function FileDrop({ label, hint, disabled, progress = null, onFile }: FileDropProps) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function accept(file: File | undefined) {
    if (!file) return;
    const problem = validateUpload(file);
    setError(problem);
    if (!problem) onFile(file);
  }

  const busy = progress !== null;
  return (
    <div className="grid gap-2">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border-strong bg-slate-50 px-4 py-6 text-center text-sm",
          "focus-within:shadow-(--focus-ring) hover:border-blue-600",
          dragging && "border-blue-600 bg-blue-50",
          (disabled || busy) && "cursor-not-allowed opacity-60",
        )}
      >
        <Upload aria-hidden="true" className="size-6 text-blue-600" />
        <span className="font-semibold text-navy-900">{label}</span>
        <span className="text-slate-600">
          {hint ?? "JPG, PNG or PDF, up to 10 MB. Drag a file here or choose one."}
        </span>
        <input
          id={id}
          type="file"
          accept={Object.keys(ACCEPT).join(",")}
          disabled={disabled || busy}
          aria-describedby={error ? `${id}-error` : undefined}
          className="sr-only"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {busy ? (
        <div
          role="progressbar"
          aria-label="Upload progress"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
