import {
  ArrowDownToLine,
  CreditCard,
  Info,
  Landmark,
  Table2,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { ResourceView } from "@/components/shared/resource-view";
import { WidgetCard } from "@/components/shared/widget-card";
import { InstallmentsImpactCard } from "@/features/finance/components/installments-impact-card";
import { Metric } from "@/features/finance/components/finance-metrics";
import { ProjectionChart, ProjectionLegend } from "@/features/finance/components/projection-chart";
import { ProjectionTable } from "@/features/finance/components/projection-table";
import { monthName } from "@/features/finance/domain/analytics";
import {
  installmentsTotal,
  lowestBalance,
  projectionPoints,
} from "@/features/finance/domain/projection";
import { type ProjectionData } from "@/features/finance/hooks/use-finance";
import { type AsyncResource } from "@/hooks/use-async-resource";
import { formatCents } from "@/lib/format";

/** "R$ 1.476,67 em gastos e R$ 60,00 em receitas avulsos", sem as partes zeradas. */
function estimateText(expenses: number, income: number): string {
  const parts = [
    expenses > 0 ? `${formatCents(expenses)} em gastos` : null,
    income > 0 ? `${formatCents(income)} em receitas` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? "R$ 0,00 em avulsos" : `${parts.join(" e ")} avulsos`;
}

/** Saldo previsto dos próximos meses, com os valores conhecidos e a estimativa separados. */
export function ProjectionView({ resource }: { resource: AsyncResource<ProjectionData> }) {
  return (
    <ResourceView resource={resource} loadingLabel="Calculando a projeção…">
      {(data) => <ProjectionContent data={data} />}
    </ResourceView>
  );
}

function ProjectionContent({ data }: { data: ProjectionData }) {
  const { projection } = data;
  const last = projection.months.at(-1);
  const lowest = lowestBalance(projection.months);
  const installments = installmentsTotal(projection.months);
  const { estimate } = projection;
  const cards = projection.cardsWithoutCycle
    .map((id) => data.accounts.find((account) => account.id === id)?.name)
    .filter((name) => name !== undefined);

  return (
    <div className="@container">
      <div className="grid gap-6">
        <WidgetCard title="Próximos 6 meses" icon={Wallet}>
          <dl className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            <Metric
              label="Saldo hoje"
              value={formatCents(projection.startBalance)}
              note="contas do dia a dia, sem investimentos"
              icon={Landmark}
              tone="primary"
            />
            <Metric
              label={
                last === undefined ? "Saldo previsto" : `Saldo previsto em ${monthName(last.month)}`
              }
              value={last === undefined ? "—" : formatCents(last.balance)}
              note={
                last === undefined
                  ? undefined
                  : `só com os conhecidos: ${formatCents(last.balanceKnown)}`
              }
              icon={TrendingUp}
              tone={last !== undefined && last.balance < 0 ? "danger" : "success"}
            />
            <Metric
              label="Menor saldo previsto"
              value={lowest === null ? "—" : formatCents(lowest.balance)}
              note={lowest === null ? undefined : `no fim de ${monthName(lowest.month)}`}
              icon={ArrowDownToLine}
              tone={lowest !== null && lowest.balance < 0 ? "danger" : "primary"}
            />
            <Metric
              label="Parcelas no período"
              value={formatCents(installments)}
              note={
                projection.installmentsFinalMonth === null
                  ? "nenhuma prevista"
                  : `a última em ${monthName(projection.installmentsFinalMonth)}`
              }
              icon={CreditCard}
              tone="danger"
            />
          </dl>
          <ul className="mt-3 grid gap-1.5 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {estimate.months === 0
                ? "Ainda não há meses completos de histórico: nada é estimado, só os valores conhecidos (recorrentes, parcelas e lançamentos já registrados)."
                : `Estimativa: média de ${estimateText(estimate.expenses, estimate.income)} por mês (${estimate.months === 1 ? "último mês" : `últimos ${estimate.months} meses`}, sem recorrentes nem parcelas), menos o que já está lançado em cada mês. É uma média, não um valor registrado.`}
            </li>
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Não entram: transferências e aplicações, as contas de investimentos e recorrentes
              atrasadas (confira em Recorrentes).
            </li>
            {projection.unlinkedRecurring > 0 && (
              <li className="flex items-start gap-2 text-warning">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {`${projection.unlinkedRecurring === 1 ? "1 vencimento de recorrente" : `${projection.unlinkedRecurring} vencimentos de recorrentes`} dos últimos meses sem lançamento vinculado. Se já foram pagos ou recebidos, vincule-os em Recorrentes: senão o lançamento entra na média dos avulsos e a projeção conta o mesmo valor duas vezes.`}
              </li>
            )}
            {cards.length > 0 && (
              <li className="flex items-start gap-2">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {`${cards.join(", ")} sem os dias da fatura: as recorrentes ${cards.length === 1 ? "dele" : "deles"} entram na data da compra. Informe o fechamento e o vencimento em Contas.`}
              </li>
            )}
          </ul>
        </WidgetCard>

        <WidgetCard title="Saldo previsto" icon={TrendingUp} headerExtra={<ProjectionLegend />}>
          <ProjectionChart points={projectionPoints(projection)} />
        </WidgetCard>

        <WidgetCard title="Mês a mês" icon={Table2}>
          <ProjectionTable months={projection.months} />
        </WidgetCard>

        <InstallmentsImpactCard
          months={projection.months}
          finalMonth={projection.installmentsFinalMonth}
        />
      </div>
    </div>
  );
}
