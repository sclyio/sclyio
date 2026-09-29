"use client";

import { useFormStatus } from "react-dom";

/** Submit button that shows a pending label and blocks double submission. */
export function SubmitButton({ children, pending = "Saving…", className, name, value }: { children: React.ReactNode; pending?: string; className?: string; name?: string; value?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={busy} aria-disabled={busy} name={name} value={value}>
      {busy ? pending : children}
    </button>
  );
}
