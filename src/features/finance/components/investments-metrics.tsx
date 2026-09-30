import { Coins, Landmark, PiggyBank, TrendingUp } from "lucide-react";

import { Metric } from "@/features/finance/components/finance-metrics";
import { formatGain, formatGainRate } from "@/features/finance/domain/investments";
import { type InvestmentsOverview } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

interface InvestmentsMetricsProps {
  investments: InvestmentsOverview;
  className?: string;
}

/** Valor da carteira, quanto foi aplicado, o resultado e o patrimônio total. */
export function InvestmentsMetrics({ investments, className }: InvestmentsMetricsProps) {
  const { totals, netWorth } = investments;
  const open = investments.assets.filter((asset) => !asset.position.closed).length;
  const rate = totals.contributed > 0 ? totals.gain / totals.contributed : null;

  return (
    <dl className={cn("grid grid-cols-2 gap-3 @3xl:grid-cols-4", className)}>
      <Metric
        label="Valor da carteira"
        value={formatCents(totals.value)}
        note={open === 1 ? "em 1 ativo" : `em ${open} ativos`}
        icon={Coins}
        tone="primary"
      />
      <Metric
        label="Aplicado líquido"
        value={formatCents(totals.invested)}
        note={`${formatCents(totals.contributed)} aplicados · ${formatCents(totals.withdrawn)} resgatados`}
        icon={PiggyBank}
        tone="primary"
      />
      <Metric
        label="Resultado"
        value={formatGain(totals.gain)}
        note={
          rate === null
            ? "sem aplicações"
            : `${formatGainRate(rate)} do aplicado${totals.income > 0 ? ` · ${formatCents(totals.income)} em proventos` : ""}`
        }
        icon={TrendingUp}
        tone={totals.gain < 0 ? "danger" : "success"}
      />
      <Metric
        label="Patrimônio total"
        value={formatCents(netWorth.total)}
        note="contas + carteira"
        icon={Landmark}
        tone="primary"
      />
    </dl>
  );
}
