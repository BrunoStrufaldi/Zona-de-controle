import { Plus, Repeat } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteDialog } from "@/features/finance/components/confirm-delete-dialog";
import {
  type LinkTarget,
  LinkTransactionDialog,
} from "@/features/finance/components/link-transaction-dialog";
import { PeriodNavigator } from "@/features/finance/components/period-navigator";
import {
  RecurringFormDialog,
  type RecurringFormMode,
} from "@/features/finance/components/recurring-form-dialog";
import { RecurringView } from "@/features/finance/components/recurring-view";
import {
  TransactionFormDialog,
  type TransactionFormMode,
} from "@/features/finance/components/transaction-form-dialog";
import { indexById } from "@/features/finance/domain/filters";
import { statusLabel } from "@/features/finance/domain/labels";
import { defaultDateFor, monthOf, monthRange, periodLabel } from "@/features/finance/domain/period";
import { occurrenceDraft, occurrenceTransaction } from "@/features/finance/domain/recurring";
import { useRecurring } from "@/features/finance/hooks/use-finance";
import {
  type OccurrenceRef,
  type RecurringOccurrence,
  type RecurringSeries,
  type YearMonth,
} from "@/features/finance/types";
import { toIsoDate } from "@/lib/dates";
import { formatCents, formatDate } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

/** Nome do vencimento nas mensagens: “Aluguel” de 05/10/2026. */
function occurrenceName(series: RecurringSeries, occurrence: OccurrenceRef): string {
  return `“${series.description}” de ${formatDate(occurrence.occurrenceDate)}`;
}

