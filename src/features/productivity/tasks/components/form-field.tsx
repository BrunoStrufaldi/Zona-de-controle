import { type ReactNode } from "react";

import { Label } from "@/components/ui/label";

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string | undefined;
  children: ReactNode;
}

/** Rótulo + controle + mensagem de erro, usado nos formulários de tarefas. */
export function Field({ label, htmlFor, error, children }: FieldProps) {
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
