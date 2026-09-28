import { Landmark, Settings2 } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { balanceToneClass, categoryDotClass } from "@/features/finance/components/finance-styles";
import { accountKindLabels } from "@/features/finance/domain/labels";
import { type FinanceAccount } from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";

interface AccountsCardProps {
  accounts: readonly FinanceAccount[];
  onManage: () => void;
}

/** Saldo de cada conta (só lançamentos pagos) e o total. */
export function AccountsCard({ accounts, onManage }: AccountsCardProps) {
  const total = accounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <WidgetCard
      title="Contas"
      icon={Landmark}
      headerExtra={
        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onManage}>
          <Settings2 aria-hidden="true" />
          Gerenciar
        </Button>
      }
    >
      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta ainda"
          description="Cadastre onde o seu dinheiro está para acompanhar os saldos."
          className="border-0 py-6"
        />
      ) : (
        <>
          <ul className="grid gap-2" aria-label="Saldos das contas">
            {accounts.map((account) => (
              <li key={account.id} className="flex min-w-0 items-center gap-3 text-sm">
                <span
                  aria-hidden="true"
                  className={cn("size-2.5 shrink-0 rounded-full", categoryDotClass[account.color])}
                />
                <span className="min-w-0 flex-1 truncate">
                  {account.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {accountKindLabels[account.kind]}
                  </span>
                </span>
                <span className={cn("font-mono tabular", balanceToneClass(account.balance))}>
                  {formatCents(account.balance)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
            <span className="text-sm text-muted-foreground">Saldo total</span>
            <span
              className={cn("font-mono text-lg font-semibold tabular", balanceToneClass(total))}
            >
              {formatCents(total)}
            </span>
          </div>
        </>
      )}
    </WidgetCard>
  );
}
