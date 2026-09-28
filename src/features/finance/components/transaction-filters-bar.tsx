import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { categoryDotClass } from "@/features/finance/components/finance-styles";
import { categoriesOfKind } from "@/features/finance/domain/categories";
import {
  type CategoryFilter,
  DEFAULT_TRANSACTION_FILTERS,
  hasActiveFilters,
  type TransactionFilters,
} from "@/features/finance/domain/filters";
import { transactionKindLabels } from "@/features/finance/domain/labels";
import {
  TRANSACTION_KINDS,
  type FinanceAccount,
  type FinanceCategory,
  type TransactionKind,
  type TransactionStatus,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";

interface TransactionFiltersBarProps {
  filters: TransactionFilters;
  onChange: (filters: TransactionFilters) => void;
  accounts: readonly FinanceAccount[];
  categories: readonly FinanceCategory[];
}

export function TransactionFiltersBar({
  filters,
  onChange,
  accounts,
  categories,
}: TransactionFiltersBarProps) {
  const update = (patch: Partial<TransactionFilters>) => {
    onChange({ ...filters, ...patch });
  };
  // Com um tipo escolhido, só as categorias dele.
  const visibleCategories =
    filters.kind === "all" ? categories : categoriesOfKind(categories, filters.kind);

  return (
    <div className="grid gap-2" role="search" aria-label="Filtrar lançamentos">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground"
            aria-hidden="true"
          />
          <Input
            value={filters.search}
            onChange={(event) => {
              update({ search: event.target.value });
            }}
            placeholder="Buscar por descrição, tag, categoria ou conta…"
            aria-label="Buscar lançamentos"
            className="pl-9"
          />
        </div>

        <Select
          value={filters.kind}
          onValueChange={(value) => {
            const kind = value as TransactionKind | "all";
            // A categoria escolhida pode não existir no novo tipo.
            const keepCategory =
              typeof filters.category !== "number" ||
              kind === "all" ||
              categories.some((c) => c.id === filters.category && c.kind === kind);
            update({ kind, category: keepCategory ? filters.category : "all" });
          }}
        >
          <SelectTrigger className="w-48" aria-label="Filtrar por tipo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Entradas e saídas</SelectItem>
            {TRANSACTION_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {transactionKindLabels[kind]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) => {
            update({ status: value as TransactionStatus | "all" });
          }}
        >
          <SelectTrigger className="w-44" aria-label="Filtrar por status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer status</SelectItem>
            <SelectItem value="paid">Pago/recebido</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(filters.category)}
          onValueChange={(value) => {
            update({ category: parseCategoryFilter(value) });
          }}
        >
          <SelectTrigger className="w-52" aria-label="Filtrar por categoria">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            <SelectItem value="none">Sem categoria</SelectItem>
            {visibleCategories.map((category) => (
              <SelectItem key={category.id} value={String(category.id)}>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mr-2 inline-block size-2 rounded-full align-middle",
                    categoryDotClass[category.color],
                  )}
                />
                {category.name}
                {filters.kind === "all" && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({transactionKindLabels[category.kind].toLowerCase()})
                  </span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {accounts.length > 1 && (
          <Select
            value={String(filters.accountId)}
            onValueChange={(value) => {
              update({ accountId: value === "all" ? "all" : Number(value) });
            }}
          >
            <SelectTrigger className="w-44" aria-label="Filtrar por conta">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={String(account.id)}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-1.5">
          <Input
            value={filters.minAmount}
            onChange={(event) => {
              update({ minAmount: event.target.value });
            }}
            inputMode="decimal"
            placeholder="Valor mín."
            aria-label="Valor mínimo"
            className="w-28 font-mono tabular"
          />
          <span className="text-xs text-muted-foreground" aria-hidden="true">
            a
          </span>
          <Input
            value={filters.maxAmount}
            onChange={(event) => {
              update({ maxAmount: event.target.value });
            }}
            inputMode="decimal"
            placeholder="Valor máx."
            aria-label="Valor máximo"
            className="w-28 font-mono tabular"
          />
        </div>

        {hasActiveFilters(filters) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(DEFAULT_TRANSACTION_FILTERS);
            }}
          >
            <X aria-hidden="true" />
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}

function parseCategoryFilter(value: string): CategoryFilter {
  return value === "all" || value === "none" ? value : Number(value);
}
