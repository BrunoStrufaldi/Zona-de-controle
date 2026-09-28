import { ArrowLeftRight, Landmark, Plus, SearchX } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { balanceToneClass } from "@/features/finance/components/finance-styles";
import { TransactionFiltersBar } from "@/features/finance/components/transaction-filters-bar";
import {
  TransactionList,
  type TransactionItemHandlers,
} from "@/features/finance/components/transaction-list";
import { summarizeTransactions } from "@/features/finance/domain/cashflow";
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
  indexById,
  type TransactionFilters,
} from "@/features/finance/domain/filters";
import { type TransactionsData } from "@/features/finance/hooks/use-finance";
import { cn } from "@/lib/cn";
import { formatCents } from "@/lib/format";
import { type IsoDate } from "@/types/common";

interface TransactionsViewProps extends TransactionItemHandlers {
  data: TransactionsData;
  /** Ex.: "setembro de 2026" ou "2026". */
  periodLabel: string;
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  today: IsoDate;
  onCreate: () => void;
  onManageAccounts: () => void;
}

export function TransactionsView({
  data,
  periodLabel,
  filters,
  onFiltersChange,
  today,
  onCreate,
  onManageAccounts,
  ...handlers
}: TransactionsViewProps) {
  if (data.accounts.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Cadastre sua primeira conta"
        description="Todo lançamento pertence a uma conta (ex.: C6, Nubank, Carteira). Depois é só registrar as entradas e saídas."
        action={
          <Button onClick={onManageAccounts}>
            <Plus aria-hidden="true" />
            Nova conta
          </Button>
        }
        className="py-16"
      />
    );
  }

  if (data.transactions.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title={`Nenhum lançamento em ${periodLabel}`}
        description="Registre entradas e saídas para acompanhar o mês."
        action={
          <Button onClick={onCreate}>
            <Plus aria-hidden="true" />
            Novo lançamento
          </Button>
        }
        className="py-16"
      />
    );
  }

  const accounts = indexById(data.accounts);
  const categories = indexById(data.categories);
  const visible = filterTransactions(data.transactions, filters, { accounts, categories });
  const summary = summarizeTransactions(visible);

  return (
    <div className="grid gap-4">
      <TransactionFiltersBar
        filters={filters}
        onChange={onFiltersChange}
        accounts={data.accounts}
        categories={data.categories}
      />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        <span className="font-mono font-medium text-foreground tabular">{visible.length}</span>{" "}
        {visible.length === 1 ? "lançamento" : "lançamentos"}
        {" · "}
        Entradas <Amount value={summary.income} className="text-success" />
        {" · "}
        Saídas <Amount value={summary.expenses} />
        {" · "}
        Resultado <Amount value={summary.net} className={balanceToneClass(summary.net)} />
      </p>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhum lançamento encontrado"
          description="Ajuste a busca ou os filtros."
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onFiltersChange(DEFAULT_TRANSACTION_FILTERS);
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <div className="@container">
          <TransactionList
            transactions={visible}
            accounts={accounts}
            categories={categories}
            today={today}
            {...handlers}
          />
        </div>
      )}
    </div>
  );
}

function Amount({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("font-mono font-medium text-foreground tabular", className)}>
      {formatCents(value)}
    </span>
  );
}
