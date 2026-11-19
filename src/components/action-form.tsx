"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { error?: string; ok?: string; fieldErrors?: Record<string, string> } | null;
type Action = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const Pending = createContext(false);

/**
 * A form wired to a server action, showing the action's error or success message in place.
 * Submits through onSubmit rather than the form's action prop, because React clears a form after an
 * action-prop submit — staff would lose everything they typed whenever a save is refused.
 */
export function ActionForm({ action, children, className = "", resetOnSuccess = false, id }: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; id?: string }) {
  const [state, formAction, isPending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (resetOnSuccess && state?.ok) ref.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isPending) return;
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => formAction(fd));
  };
  return (
    <Pending.Provider value={isPending}>
    <form ref={ref} onSubmit={onSubmit} className={className} id={id}>
      {state?.error && <p role="alert" className="mb-3 rounded-xl bg-red-tint px-4 py-3 text-sm text-red-dark">{state.error}</p>}
      {state?.ok && <p role="status" className="mb-3 rounded-xl bg-ok-tint px-4 py-3 text-sm text-ok">{state.ok}</p>}
      {children}
    </form>
    </Pending.Provider>
  );
}

export function Submit({ children, className = "btn btn-primary", pending: pendingLabel = "Saving…" }: { children: ReactNode; className?: string; pending?: string }) {
  const status = useFormStatus();
  const pending = useContext(Pending) || status.pending;
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Submits a form only after the person confirms with a second click. */
export function ConfirmButton({ children, confirmLabel = "Click again to confirm", className = "btn btn-sm" }: { children: ReactNode; confirmLabel?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        const b = e.currentTarget;
        if (b.dataset.armed !== "1") {
          e.preventDefault();
          b.dataset.armed = "1";
          b.textContent = confirmLabel;
          setTimeout(() => { if (b.isConnected) { b.dataset.armed = ""; } }, 4000);
        }
      }}
    >
      {children}
    </button>
  );
}
