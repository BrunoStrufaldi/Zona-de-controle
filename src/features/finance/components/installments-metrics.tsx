import { CalendarRange, CreditCard, Hourglass, Layers } from "lucide-react";

import { Metric } from "@/features/finance/components/finance-metrics";
import {
  monthLongLabel,
  monthsUntil,
  relativeMonths,
} from "@/features/finance/domain/installments";
import { type InstallmentsOverview } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

interface InstallmentsMetricsProps {
  installments: InstallmentsOverview;
  className?: string;
}

/** Quanto falta pagar em parcelas, em quantas compras, até quando e o peso deste mês. */
export function InstallmentsMetrics({ installments, className }: InstallmentsMetricsProps) {
  const { summary, finalMonth, today } = installments;
  return (
    <dl className={cn("grid grid-cols-2 gap-3 @3xl:grid-cols-4", className)}>
      <Metric
        label="Falta pagar em parcelas"
        value={formatCents(summary.remainingAmount)}
        icon={Hourglass}
        tone="primary"
      />
      <Metric
        label="Parcelas restantes"
        value={String(summary.remainingParcels)}
        note={
          summary.activePurchases === 1 ? "em 1 compra" : `em ${summary.activePurchases} compras`
        }
        icon={Layers}
        tone="primary"
      />
      <Metric
        label="Faturas deste mês"
        value={formatCents(summary.currentMonth)}
        note="parcelas + recorrentes no cartão"
        icon={CreditCard}
        tone="danger"
      />
      <Metric
        label="Última parcela"
        value={finalMonth ? monthLongLabel(finalMonth) : "—"}
        note={finalMonth ? relativeMonths(monthsUntil(finalMonth, today)) : "nenhuma em aberto"}
        icon={CalendarRange}
        tone="success"
      />
    </dl>
  );
}
