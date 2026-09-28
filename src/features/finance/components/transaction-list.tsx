import {
  ArrowLeftRight,
  ArrowRight,
  CircleCheck,
  CircleDashed,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";

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
  categoryDotClass,
} from "@/features/finance/components/finance-styles";
import { isOverdue } from "@/features/finance/domain/cashflow";
import { NO_CATEGORY_LABEL, statusLabel } from "@/features/finance/domain/labels";
import {
  type FinanceAccount,
  type FinanceCategory,
  type Transaction,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate, formatDayMonth } from "@/lib/format";
import { type IsoDate } from "@/types/common";

export interface TransactionItemHandlers {
  onEdit: (transaction: Transaction) => void;
  onToggleStatus: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

interface TransactionListProps extends TransactionItemHandlers {
  /** Já filtrados e ordenados. */
  transactions: readonly Transaction[];
  accounts: ReadonlyMap<number, FinanceAccount>;
  categories: ReadonlyMap<number, FinanceCategory>;
  today: IsoDate;
}

export function TransactionList({
  transactions,
  accounts,
  categories,
  today,
  ...handlers
}: TransactionListProps) {
  return (
    <ul className="grid gap-2" aria-label="Lançamentos">
      {transactions.map((transaction) => (
        <TransactionRow
          key={transaction.id}
          transaction={transaction}
          account={accounts.get(transaction.accountId)}
          target={
            transaction.transferAccountId === null
              ? undefined
              : accounts.get(transaction.transferAccountId)
          }
          category={
            transaction.categoryId === null ? undefined : categories.get(transaction.categoryId)
          }
          today={today}
          {...handlers}
        />
      ))}
    </ul>
  );
}

interface TransactionRowProps extends TransactionItemHandlers {
  transaction: Transaction;
  account: FinanceAccount | undefined;
  /** Conta de destino da transferência. */
  target: FinanceAccount | undefined;
  category: FinanceCategory | undefined;
  today: IsoDate;
}

function TransactionRow({
  transaction,
  account,
  target,
  category,
  today,
  onEdit,
  onToggleStatus,
  onDelete,
}: TransactionRowProps) {
  const pending = transaction.status === "pending";
  const overdue = isOverdue(transaction, today);
  const nextStatus = pending ? "paid" : "pending";
  const StatusIcon = pending ? CircleDashed : CircleCheck;

  return (
    <li className="flex animate-fade-in items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors duration-150 hover:border-border-strong">
      <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular">
        {formatDayMonth(transaction.date)}
      </span>

      <div className="grid min-w-0 flex-1 gap-1">
        <button
          type="button"
          onClick={() => {
            onEdit(transaction);
          }}
          className="cursor-pointer truncate text-left text-sm font-medium transition-colors hover:text-primary"
        >
          {transaction.description}
        </button>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {transaction.kind === "transfer" ? (
            <Badge variant="info">
              <ArrowLeftRight aria-hidden="true" />
              Transferência
            </Badge>
          ) : category ? (
            <Badge className={categoryBadgeClass[category.color]}>{category.name}</Badge>
          ) : (
            <Badge variant="outline">{NO_CATEGORY_LABEL}</Badge>
          )}
          {transaction.installment && (
            <Badge
              variant="outline"
              aria-label={`Parcela ${transaction.installment.number} de ${transaction.installment.count}`}
            >
              {transaction.installment.number}/{transaction.installment.count}
            </Badge>
          )}
          {account && <AccountName account={account} />}
          {target && (
            <>
              <ArrowRight className="size-3" aria-label="para" />
              <AccountName account={target} />
            </>
          )}
          {transaction.purchaseDate && (
            <span>compra em {formatDate(transaction.purchaseDate)}</span>
          )}
          {transaction.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-7 shrink-0 px-2",
          pending ? (overdue ? "text-danger" : "text-warning") : "text-success",
        )}
        aria-label={`${statusLabel(transaction.kind, transaction.status)}${overdue ? " (atrasado)" : ""}: marcar “${transaction.description}” como ${statusLabel(transaction.kind, nextStatus).toLowerCase()}`}
        title={`Marcar como ${statusLabel(transaction.kind, nextStatus).toLowerCase()}`}
        onClick={() => {
          onToggleStatus(transaction);
        }}
      >
        <StatusIcon aria-hidden="true" />
        <span className="hidden @xl:inline">
          {overdue ? "Atrasado" : statusLabel(transaction.kind, transaction.status)}
        </span>
      </Button>

      <span
        className={cn(
          "w-32 shrink-0 text-right font-mono text-sm font-semibold tabular",
          amountToneClass[transaction.kind],
          pending && "opacity-70",
        )}
      >
        {amountSign[transaction.kind]} {formatCents(transaction.amount)}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações do lançamento “${transaction.description}”`}
            className="shrink-0"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            onSelect={() => {
              onEdit(transaction);
            }}
          >
            <Pencil aria-hidden="true" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              onToggleStatus(transaction);
            }}
          >
            <StatusIcon aria-hidden="true" />
            Marcar como {statusLabel(transaction.kind, nextStatus).toLowerCase()}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-danger focus:text-danger [&_svg]:text-danger"
            onSelect={() => {
              onDelete(transaction);
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

function AccountName({ account }: { account: FinanceAccount }) {
  return (
    <span className="flex items-center gap-1">
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", categoryDotClass[account.color])}
      />
      {account.name}
    </span>
  );
}