export function RecurringPage() {
  const today = toIsoDate(new Date());
  const [month, setMonth] = useState<YearMonth>(monthOf(today));
  const period = { kind: "month", month } as const;
  const { resource, actions } = useRecurring(monthRange(month));
  const [formMode, setFormMode] = useState<RecurringFormMode | null>(null);
  const [deleting, setDeleting] = useState<RecurringSeries | null>(null);
  const [registering, setRegistering] = useState<{
    mode: TransactionFormMode;
    occurrence: RecurringOccurrence;
  } | null>(null);
  const [linking, setLinking] = useState<LinkTarget | null>(null);

  const loaded = resource.status === "success" ? resource.data : null;
  const hasAccounts = (loaded?.accounts.length ?? 0) > 0;
  const openCreate = () => {
    setFormMode({ kind: "create", startDate: defaultDateFor(period, today) });
  };

  const run = (
    action: Promise<unknown>,
    success: { title: string; description: string },
    failure: string,
    undo?: () => void,
  ) => {
    action
      .then(() => {
        toast.success(success.title, {
          description: success.description,
          ...(undo ? { action: { label: "Desfazer", onClick: undo } } : {}),
        });
      })
      .catch((error: unknown) => {
        notifyError(failure, error);
      });
  };

  const reopen = (series: RecurringSeries, occurrence: OccurrenceRef) => {
    run(
      actions.reopen(occurrence),
      { title: "Vencimento em aberto de novo", description: occurrenceName(series, occurrence) },
      "Não foi possível reabrir o vencimento",
    );
  };

  return (
    <>
      <PageHeader
        title="Recorrentes"
        description="Contas fixas e receitas que se repetem: o que vence no mês, o que já foi pago e o que atrasou."
        icon={Repeat}
        actions={
          hasAccounts && (
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" />
              Nova recorrente
            </Button>
          )
        }
      />

      <PeriodNavigator
        period={period}
        onChange={(next) => {
          if (next.kind === "month") setMonth(next.month);
        }}
        today={today}
      />

      <ResourceView resource={resource} loadingLabel="Carregando recorrentes…">
        {(data) => (
          <RecurringView
            data={data}
            periodLabel={periodLabel(period)}
            onCreate={openCreate}
            onEdit={(series) => {
              setFormMode({ kind: "edit", series });
            }}
            onDelete={setDeleting}
            onSettle={(series, occurrence) => {
              const input = occurrenceTransaction(series, occurrence);
              run(
                actions.register(occurrence, input),
                {
                  title: `Registrado como ${statusLabel(series.kind, "paid").toLowerCase()}`,
                  description: `${occurrenceName(series, occurrence)} · ${formatCents(input.amount)}`,
                },
                "Não foi possível registrar o vencimento",
              );
            }}
            onRegister={(series, occurrence) => {
              setRegistering({
                occurrence,
                mode: {
                  kind: "register",
                  draft: occurrenceDraft(series, occurrence),
                  title: occurrenceName(series, occurrence),
                },
              });
            }}
            onLink={(series, occurrence) => {
              setLinking({ series, occurrence });
            }}
            onSkip={(series, occurrence) => {
              run(
                actions.skip(occurrence),
                { title: "Vencimento pulado", description: occurrenceName(series, occurrence) },
                "Não foi possível pular o vencimento",
                () => {
                  reopen(series, occurrence);
                },
              );
            }}
            onReopen={reopen}
            onMarkPaid={(series, occurrence) => {
              if (occurrence.transactionId === null) return;
              run(
                actions.setTransactionStatus(occurrence.transactionId, "paid"),
                {
                  title: `Marcado como ${statusLabel(series.kind, "paid").toLowerCase()}`,
                  description: occurrenceName(series, occurrence),
                },
                "Não foi possível atualizar o lançamento",
              );
            }}
          />
        )}
      </ResourceView>

      <RecurringFormDialog
        mode={formMode}
        accounts={loaded?.accounts ?? []}
        categories={loaded?.categories ?? []}
        onSubmit={async (input) => {
          const id = formMode?.kind === "edit" ? formMode.series.id : null;
          const saved = await actions.save(id, input);
          toast.success(id === null ? "Recorrente criada" : "Recorrente atualizada", {
            description: saved.nextDate
              ? `“${saved.description}” · próximo vencimento em ${formatDate(saved.nextDate)}`
              : `“${saved.description}”`,
          });
          setFormMode(null);
        }}
        onClose={() => {
          setFormMode(null);
        }}
      />
      <TransactionFormDialog
        mode={registering?.mode ?? null}
        accounts={loaded?.accounts ?? []}
        categories={loaded?.categories ?? []}
        tagSuggestions={loaded?.tags ?? []}
        onSubmit={async (input) => {
          if (!registering) return;
          const saved = await actions.register(registering.occurrence, input);
          toast.success("Vencimento registrado", {
            description: `“${saved.description}” · ${formatCents(saved.amount)} em ${formatDate(saved.date)}`,
          });
          setRegistering(null);
        }}
        onClose={() => {
          setRegistering(null);
        }}
      />
      <LinkTransactionDialog
        target={linking}
        accounts={indexById(loaded?.accounts ?? [])}
        loadTransactions={actions.loadTransactions}
        onLink={async (target, transaction) => {
          await actions.link(target.occurrence, transaction.id);
          toast.success("Lançamento vinculado", {
            description: `“${transaction.description}” → ${occurrenceName(target.series, target.occurrence)}`,
          });
          setLinking(null);
        }}
        onClose={() => {
          setLinking(null);
        }}
      />
      <ConfirmDeleteDialog
        item={deleting}
        title="Excluir recorrente?"
        describe={(series) => (
          <>
            A recorrente <strong className="text-foreground">“{series.description}”</strong> de{" "}
            {formatCents(series.amount)} será excluída permanentemente. Os lançamentos já
            registrados continuam em Lançamentos, só sem o vínculo.
          </>
        )}
        confirmLabel="Excluir recorrente"
        onConfirm={async (series) => {
          try {
            await actions.remove(series.id);
            toast.success("Recorrente excluída", { description: `“${series.description}”` });
          } catch (error) {
            notifyError("Não foi possível excluir a recorrente", error);
          } finally {
            setDeleting(null);
          }
        }}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}
