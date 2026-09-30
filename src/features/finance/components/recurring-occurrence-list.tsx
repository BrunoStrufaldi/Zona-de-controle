import {
  ArrowLeftRight,
  CircleCheck,
  FilePen,
  Link2,
  Link2Off,
  MoreHorizontal,
  SkipForward,
  Undo2,
} from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
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
import { NO_CATEGORY_LABEL, statusLabel } from "@/features/finance/domain/labels";
import {
  isOpen,
  occurrenceKey,
  occurrenceStatusLabel,
  settleLabel,
} from "@/features/finance/domain/recurring";
import {
  type FinanceAccount,
  type FinanceCategory,
  type OccurrenceStatus,
  type RecurringOccurrence,
  type RecurringSeries,
} from "@/features/finance/types";
import { cn } from "@/lib/cn";
import { formatCents, formatDate, formatDayMonth } from "@/lib/format";

/** Ações sobre um vencimento (a série vem junto para montar o lançamento). */
export interface OccurrenceHandlers {
  /** Registra com os dados da série, pago, na data do vencimento. */
  onSettle: (series: RecurringSeries, occurrence: RecurringOccurrence) => void;
  /** Abre o formulário de lançamento já preenchido. */
  onRegister: (series: RecurringSeries, occurrence: RecurringOccurrence) => void;
  onLink: (series: RecurringSeries, occurrence: RecurringOccurrence) => void;
  onSkip: (series: RecurringSeries, occurrence: RecurringOccurrence) => void;
  /** Desfaz o vínculo ou o pulo. */
  onReopen: (series: RecurringSeries, occurrence: RecurringOccurrence) => void;
  /** Marca como pago o lançamento vinculado que ainda está pendente. */
  onMarkPaid: (series: RecurringSeries, occurrence: RecurringOccurrence) => void;
}

interface OccurrenceListProps extends OccurrenceHandlers {
  label: string;
  occurrences: readonly RecurringOccurrence[];
  series: ReadonlyMap<number, RecurringSeries>;
  accounts: ReadonlyMap<number, FinanceAccount>;
  categories: ReadonlyMap<number, FinanceCategory>;
  /** Mostra a data com o ano (atrasados de outros meses). */
  showYear?: boolean;
}

export function OccurrenceList({
  label,
  occurrences,
  series,
  accounts,
  categories,
  showYear = false,
  ...handlers
}: OccurrenceListProps) {
  return (
    <ul className="grid gap-2" aria-label={label}>
      {occurrences.map((occurrence) => {
        const owner = series.get(occurrence.recurringId);
        if (!owner) return null;
        return (
          <OccurrenceRow
            key={occurrenceKey(occurrence)}
            occurrence={occurrence}
            series={owner}
            account={accounts.get(owner.accountId)}
            category={owner.categoryId === null ? undefined : categories.get(owner.categoryId)}
            showYear={showYear}
            {...handlers}
          />
        );
      })}
    </ul>
  );
}

const statusVariant: Record<OccurrenceStatus, BadgeProps["variant"]> = {
  open: "outline",
  overdue: "danger",
  pending: "warning",
  paid: "success",
  skipped: "default",
  awaiting_statement: "default",
};

interface OccurrenceRowProps extends OccurrenceHandlers {
  occurrence: RecurringOccurrence;
  series: RecurringSeries;
  account: FinanceAccount | undefined;
  category: FinanceCategory | undefined;
  showYear: boolean;
}

function OccurrenceRow({
  occurrence,
  series,
  account,
  category,
  showYear,
  onSettle,
  onRegister,
  onLink,
  onSkip,
  onReopen,
  onMarkPaid,
}: OccurrenceRowProps) {
  const open = isOpen(occurrence);
  const linked = occurrence.transactionId !== null;
  // No cartão a cobrança é da fatura: sem "Pagar" nem "Marcar como pago".
  const settle = open && !series.onCard;
  const unpaid = linked && occurrence.status !== "paid" && !series.onCard;
  const skipped = occurrence.status === "skipped";
  const name = `“${series.description}” de ${formatDate(occurrence.occurrenceDate)}`;

  return (
    <li
      className={cn(
        "flex animate-fade-in items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 transition-colors duration-150 hover:border-border-strong",
        skipped && "opacity-60",
      )}
    >
      <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground tabular">
        {showYear
          ? formatDate(occurrence.occurrenceDate)
          : formatDayMonth(occurrence.occurrenceDate)}
      </span>

      <div className="grid min-w-0 flex-1 gap-1">
        <span className="truncate text-sm font-medium">{series.description}</span>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant={statusVariant[occurrence.status]}>
            {occurrenceStatusLabel(occurrence.status, series)}
          </Badge>
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
          {occurrence.statementDate && (
            <span>fatura de {formatDate(occurrence.statementDate)}</span>
          )}
          {linked && occurrence.transactionDate && (
            <span>
              lançamento de {formatDate(occurrence.transactionDate)}
              {unpaid ? " (pendente)" : ""}
            </span>
          )}
        </div>
      </div>

      <span
        className={cn(
          "w-32 shrink-0 text-right font-mono text-sm font-semibold tabular",
          amountToneClass[series.kind],
          !linked && "opacity-70",
        )}
      >
        {amountSign[series.kind]} {formatCents(occurrence.amount)}
      </span>

      <div className="flex w-28 shrink-0 justify-end">
        {settle && (
          <Button
            size="sm"
            variant="secondary"
            className="h-7 px-2"
            aria-label={`${settleLabel(series.kind)} ${name}`}
            title="Registra o lançamento pago na data do vencimento"
            onClick={() => {
              onSettle(series, occurrence);
            }}
          >
            <CircleCheck aria-hidden="true" />
            {settleLabel(series.kind)}
          </Button>
        )}
        {unpaid && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-warning"
            aria-label={`Marcar ${name} como ${statusLabel(series.kind, "paid").toLowerCase()}`}
            onClick={() => {
              onMarkPaid(series, occurrence);
            }}
          >
            <CircleCheck aria-hidden="true" />
            {statusLabel(series.kind, "paid")}
          </Button>
        )}
        {skipped && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label={`Desfazer o pulo de ${name}`}
            onClick={() => {
              onReopen(series, occurrence);
            }}
          >
            <Undo2 aria-hidden="true" />
            Desfazer
          </Button>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ações do vencimento ${name}`}
            className="shrink-0"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {open && (
            <>
              <DropdownMenuItem
                onSelect={() => {
                  onRegister(series, occurrence);
                }}
              >
                <FilePen aria-hidden="true" />
                {series.onCard
                  ? "Lançar na fatura manualmente…"
                  : "Registrar com outro valor ou data…"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  onLink(series, occurrence);
                }}
              >
                <Link2 aria-hidden="true" />
                Vincular a um lançamento…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  onSkip(series, occurrence);
                }}
              >
                <SkipForward aria-hidden="true" />
                Pular este vencimento
              </DropdownMenuItem>
            </>
          )}
          {linked && (
            <DropdownMenuItem
              onSelect={() => {
                onReopen(series, occurrence);
              }}
            >
              <Link2Off aria-hidden="true" />
              Desvincular do lançamento
            </DropdownMenuItem>
          )}
          {skipped && (
            <DropdownMenuItem
              onSelect={() => {
                onReopen(series, occurrence);
              }}
            >
              <Undo2 aria-hidden="true" />
              Desfazer o pulo
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
