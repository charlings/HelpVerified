import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { messageForError } from "@/lib/error-messages";

type ErrorStateProps = {
  error: unknown;
  title?: string;
  onRetry?: () => void;
};

/** A data view that failed to load: the mapped message (never a raw code) and a retry. */
export function ErrorState({ error, title = "We couldn't load this", onRetry }: ErrorStateProps) {
  if (process.env.NODE_ENV === "development") console.error(error);
  return (
    <div
      role="alert"
      className="grid justify-items-center rounded-lg border border-danger-600/20 bg-danger-50 px-6 py-10 text-center"
    >
      <CircleAlert aria-hidden="true" className="size-8 text-danger-700" />
      <h2 className="mt-3 text-xl">{title}</h2>
      <p className="mt-2 max-w-md text-danger-700">{messageForError(error)}</p>
      {onRetry ? (
        <Button variant="secondary" shape="app" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
