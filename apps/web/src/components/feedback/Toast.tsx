"use client";

import { CircleCheck, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type Toast = { id: number; message: string; tone: "success" | "error" };
type ToastApi = { success: (message: string) => void; error: (message: string) => void };

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (message: string, tone: Toast["tone"]) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ success: (m) => push(m, "success"), error: (m) => push(m, "error") }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Always mounted so screen readers pick up new messages (aria-live needs an existing region). */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-20 z-50 grid justify-items-center gap-2 md:right-4 md:bottom-14 md:left-auto md:justify-items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex max-w-sm items-start gap-3 rounded-md border bg-white p-4 text-sm shadow-lg",
              toast.tone === "success" ? "border-success-600/30" : "border-danger-600/30",
            )}
          >
            {toast.tone === "success" ? (
              <CircleCheck aria-hidden="true" className="size-5 shrink-0 text-success-600" />
            ) : (
              <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-danger-600" />
            )}
            <p className="flex-1 text-navy-900">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="-m-2.5 inline-flex size-11 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
