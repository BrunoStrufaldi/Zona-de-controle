import { ArrowRight, ChartColumn, ChartPie, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { newTransactionHref, paths } from "@/app/router/paths";
import { PageHeader } from "@/components/shared/page-header";
import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { AccountsCard } from "@/features/finance/components/accounts-card";
import { AccountsDialog } from "@/features/finance/components/accounts-dialog";
import { CashflowChart, CashflowLegend } from "@/features/finance/components/cashflow-chart";
import { CategoryBreakdownCard } from "@/features/finance/components/category-breakdown-card";
import { FinanceMetrics } from "@/features/finance/components/finance-metrics";
import { PeriodNavigator } from "@/features/finance/components/period-navigator";
import { categoryShares } from "@/features/finance/domain/categories";
import { indexById } from "@/features/finance/domain/filters";
import { monthOf, periodLabel } from "@/features/finance/domain/period";
import { useFinanceOverview } from "@/features/finance/hooks/use-finance";
import { type YearMonth } from "@/features/finance/types";
import { toIsoDate } from "@/lib/dates";
import { toServiceError } from "@/services/tauri/errors";

export function FinanceOverviewPage() {
  const today = toIsoDate(new Date());
  const [month, setMonth] = useState<YearMonth>(monthOf(today));
  const { resource, actions } = useFinanceOverview(month);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const loaded = resource.status === "success" ? resource.data : null;
  const period = { kind: "month", month } as const;

  return (
    <>
      <PageHeader
        title="Visão Geral"
        description="Receita, despesas, saldo e economia do mês, com o saldo de cada conta."
        icon={ChartPie}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to={paths.finance.transactions}>
                Lançamentos
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild>
              <Link to={newTransactionHref}>
                <Plus aria-hidden="true" />
                Novo lançamento
              </Link>
            </Button>
          </>
        }
      />

      <PeriodNavigator
        period={period}
        onChange={(next) => {
          if (next.kind === "month") setMonth(next.month);
        }}
        today={today}
      />

      <ResourceView resource={resource} loadingLabel="Carregando finanças…">
        {(data) => (
          <div className="@container">
            <div className="grid gap-6 @3xl:grid-cols-2">
              <WidgetCard title={`Resumo de ${periodLabel(period)}`} icon={Wallet}>
                <FinanceMetrics totals={data.overview.totals} />
              </WidgetCard>
              <AccountsCard
                accounts={data.accounts}
                onManage={() => {
                  setAccountsOpen(true);
                }}
              />
              <WidgetCard
                title="Receita x despesas · 6 meses"
                icon={ChartColumn}
                headerExtra={<CashflowLegend />}
                className="@3xl:col-span-2"
              >
                <CashflowChart history={data.overview.history} />
              </WidgetCard>
              <CategoryBreakdownCard
                shares={categoryShares(
                  data.overview.expensesByCategory,
                  indexById(data.categories),
                )}
              />
            </div>
          </div>
        )}
      </ResourceView>

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
            toast.error("Não foi possível excluir a conta", {
              description: toServiceError(error).message,
            });
          }
        }}
        onClose={() => {
          setAccountsOpen(false);
        }}
      />
    </>
  );
}
