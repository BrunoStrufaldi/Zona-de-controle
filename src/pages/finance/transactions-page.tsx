import { ArrowLeftRight, FileUp, Landmark, Plus, Tags } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { NEW_TRANSACTION_PARAM } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { Button } from "@/components/ui/button";
import { AccountsDialog } from "@/features/finance/components/accounts-dialog";
import { ConfirmDeleteDialog } from "@/features/finance/components/confirm-delete-dialog";
import { FinanceCategoriesDialog } from "@/features/finance/components/finance-categories-dialog";
import { ImportDialog } from "@/features/finance/components/import-dialog";
import { PeriodNavigator } from "@/features/finance/components/period-navigator";
import {
  TransactionFormDialog,
  type TransactionFormMode,
} from "@/features/finance/components/transaction-form-dialog";
import { TransactionsView } from "@/features/finance/components/transactions-view";
import { DEFAULT_TRANSACTION_FILTERS } from "@/features/finance/domain/filters";
import { statusLabel } from "@/features/finance/domain/labels";
import {
  defaultDateFor,
  monthOf,
  periodContains,
  periodLabel,
  periodRange,
  type FinancePeriod,
} from "@/features/finance/domain/period";
import { useTransactions } from "@/features/finance/hooks/use-finance";
import { type Transaction, type TransactionInput } from "@/features/finance/types";
import { toIsoDate } from "@/lib/dates";
import { formatCents, formatDate } from "@/lib/format";
import { toServiceError } from "@/services/tauri/errors";

function notifyError(title: string, error: unknown) {
  toast.error(title, { description: toServiceError(error).message });
}

