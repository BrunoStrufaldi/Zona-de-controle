import { type ReactNode } from "react";

export interface StatusRow {
  label: string;
  value: ReactNode;
  /** Explicação curta abaixo do valor. */
  hint?: string;
}

/** Lista de leituras "rótulo → valor" (somente leitura). */
export function StatusList({ rows, label }: { rows: StatusRow[]; label: string }) {
  return (
    <dl className="grid gap-3 text-sm" aria-label={label}>
      {rows.map((row) => (
        <div key={row.label} className="grid gap-0.5">
          <dt className="text-xs text-subtle-foreground">{row.label}</dt>
          <dd className="font-medium break-words">{row.value}</dd>
          {row.hint && <dd className="text-xs text-muted-foreground">{row.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
