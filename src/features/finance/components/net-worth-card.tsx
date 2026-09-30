import { Info, Landmark } from "lucide-react";

import { WidgetCard } from "@/components/shared/widget-card";
import { balanceToneClass } from "@/features/finance/components/finance-styles";
import { type FinanceAccount, type InvestmentsOverview } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

interface NetWorthCardProps {
  investments: InvestmentsOverview;
  accounts: ReadonlyMap<number, FinanceAccount>;
  className?: string;
}

/**
 * Patrimônio sem contar o mesmo dinheiro duas vezes: as outras contas, o que
 * sobra nas contas de investimentos fora da carteira e a carteira.
 */
export function NetWorthCard({ investments, accounts, className }: NetWorthCardProps) {
  const { netWorth } = investments;
  const short = investments.accounts.filter((account) => account.cash < 0);

  return (
    <WidgetCard title="Patrimônio" icon={Landmark} className={className}>
      <dl className="grid gap-2 text-sm">
        <Row label="Contas (corrente, cartões…)" value={netWorth.accounts} />
        {investments.accounts.map((account) => (
          <Row
            key={account.accountId}
            label={`Parado em ${accounts.get(account.accountId)?.name ?? "conta de investimentos"}`}
            value={account.cash}
          />
        ))}
        <Row label="Carteira" value={netWorth.portfolio} />
        <div className="mt-2 flex items-baseline justify-between border-t border-border pt-3">
          <dt className="text-muted-foreground">Total</dt>
          <dd
            className={cn(
              "font-mono text-lg font-semibold tabular",
              balanceToneClass(netWorth.total),
            )}
          >
            {formatCents(netWorth.total)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        {short.length > 0
          ? `As aplicações registradas passam do saldo de ${short
              .map((account) => accounts.get(account.accountId)?.name ?? "uma conta")
              .join(", ")}: falta a transferência dessas aplicações ou o saldo inicial da conta.`
          : "O que foi aplicado sai do saldo da conta de investimentos e entra na carteira pelo valor atual, então nada conta duas vezes."}
      </p>
    </WidgetCard>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="min-w-0 truncate text-muted-foreground">{label}</dt>
      <dd className={cn("font-mono tabular", balanceToneClass(value))}>{formatCents(value)}</dd>
    </div>
  );
}