export function TransactionsPage() {
  const today = toIsoDate(new Date());
  const [period, setPeriod] = useState<FinancePeriod>({ kind: "month", month: monthOf(today) });
  const { resource, actions } = useTransactions(periodRange(period));
  const [filters, setFilters] = useState(DEFAULT_TRANSACTION_FILTERS);
  const [formMode, setFormMode] = useState<TransactionFormMode | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const loaded = resource.status === "success" ? resource.data : null;
  const hasAccounts = (loaded?.accounts.length ?? 0) > 0;
  const createRequested = searchParams.get(NEW_TRANSACTION_PARAM) === "1";
  const createMode: TransactionFormMode = { kind: "create", date: defaultDateFor(period, today) };
  const activeForm = formMode ?? (createRequested && hasAccounts ? createMode : null);

  const closeForm = () => {
    setFormMode(null);
    if (createRequested) {
      setSearchParams(
        (params) => {
          params.delete(NEW_TRANSACTION_PARAM);
          return params;
        },
        { replace: true },
      );
    }
  };

  // Erros sobem para o formulário, que os exibe sem fechar.
  const submitForm = async (input: TransactionInput) => {
    const saved =
      activeForm?.kind === "edit"
        ? await actions.update(activeForm.transaction.id, input)
        : await actions.create(input);
    toast.success(activeForm?.kind === "edit" ? "Lançamento atualizado" : "Lançamento criado", {
      description: periodContains(period, saved.date)
        ? `“${saved.description}” · ${formatCents(saved.amount)}`
        : `“${saved.description}” foi para ${formatDate(saved.date)}, fora do período exibido.`,
    });
    closeForm();
  };

  const confirmDelete = async (transaction: Transaction) => {
    try {
      await actions.remove(transaction.id);
      toast.success("Lançamento excluído", { description: `“${transaction.description}”` });
    } catch (error) {
      notifyError("Não foi possível excluir o lançamento", error);
    } finally {
      setDeleting(null);
    }
  };

  const toggleStatus = (transaction: Transaction) => {
    const status = transaction.status === "paid" ? "pending" : "paid";
    actions
      .setStatus(transaction.id, status)
      .then(() => {
        toast.success(`Marcado como ${statusLabel(transaction.kind, status).toLowerCase()}`, {
          description: `“${transaction.description}”`,
        });
      })
      .catch((error: unknown) => {
        notifyError("Não foi possível atualizar o lançamento", error);
      });
  };

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description="Entradas e saídas das suas contas, com categoria, tags e status."
        icon={ArrowLeftRight}
        actions={
          loaded && (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setAccountsOpen(true);
                }}
              >
                <Landmark aria-hidden="true" />
                Contas
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setCategoriesOpen(true);
                }}
              >
                <Tags aria-hidden="true" />
                Categorias
              </Button>
              {hasAccounts && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setImportOpen(true);
                  }}
                >
                  <FileUp aria-hidden="true" />
                  Importar
                </Button>
              )}
              {hasAccounts && (
                <Button
                  onClick={() => {
                    setFormMode(createMode);
                  }}
                >
                  <Plus aria-hidden="true" />
                  Novo lançamento
                </Button>
              )}
            </>
          )
        }
      />

      <PeriodNavigator period={period} onChange={setPeriod} today={today} allowYear />

      <ResourceView resource={resource} loadingLabel="Carregando lançamentos…">
        {(data) => (
          <TransactionsView
            data={data}
            periodLabel={periodLabel(period)}
            filters={filters}
            onFiltersChange={setFilters}
            today={today}
            onCreate={() => {
              setFormMode(createMode);
            }}
            onManageAccounts={() => {
              setAccountsOpen(true);
            }}
            onEdit={(transaction) => {
              setFormMode({ kind: "edit", transaction });
            }}
            onToggleStatus={toggleStatus}
            onDelete={setDeleting}
          />
        )}
      </ResourceView>

      <TransactionFormDialog
        mode={activeForm}
        accounts={loaded?.accounts ?? []}
        categories={loaded?.categories ?? []}
        tagSuggestions={loaded?.tags ?? []}
        onSubmit={submitForm}
        onClose={closeForm}
      />
      <AccountsDialog
        open={accountsOpen}
        accounts={loaded?.accounts ?? []}
        onSave={async (id, input) => {
          const saved = await actions.saveAccount(id, input);
          toast.success(id === null ? "Conta criada" : "Conta atualizada", {
            description: `“${saved.name}”`,
          });
        }}
        onDelete={async (account) => {
          try {
            await actions.removeAccount(account.id);
            toast.success("Conta excluída", { description: `“${account.name}”` });
          } catch (error) {
            notifyError("Não foi possível excluir a conta", error);
          }
        }}
        onClose={() => {
          setAccountsOpen(false);
        }}
      />
      <ImportDialog
        open={importOpen}
        accounts={loaded?.accounts ?? []}
        categories={loaded?.categories ?? []}
        onPreview={actions.previewImport}
        onImport={actions.importStatement}
        onImported={(result, preview) => {
          toast.success(
            result.added === 1
              ? "1 lançamento importado"
              : `${result.added} lançamentos importados`,
            {
              description: `${preview.fileName}: ${result.duplicates} já existiam, ${result.skipped} ficaram de fora${result.linked > 0 ? `, ${result.linked} pagaram recorrentes` : ""}.`,
            },
          );
        }}
        onClose={() => {
          setImportOpen(false);
        }}
      />
      <FinanceCategoriesDialog
        open={categoriesOpen}
        categories={loaded?.categories ?? []}
        onCreate={async (input) => {
          const saved = await actions.createCategory(input);
          toast.success("Categoria criada", { description: `“${saved.name}”` });
        }}
        onUpdate={async (id, input) => {
          const saved = await actions.updateCategory(id, input);
          toast.success("Categoria atualizada", { description: `“${saved.name}”` });
        }}
        onDelete={async (category) => {
          try {
            await actions.removeCategory(category.id);
            toast.success("Categoria excluída", { description: `“${category.name}”` });
          } catch (error) {
            notifyError("Não foi possível excluir a categoria", error);
          }
        }}
        onClose={() => {
          setCategoriesOpen(false);
        }}
      />
      <ConfirmDeleteDialog
        item={deleting}
        title="Excluir lançamento?"
        describe={(transaction) => (
          <>
            O lançamento <strong className="text-foreground">“{transaction.description}”</strong> de{" "}
            {formatCents(transaction.amount)} em {formatDate(transaction.date)} será excluído
            permanentemente, junto com suas tags.
            {transaction.recurringId !== null &&
              " O vencimento da recorrente paga por ele volta a ficar em aberto."}
          </>
        )}
        confirmLabel="Excluir lançamento"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      />
    </>
  );
}
