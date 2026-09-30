import { ArrowLeftRight, ArrowRight, MoreHorizontal, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  amountSign,
  amountToneClass,
  categoryBadgeClass,
} from "@/features/finance/components/finance-styles";
import { NO_CATEGORY_LABEL } from "@/features/finance/domain/labels";
import { describeSchedule } from "@/features/finance/domain/recurring";
import {
  type FinanceAccount,
  type FinanceCategory,
  type RecurringSeries,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate } from "@/lib/format";

interface SeriesListProps {
  /** Já na ordem do Rust (ativas pelo próximo vencimento, encerradas no fim). */
  series: readonly RecurringSeries[];
  accounts: ReadonlyMap<number, FinanceAccount>;
  categories: ReadonlyMap<number, FinanceCategory>;
  onEdit: (series: RecurringSeries) => void;
  onDelete: (series: RecurringSeries) => void;
}

export function SeriesList({ series, accounts, categories, onEdit, onDelete }: SeriesListProps) {
  return (
    <ul className="grid gap-2" aria-label="Recorrentes">
      {series.map((item) => (
        <SeriesRow
          key={item.id}
          series={item}
          account={accounts.get(item.accountId)}
          target={
            item.transferAccountId === null ? undefined : accounts.get(item.transferAccountId)
          }
          category={item.categoryId === null ? undefined : categories.get(item.categoryId)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

interface SeriesRowProps {
  series: RecurringSeries;
  account: FinanceAccount | undefined;
  target: FinanceAccount | undefined;
  category: FinanceCategory | undefined;
  onEdit: (series: RecurringSeries) => void;
  onDelete: (series: RecurringSeries) => void;
}

function SeriesRow({ series, account, target, category, onEdit, onDelete }: SeriesRowProps) {
  const monthly = series.recurrence.frequency === "monthly" && series.recurrence.interval === 1;

  return (
    <li
      className={cn(
        "flex animate-fade-in items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors duration-150 hover:border-border-strong",
        series.ended && "opacity-60",
      )}
    >
      <div className="grid min-w-0 flex-1 gap-1">
        <button
          type="button"
          onClick={() => {
            onEdit(series);
          }}
          className="cursor-pointer truncate text-left text-sm font-medium transition-colors hover:text-primary"
        >
          {series.description}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {series.kind === "transfer" ? (
            <Badge variant="info">
              <ArrowLeftRight aria-hidden="true" />
              Transferência
            </Badge>
          ) : category ? (
            <Badge className={categoryBadgeClass[category.color]}>{category.name}</Badge>
          ) : (
            <Badge variant="outline">{NO_CATEGORY_LABEL}</Badge>
          )}
          {account && <span>{account.name}</span>}
          {target && (
            <>
              <ArrowRight className="size-3" aria-label="para" />
              <span>{target.name}</span>
            </>
          )}
          <span>· {describeSchedule(series.recurrence, series.startDate)}</span>
          {series.nextDate && <span>· próximo em {formatDate(series.nextDate)}</span>}
          {series.overdueCount > 0 && (
            <Badge variant="danger">
              {series.overdueCount === 1 ? "1 atrasado" : `${series.overdueCount} atrasados`}
            </Badge>
          )}
          {series.ended && series.lastDate && (
            <Badge variant="default">Encerrada em {formatDate(series.lastDate)}</Badge>
          )}
          {series.endsSoon && series.lastDate && (
            <Badge variant="warning">Termina em {formatDate(series.lastDate)}: renovar?</Badge>
          )}
        </div>
      </div>

      <div className="grid w-36 shrink-0 justify-items-end gap-0.5">
        <span
          className={cn("font-mono text-sm font-semibold tabular", amountToneClass[series.kind])}
        >
          {amountSign[series.kind]} {formatCents(series.amount)}
        </span>
        {!monthly && (
          <span className="font-mono text-xs text-muted-foreground tabular">
            ≈ {formatCents(series.monthlyAmount)}/mês
          </span>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações da recorrente “${series.description}”`}
            className="shrink-0"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              onEdit(series);
            }}
          >
            <Pencil aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger focus:text-danger [&_svg]:text-danger"
            onSelect={() => {
              onDelete(series);
            }}
          >
            <Trash2 aria-hidden="true" />
            Excluir…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
