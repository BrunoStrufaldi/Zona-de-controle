import { ChartColumn, CircleCheck, FileUp, Info, Layers, Table2, Wallet } from "lucide-react";
import { Link } from "react-router";

import { paths } from "@/app/router/paths";
import { EmptyState } from "@/components/shared/empty-state";
import { WidgetCard } from "@/components/shared/widget-card";
import { Button } from "@/components/ui/button";
import { CommitmentChart, CommitmentLegend } from "@/features/finance/components/commitment-chart";
import { CommitmentTable } from "@/features/finance/components/commitment-table";
import { InstallmentList } from "@/features/finance/components/installment-list";
import { InstallmentsMetrics } from "@/features/finance/components/installments-metrics";
import { indexById } from "@/features/finance/domain/filters";
import { type InstallmentsData } from "@/features/finance/hooks/use-finance";

export function InstallmentsView({ data }: { data: InstallmentsData }) {
  const { installments } = data;
  const accounts = indexById(data.accounts);
  const categories = indexById(data.categories);
  const active = installments.purchases.filter((purchase) => !purchase.finished);
  const finished = installments.purchases.filter((purchase) => purchase.finished);
  const missingCycle = installments.cardsWithoutCycle
    .map((id) => accounts.get(id)?.name)
    .filter((name) => name !== undefined);

  if (installments.purchases.length === 0 && !installments.months.some((m) => m.recurring > 0)) {
    return (
      <EmptyState
        icon={Layers}
        title="Nenhuma compra parcelada ainda"
        description="As parcelas vêm da fatura do cartão importada (coluna Parcela, ex.: 3/10). Importe a fatura do C6 em Lançamentos e as compras parceladas aparecem aqui, com o que falta pagar."
        action={
          <Button asChild>
            <Link to={paths.finance.transactions}>
              <FileUp aria-hidden="true" />
              Ir para Lançamentos
            </Link>
          </Button>
        }
        className="py-16"
      />
    );
  }

  return (
    <div className="@container">
      <div className="grid gap-6">
        <WidgetCard title="Resumo" icon={Wallet}>
          <InstallmentsMetrics installments={installments} />
        </WidgetCard>

        <WidgetCard
          title="Faturas dos próximos 12 meses"
          icon={ChartColumn}
          headerExtra={<CommitmentLegend />}
        >
          <CommitmentChart months={installments.months} />
          {missingCycle.length > 0 && (
            <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Recorrentes de {missingCycle.join(", ")} ficam de fora: informe o dia de fechamento e
              de vencimento do cartão em Contas.
            </p>
          )}
        </WidgetCard>

        <WidgetCard title="Mês a mês" icon={Table2}>
          <CommitmentTable months={installments.months} purchases={installments.purchases} />
        </WidgetCard>

        <WidgetCard title="Compras parceladas em andamento" icon={Layers}>
          {active.length === 0 ? (
            <EmptyState
              icon={CircleCheck}
              title="Nenhuma parcela em aberto"
              className="border-0 py-6"
            />
          ) : (
            <InstallmentList
              label="Compras parceladas em andamento"
              purchases={active}
              accounts={accounts}
              categories={categories}
            />
          )}
        </WidgetCard>

        {finished.length > 0 && (
          <WidgetCard title="Quitadas" icon={CircleCheck}>
            <InstallmentList
              label="Compras parceladas quitadas"
              purchases={finished}
              accounts={accounts}
              categories={categories}
            />
          </WidgetCard>
        )}
      </div>
    </div>
  );
}
