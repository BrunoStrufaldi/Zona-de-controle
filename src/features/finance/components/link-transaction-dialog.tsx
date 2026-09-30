import { Link2 } from "lucide-react";
import { useCallback, useState } from "react";

import { EmptyState } from "@/components/shared/empty-state";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { amountSign } from "@/features/finance/components/finance-styles";
import { type DateRange } from "@/features/finance/domain/period";
import { LINK_WINDOW_DAYS, linkCandidates, linkRange } from "@/features/finance/domain/recurring";
import {
  type FinanceAccount,
  type RecurringOccurrence,
  type RecurringSeries,
  type Transaction,
} from "@/features/finance/types";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { formatCents, formatDate, formatDayMonth } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

export interface LinkTarget {
  series: RecurringSeries;
  occurrence: RecurringOccurrence;
}

interface LinkTransactionDialogProps {
  /** `null` fecha o diálogo. */
  target: LinkTarget | null;
  accounts: ReadonlyMap<number, FinanceAccount>;
  loadTransactions: (range: DateRange) => Promise<Transaction[]>;
  onLink: (target: LinkTarget, transaction: Transaction) => Promise<void>;
  onClose: () => void;
}

/** Escolha de um lançamento já existente para o vencimento (ex.: registrado antes da recorrente). */
export function LinkTransactionDialog({
  target,
  accounts,
  loadTransactions,
  onLink,
  onClose,
}: LinkTransactionDialogProps) {
  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {target && (
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Vincular a um lançamento</DialogTitle>
            <DialogDescription>
              “{target.series.description}” com vencimento em{" "}
              {formatDate(target.occurrence.occurrenceDate)}. Aparecem os lançamentos do mesmo tipo,
              ainda sem vínculo, até {LINK_WINDOW_DAYS} dias antes ou depois.
            </DialogDescription>
          </DialogHeader>
          <Candidates
            key={`${target.series.id}:${target.occurrence.occurrenceDate}`}
            target={target}
            accounts={accounts}
            loadTransactions={loadTransactions}
            onLink={onLink}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

interface CandidatesProps {
  target: LinkTarget;
  accounts: ReadonlyMap<number, FinanceAccount>;
  loadTransactions: (range: DateRange) => Promise<Transaction[]>;
  onLink: (target: LinkTarget, transaction: Transaction) => Promise<void>;
}

function Candidates({ target, accounts, loadTransactions, onLink }: CandidatesProps) {
  const { series, occurrence } = target;
  const load = useCallback(
    () =>
      loadTransactions(linkRange(occurrence.occurrenceDate)).then((transactions) =>
        linkCandidates(transactions, series, occurrence.occurrenceDate),
      ),
    [loadTransactions, series, occurrence.occurrenceDate],
  );
  const candidates = useAsyncResource(load);
  const [linking, setLinking] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const link = async (transaction: Transaction) => {
    setLinking(transaction.id);
    setError(null);
    try {
      await onLink(target, transaction);
    } catch (linkError) {
      setError(toServiceError(linkError).message);
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="grid gap-3">
      <ResourceView resource={candidates} loadingLabel="Procurando lançamentos…" className="py-6">
        {(list) =>
          list.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="Nenhum lançamento para vincular"
              description="Registre o vencimento pela lista ou crie o lançamento em Lançamentos."
              className="py-8"
            />
          ) : (
            <ul className="grid gap-1.5" aria-label="Lançamentos para vincular">
              {list.map((transaction) => (
                <li
                  key={transaction.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground tabular">
                    {formatDayMonth(transaction.date)}
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm">{transaction.description}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {accounts.get(transaction.accountId)?.name}
                      {transaction.status === "pending" ? " · pendente" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular">
                    {amountSign[transaction.kind]} {formatCents(transaction.amount)}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2"
                    disabled={linking !== null}
                    aria-label={`Vincular “${transaction.description}” de ${formatDate(transaction.date)}`}
                    onClick={() => {
                      void link(transaction);
                    }}
                  >
                    <Link2 aria-hidden="true" />
                    {linking === transaction.id ? "Vinculando…" : "Vincular"}
                  </Button>
                </li>
              ))}
            </ul>
          )
        }
      </ResourceView>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}
